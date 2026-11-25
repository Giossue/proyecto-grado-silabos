import type { NextConfig } from "next"

const apiOrigin = (process.env.API_INTERNAL_URL ?? "http://localhost:8000").replace(/\/+$/, "")
const apiPaths = ["/api", "/api/:path*", "/logos/:path*", "/images/silabo/:path*", "/plantilla.schema.json"]

const nextConfig: NextConfig = {
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  experimental: {
    proxyTimeout: 600_000,
    proxyClientMaxBodySize: "64mb",
  },
  async rewrites() {
    return {
      beforeFiles: apiPaths.map((source) => ({ source, destination: `${apiOrigin}${source}` })),
      afterFiles: [],
      fallback: [],
    }
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
