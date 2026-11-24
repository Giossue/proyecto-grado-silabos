import "server-only"
import { createHash, timingSafeEqual } from "node:crypto"
import { sql, type SQL } from "drizzle-orm"
import { HOTP, Secret } from "otpauth"

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

export type CacheExecutor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

const SERIALIZED_INT = /^i:(-?\d+);$/

export function laravelCachePrefix(env: NodeJS.ProcessEnv = process.env): string {
  return env.LARAVEL_CACHE_PREFIX ?? "silabos-ueb"
}

export function databaseReplayCache(executor: CacheExecutor, prefix: string, now: () => number): TotpReplayCache {
  return {
    async get(key) {
      const [row] = (await executor.execute(sql`select value, expiration from datos_temporales where key = ${prefix + key}`)).rows as {
        value: string
        expiration: string | number
      }[]
      if (!row) return null
      if (Number(row.expiration) <= now()) {
        await executor.execute(sql`delete from datos_temporales where key = ${prefix + key} and expiration <= ${now()}`)
        return null
      }
      const match = SERIALIZED_INT.exec(row.value)
      return match ? Number(match[1]) : null
    },
    async put(key, value, seconds) {
      await executor.execute(sql`insert into datos_temporales (key, value, expiration) values (${prefix + key}, ${`i:${value};`}, ${now() + seconds})
        on conflict (key) do update set value = excluded.value, expiration = excluded.expiration`)
    },
  }
}
