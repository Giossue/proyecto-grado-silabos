import type { NextConfig } from "next";

const laravelUrl = (process.env.LARAVEL_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");

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
      fallback: [
        { source: "/api/:path*", destination: `${laravelUrl}/api/:path*` },
        { source: "/sanctum/:path*", destination: `${laravelUrl}/sanctum/:path*` },
        { source: "/logos/:path*", destination: `${laravelUrl}/logos/:path*` },
      ],
    };
  },
};

export default nextConfig;
