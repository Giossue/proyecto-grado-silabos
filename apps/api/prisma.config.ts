import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { defineConfig } from "prisma/config"
import { envFiles } from "./src/config/workspace"

for (const file of envFiles()) if (existsSync(file)) loadEnvFile(file)

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
})
