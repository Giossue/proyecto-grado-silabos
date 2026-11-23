import "server-only"
import type { BridgeConfig } from "../auth/types"
import { parseAppKey } from "./encrypter"

export function laravelSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/@/g, "-at-")
    .replace(/[^-\p{L}\p{N}\s]+/gu, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

export function laravelBaseUrl(): string {
  return (process.env.LARAVEL_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "")
}

let cached: BridgeConfig | null = null

export function laravelBridgeConfig(): BridgeConfig {
  if (cached) return cached
  const appKey = process.env.LARAVEL_APP_KEY
  if (!appKey) throw new Error("LARAVEL_APP_KEY is not configured.")
  const appName = process.env.LARAVEL_APP_NAME ?? "laravel"
  cached = {
    key: parseAppKey(appKey),
    appKey,
    cookieName: process.env.LARAVEL_SESSION_COOKIE ?? `${laravelSlug(appName)}-session`,
    lifetimeMinutes: Number(process.env.LARAVEL_SESSION_LIFETIME ?? 120),
    statefulDomains: (process.env.SANCTUM_STATEFUL_DOMAINS ?? "localhost:3000")
      .split(",")
      .map((domain) => domain.trim())
      .filter((domain) => domain !== ""),
  }
  return cached
}
