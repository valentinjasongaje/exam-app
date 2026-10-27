import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DRIVE_SCOPE, encryptToken, exchangeCode, requestOrigin } from "@/lib/google-drive";

/** Google redirects here after the user allows (or denies) Drive access. */
export async function GET(req: Request) {
  const origin = requestOrigin(req.headers);
  const back = (status: string) => {
    const res = NextResponse.redirect(`${origin}/lessons?drive=${status}`);
    res.cookies.delete({ name: "drive_oauth_state", path: "/api/drive" });
    return res;
  };

  const session = await auth();
  if (!session?.user) return NextResponse.redirect(`${origin}/login`);
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith("drive_oauth_state="))
    ?.split("=")[1];
  if (!state || !cookieState || state !== cookieState) return back("error");
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code) return back("error");

  try {
    const tokens = await exchangeCode(code, origin);
    if (!tokens.scope.split(" ").includes(DRIVE_SCOPE)) return back("noscope");
    if (!tokens.refresh_token) return back("error");
    let email: string | null = null;
    if (tokens.id_token) {
      try {
        email = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString()).email ?? null;
      } catch {
        /* ignore */
      }
    }
    await prisma.driveConnection.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, googleEmail: email, refreshTokenEnc: encryptToken(tokens.refresh_token) },
      update: { googleEmail: email, refreshTokenEnc: encryptToken(tokens.refresh_token) },
    });
    return back("connected");
  } catch (e) {
    console.error("drive callback", e);
    return back("error");
  }
}
