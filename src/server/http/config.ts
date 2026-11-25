import "server-only"
import type { BridgeConfig } from "../auth/types"
import { parseAppKey } from "./encrypter"

export function strSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/@/g, "-at-")
    .replace(/[^-\p{L}\p{N}\s]+/gu, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

let cached: BridgeConfig | null = null

export function sessionConfig(): BridgeConfig {
  if (cached) return cached
  const appKey = process.env.APP_KEY
  if (!appKey) throw new Error("APP_KEY is not configured.")
  const appName = process.env.APP_NAME ?? "Sílabos UEB"
  cached = {
    key: parseAppKey(appKey),
    appKey,
    cookieName: process.env.SESSION_COOKIE ?? `${strSlug(appName)}-session`,
    lifetimeMinutes: Number(process.env.SESSION_LIFETIME ?? 240),
    statefulDomains: (process.env.STATEFUL_DOMAINS ?? "localhost:3000")
      .split(",")
      .map((domain) => domain.trim())
      .filter((domain) => domain !== ""),
  }
  return cached
}
