import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authUrl, requestOrigin } from "@/lib/google-drive";

/** Starts the Google consent screen for Drive access (drive.file only). */
export async function GET(req: Request) {
  const session = await auth();
  const origin = requestOrigin(req.headers);
  if (!session?.user) return NextResponse.redirect(`${origin}/login`);
  if (session.user.role !== "ADMIN") return NextResponse.redirect(`${origin}/lessons`);
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set("drive_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/drive",
    maxAge: 600,
  });
  return res;
}
