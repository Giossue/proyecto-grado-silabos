import "server-only"
import { createHash, timingSafeEqual } from "node:crypto"
import type { Redis } from "ioredis"
import { HOTP, Secret } from "otpauth"
import { redisPrefix } from "../redis/connection"

export const TOTP_PERIOD = 30
export const TOTP_DIGITS = 6
export const TOTP_WINDOW = 1
const SECRET_BYTES = 10
const CACHE_KEY_PREFIX = "fortify.2fa_codes."

export interface TotpReplayCache {
  get(key: string): Promise<number | null>
  put(key: string, value: number, seconds: number): Promise<void>
}

export function generateTotpSecret(): string {
  return new Secret({ size: SECRET_BYTES }).base32
}

export function totpCounter(nowSeconds: number): number {
  return Math.floor(nowSeconds / TOTP_PERIOD)
}

export function totpCode(secret: string, counter: number): string {
  return HOTP.generate({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: TOTP_DIGITS, counter })
}

function sameCode(known: string, given: string): boolean {
  const left = Buffer.from(known)
  const right = Buffer.from(given)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function replayCacheKey(code: string): string {
  return CACHE_KEY_PREFIX + createHash("md5").update(code).digest("hex")
}

export async function verifyTotp(secret: string, code: string, cache: TotpReplayCache, nowSeconds: number): Promise<boolean> {
  const key = replayCacheKey(code)
  const previous = await cache.get(key)
  const current = totpCounter(nowSeconds)
  const start = previous === null ? current - TOTP_WINDOW : Math.max(current - TOTP_WINDOW, previous + 1)
  for (let counter = start; counter <= current + TOTP_WINDOW; counter++) {
    if (!sameCode(totpCode(secret, counter), code)) continue
    await cache.put(key, previous === null ? current : counter, TOTP_WINDOW * 60)
    return true
  }
  return false
}

export type ReplayRedis = Pick<Redis, "get" | "set">

const INTEGER = /^-?\d+$/

export function redisReplayCache(connection: ReplayRedis | (() => ReplayRedis), prefix?: string): TotpReplayCache {
  const redis = () => (typeof connection === "function" ? connection() : connection)
  const keyOf = (key: string) => (prefix ?? redisPrefix()) + key
  return {
    async get(key) {
      const value = await redis().get(keyOf(key))
      return value !== null && INTEGER.test(value) ? Number(value) : null
    },
    async put(key, value, seconds) {
      await redis().set(keyOf(key), String(value), "EX", seconds)
    },
  }
}
