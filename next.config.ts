import type { NextConfig } from "next";

const laravelUrl = (process.env.LARAVEL_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
const laravelFallback = (process.env.LARAVEL_FALLBACK ?? "on").trim().toLowerCase() !== "off";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: laravelFallback ? [{ source: "/logos/:path*", destination: `${laravelUrl}/logos/:path*` }] : [],
    };
  },
};

export default nextConfig;
