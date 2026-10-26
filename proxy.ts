import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) return NextResponse.redirect(new URL("/login", req.url));
    if (role !== "ADMIN") return NextResponse.redirect(new URL("/dashboard", req.url));
    return;
  }

  if (
    (pathname.startsWith("/dashboard") ||
      pathname.startsWith("/stats") ||
      pathname.startsWith("/tracker") ||
      pathname.startsWith("/calendar") ||
      pathname.startsWith("/notes") ||
      pathname.startsWith("/watch") ||
      pathname.startsWith("/daily")) &&
    !isLoggedIn
  ) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/stats/:path*", "/tracker/:path*", "/calendar/:path*", "/notes/:path*", "/watch/:path*", "/daily/:path*", "/admin/:path*"],
};
