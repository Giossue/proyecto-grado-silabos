import "server-only"
import { createHash, createHmac } from "node:crypto"

const SESSION_GUARD_CLASS = "Illuminate\\Auth\\SessionGuard"
const GUARD = "web"

const guardDigest = (): string => createHash("sha1").update(SESSION_GUARD_CLASS).digest("hex")

export const loginSessionKey = (): string => `login_${GUARD}_${guardDigest()}`

export const recallerCookieName = (): string => `remember_${GUARD}_${guardDigest()}`

export const passwordHashSessionKey = `password_hash_${GUARD}`

export function hashPasswordForCookie(passwordHash: string, appKey: string): string {
  return createHmac("sha256", appKey).update(passwordHash).digest("hex")
}
