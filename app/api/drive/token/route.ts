import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DriveError, accessTokenFor } from "@/lib/google-drive";
import { adminUserId } from "@/lib/shared-videos";

/**
 * Short-lived Drive access token for this user's own browser, used only by
 * the video service worker (public/drive-sw.js): Google requires the token in
 * an Authorization header to stream a file, which a <video> tag can't send.
 * The token has the drive.file scope (files this app uploaded) and lasts ~1 h.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  try {
    // The videos live on the admin's Drive (the shared library), so playback uses the admin's
    // drive.file access: it covers only files this app uploaded there.
    const adminId = await adminUserId();
    if (!adminId) return NextResponse.json({ error: "No video library is set up yet." }, { status: 404 });
    const { token, expiresIn } = await accessTokenFor(adminId);
    return NextResponse.json({ token, expiresIn }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof DriveError ? e.status ?? 500 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Drive error" }, { status });
  }
}
