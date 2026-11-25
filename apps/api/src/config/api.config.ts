import { statefulDomains, trustedOriginsOf } from "../server/auth/betterAuth"

export const API_PREFIX = "api/v1"

export function apiPort(env: Record<string, string | undefined> = process.env): number {
  const port = Number(env.API_PORT ?? 8000)
  return Number.isInteger(port) && port > 0 ? port : 8000
}

export function webOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const frontend = (env.FRONTEND_URL ?? "").split(",").map((origin) => origin.trim()).filter((origin) => origin !== "")
  return [...new Set([...frontend, ...trustedOriginsOf(statefulDomains(env))])]
}
