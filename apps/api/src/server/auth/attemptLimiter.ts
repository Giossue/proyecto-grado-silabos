import type { Redis } from "ioredis"
import { redisPrefix, sharedRedis } from "../redis/connection"

export interface AttemptLimiter {
  tooManyAttempts(key: string, maxAttempts: number): Promise<boolean>
  hit(key: string, decaySeconds: number): Promise<number>
  clear(key: string): Promise<void>
  availableIn(key: string): Promise<number>
}

const HIT_SCRIPT = `redis.call("set", KEYS[2], ARGV[2], "EX", ARGV[1], "NX")
local added = redis.call("set", KEYS[1], 0, "EX", ARGV[1], "NX")
local hits = redis.call("incr", KEYS[1])
if not added and hits == 1 then
  redis.call("set", KEYS[1], 1, "EX", ARGV[1])
end
return hits`

export function createRedisAttemptLimiter(redis: Redis, prefix: string, now: () => number): AttemptLimiter {
  const key = (name: string) => `${prefix}${name}`
  const timer = (name: string) => `${prefix}${name}:timer`
  return {
    async tooManyAttempts(name, maxAttempts) {
      if (Number((await redis.get(key(name))) ?? 0) < maxAttempts) return false
      if ((await redis.exists(timer(name))) === 1) return true
      await redis.del(key(name))
      return false
    },
    async hit(name, decaySeconds) {
      return Number(await redis.eval(HIT_SCRIPT, 2, key(name), timer(name), decaySeconds, now() + decaySeconds))
    },
    async clear(name) {
      await redis.del(key(name), timer(name))
    },
    async availableIn(name) {
      return Math.max(0, Number((await redis.get(timer(name))) ?? 0) - now())
    },
  }
}

export function createMemoryAttemptLimiter(now: () => number): AttemptLimiter {
  const entries = new Map<string, { value: number; expiresAt: number }>()
  const read = (name: string) => {
    const entry = entries.get(name)
    if (entry && entry.expiresAt <= now()) entries.delete(name)
    return entries.get(name)
  }
  return {
    async tooManyAttempts(name, maxAttempts) {
      if ((read(name)?.value ?? 0) < maxAttempts) return false
      if (read(`${name}:timer`)) return true
      entries.delete(name)
      return false
    },
    async hit(name, decaySeconds) {
      if (!read(`${name}:timer`)) entries.set(`${name}:timer`, { value: now() + decaySeconds, expiresAt: now() + decaySeconds })
      const current = read(name)
      if (current) current.value += 1
      else entries.set(name, { value: 1, expiresAt: now() + decaySeconds })
      return read(name)?.value ?? 1
    },
    async clear(name) {
      entries.delete(name)
      entries.delete(`${name}:timer`)
    },
    async availableIn(name) {
      return Math.max(0, (read(`${name}:timer`)?.value ?? 0) - now())
    },
  }
}

const globalForAttempts = globalThis as unknown as { sharedAttempts?: AttemptLimiter }

export function sharedAttemptLimiter(): AttemptLimiter {
  globalForAttempts.sharedAttempts ??= createRedisAttemptLimiter(sharedRedis(), `${redisPrefix()}limiter:`, () => Math.floor(Date.now() / 1000))
  return globalForAttempts.sharedAttempts
}

export function lazyAttemptLimiter(): AttemptLimiter {
  return {
    tooManyAttempts: (key, maxAttempts) => sharedAttemptLimiter().tooManyAttempts(key, maxAttempts),
    hit: (key, decaySeconds) => sharedAttemptLimiter().hit(key, decaySeconds),
    clear: (key) => sharedAttemptLimiter().clear(key),
    availableIn: (key) => sharedAttemptLimiter().availableIn(key),
  }
}
