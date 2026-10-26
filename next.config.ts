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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" }],
      },
    ];
  },
};

export default nextConfig;
