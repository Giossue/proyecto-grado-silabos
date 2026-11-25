import { loadEnvConfig } from "@next/env"
import { defineConfig } from "drizzle-kit"

loadEnvConfig(process.cwd())

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/drizzle/schema.ts",
  out: "./src/db/drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
})
