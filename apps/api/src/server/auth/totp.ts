import { createHash } from "node:crypto"
import type { Redis } from "ioredis"
import { redisPrefix } from "../redis/connection"

export const TOTP_PERIOD = 30
export const TOTP_WINDOW = 1
const REPLAY_SECONDS = TOTP_PERIOD * (2 * TOTP_WINDOW + 1)
const CACHE_KEY_PREFIX = "two-factor-used-code:"

export interface TotpReplayGuard {
  claim(userId: string, code: string): Promise<boolean>
  release(userId: string, code: string): Promise<void>
}

export function replayCacheKey(userId: string, code: string): string {
  return CACHE_KEY_PREFIX + createHash("sha256").update(`${userId}|${code}`).digest("hex")
}

export type ReplayRedis = Pick<Redis, "set" | "del">

export function redisReplayGuard(connection: ReplayRedis | (() => ReplayRedis), prefix?: string): TotpReplayGuard {
  const redis = () => (typeof connection === "function" ? connection() : connection)
  const keyOf = (userId: string, code: string) => (prefix ?? redisPrefix()) + replayCacheKey(userId, code)
  return {
    async claim(userId, code) {
      return (await redis().set(keyOf(userId, code), "1", "EX", REPLAY_SECONDS, "NX")) === "OK"
    },
    async release(userId, code) {
      await redis().del(keyOf(userId, code))
    },
  }
}

export function memoryReplayGuard(): TotpReplayGuard {
  const used = new Set<string>()
  return {
    async claim(userId, code) {
      const key = replayCacheKey(userId, code)
      if (used.has(key)) return false
      used.add(key)
      return true
    },
    async release(userId, code) {
      used.delete(replayCacheKey(userId, code))
    },
  }
}
