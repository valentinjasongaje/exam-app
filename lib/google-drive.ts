import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Google Drive for review-video uploads.
 *
 * Connection is separate from sign-in (Auth.js only asks for identity):
 * /api/drive/connect → Google consent for the `drive.file` scope →
 * /api/drive/callback stores the refresh token, encrypted. `drive.file`
 * means the app can only see and delete files it uploaded itself, nothing
 * else in the user's Drive.
 *
 * Uploads go browser → Google directly (resumable upload) so 300–600 MB files
 * never pass through Vercel; the server only hands the owner a short-lived
 * access token and verifies the finished file.
 */

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FOLDER_NAME = "ECE Review Videos";
const API = "https://www.googleapis.com/drive/v3";

// ---------- token encryption ----------

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`drive-token:${secret}`).digest();
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(stored: string) {
  const [iv, tag, enc] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ---------- OAuth ----------

export function redirectUri(origin: string) {
  return `${origin}/api/drive/callback`;
}

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: `${DRIVE_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string, origin: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new DriveError(`Token exchange failed: ${data.error_description ?? data.error ?? res.status}`);
  return data as { access_token: string; refresh_token?: string; scope: string; id_token?: string };
}

export class DriveError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

/** Fresh access token for the user's Drive, or a DriveError(401) if not connected / revoked. */
export async function accessTokenFor(userId: string) {
  const conn = await prisma.driveConnection.findUnique({ where: { userId } });
  if (!conn) throw new DriveError("Google Drive isn't connected.", 401);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: decryptToken(conn.refreshTokenEnc),
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === "invalid_grant") {
      // Revoked in Google account settings, or expired (Testing-mode apps: 7 days).
      await prisma.driveConnection.delete({ where: { userId } });
      throw new DriveError("Google Drive access expired. Connect it again.", 401);
    }
    throw new DriveError(`Couldn't refresh Drive access: ${data.error ?? res.status}`);
  }
  return { token: data.access_token as string, expiresIn: Number(data.expires_in) || 3600, conn };
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DriveError(data?.error?.message ?? `Drive request failed (${res.status})`, res.status);
  return data as T;
}

/** Ensures the app's upload folder exists (recreating it if the user deleted it). */
export async function ensureFolder(userId: string, token: string, folderId: string | null) {
  if (folderId) {
    try {
      const f = await api<{ id: string; trashed: boolean }>(token, `/files/${folderId}?fields=id,trashed`);
      if (!f.trashed) return folderId;
    } catch (e) {
      if (!(e instanceof DriveError) || e.status !== 404) throw e;
    }
  }
  const created = await api<{ id: string }>(token, "/files?fields=id", {
    method: "POST",
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  await prisma.driveConnection.update({ where: { userId }, data: { folderId: created.id } });
  return created.id;
}

export type DriveFile = { id: string; name: string; size?: string; appProperties?: Record<string, string>; trashed?: boolean };

export function getFile(token: string, id: string) {
  return api<DriveFile>(token, `/files/${id}?fields=id,name,size,appProperties,trashed`);
}

/** Files the app uploaded into its folder (drive.file only ever sees those). */
export async function listUploads(token: string, folderId: string) {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const page = await api<{ files: DriveFile[]; nextPageToken?: string }>(
      token,
      `/files?q=${q}&fields=nextPageToken,files(id,name,size,appProperties)&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`
    );
    out.push(...page.files);
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

/** Permanently deletes a file the app uploaded (frees the space right away, unlike trash). */
export function deleteFile(token: string, id: string) {
  return api<void>(token, `/files/${id}`, { method: "DELETE" });
}

export async function storageQuota(token: string) {
  const a = await api<{ storageQuota: { limit?: string; usage: string } }>(token, "/about?fields=storageQuota");
  const limit = a.storageQuota.limit ? Number(a.storageQuota.limit) : null;
  const usage = Number(a.storageQuota.usage);
  return { limit, usage, free: limit === null ? null : Math.max(0, limit - usage) };
}

export async function revoke(userId: string) {
  const conn = await prisma.driveConnection.findUnique({ where: { userId } });
  if (!conn) return;
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptToken(conn.refreshTokenEnc))}`, {
      method: "POST",
    });
  } catch {
    /* best effort */
  }
  await prisma.driveConnection.delete({ where: { userId } });
}

export function requestOrigin(headers: Headers) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
