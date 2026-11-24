import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@pokepet/core", "@pokepet/sprite-engine", "@pokepet/ui"],
  // Sheets are immutable per pack version; let browsers and Vercel's CDN cache them.
  async headers() {
    return [
      {
        source: "/packs/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default config;
