import "server-only"
import { timingSafeEqual } from "node:crypto"
import { stripValidCookiePrefix } from "../http/cookies"
import { decrypt, DecryptError } from "../http/encrypter"
import { recallerCookieName } from "../http/sessionGuard"
import type { BridgeDeps, OutgoingCookie, SessionUser } from "./types"
import type { CookieOptions } from "./sessionWriter"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FORGET_MINUTES = 2628000

export type Recalled = { kind: "user"; user: SessionUser } | { kind: "guest" } | { kind: "invalid-id" }

export function recallerOf(cookies: Map<string, string>, deps: Pick<BridgeDeps, "config">): { id: string; token: string } | null {
  const raw = cookies.get(recallerCookieName())
  if (raw === undefined) return null
  let plain: string | null
  try {
    plain = stripValidCookiePrefix(recallerCookieName(), decrypt(raw, deps.config.key, false), deps.config.key)
  } catch (error) {
    if (error instanceof DecryptError) return null
    throw error
  }
  if (plain === null || !plain.includes("|")) return null
  const segments = plain.split("|")
  if (segments.length < 3 || segments[0].trim() === "" || segments[1].trim() === "") return null
  return { id: segments[0], token: segments[1] }
}

function sameToken(known: string, given: string): boolean {
  const left = Buffer.from(known)
  const right = Buffer.from(given)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function recallUser(cookies: Map<string, string>, deps: Pick<BridgeDeps, "config" | "store">): Promise<Recalled> {
  const recaller = recallerOf(cookies, deps)
  if (recaller === null) return { kind: "guest" }
  if (!UUID.test(recaller.id)) return { kind: "invalid-id" }
  const user = await deps.store.findUser(recaller.id)
  const token = user?.rememberToken ?? null
  if (user === null || token === null || token === "" || !sameToken(token, recaller.token)) return { kind: "guest" }
  return { kind: "user", user }
}

export function forgetRecallerCookie(options: CookieOptions, now: number, value: string): OutgoingCookie {
  return {
    name: recallerCookieName(),
    value,
    expires: now - FORGET_MINUTES * 60,
    maxAge: 0,
    path: options.path,
    domain: options.domain,
    secure: options.secure,
    httpOnly: true,
    sameSite: options.sameSite,
  }
}
