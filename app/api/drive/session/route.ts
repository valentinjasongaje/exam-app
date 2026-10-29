import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DriveError, accessTokenFor, ensureFolder, requestOrigin } from "@/lib/google-drive";
import { WATCH_PLAN, planKey } from "@/lib/video-library";

/**
 * Opens a resumable upload on Google Drive for one plan video and returns
 * only the session URL; the browser then sends the file bytes straight to
 * Google (300–600 MB files can't pass through Vercel). The Google token never
 * leaves the server. The Origin header makes Google accept the browser's
 * cross-origin PUTs to that session.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const { localPath, size } = (await req.json().catch(() => ({}))) as { localPath?: string; size?: number };
  const plan = WATCH_PLAN.find((v) => v.localPath === localPath);
  if (!plan) return NextResponse.json({ error: "That video isn't in the watch plan." }, { status: 400 });
  if (size !== plan.bytes) return NextResponse.json({ error: "File size doesn't match the plan video." }, { status: 400 });

  try {
    const { token, conn } = await accessTokenFor(session.user.id);
    const folderId = await ensureFolder(session.user.id, token, conn.folderId);
    const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(plan.bytes),
        Origin: requestOrigin(req.headers),
      },
      body: JSON.stringify({ name: plan.file, parents: [folderId], appProperties: { planKey: planKey(plan.localPath) } }),
    });
    const url = init.headers.get("location");
    if (!init.ok || !url) {
      const body = await init.json().catch(() => ({}));
      throw new DriveError(body?.error?.message ?? `Drive refused the upload (${init.status}).`, init.status);
    }
    return NextResponse.json({ sessionUrl: url }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof DriveError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Drive error" }, { status });
  }
}
