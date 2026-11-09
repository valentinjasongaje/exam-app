import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Video-question pictures go through a server action (already shrunk in the browser).
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  // Private study app: tell crawlers not to index anything, including
  // non-HTML responses (API routes, the calendar feed) that can't carry a meta tag.
  // Videos, topics and the library moved from the Tracker to Lessons.
  async redirects() {
    return [
      { source: "/tracker/videos", destination: "/lessons", permanent: false },
      { source: "/tracker/topics", destination: "/lessons/topics", permanent: false },
      { source: "/tracker/library", destination: "/lessons/library", permanent: false },
    ];
  },
  // Pictures live in a public R2 bucket but are served from this app's own address
  // (/img/<file>): some networks can't resolve the bucket's r2.dev name. See lib/image-url.ts.
  async rewrites() {
    const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
    return base ? [{ source: "/img/:path*", destination: `${base}/:path*` }] : [];
  },
  async headers() {
    return [
      { source: "/img/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" }],
      },
    ];
  },
};

export default nextConfig;
