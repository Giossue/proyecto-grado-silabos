import "server-only"
import type { Redis } from "ioredis"
import type { RateLimitAttempt, RateLimiter } from "../laravel/throttle"

const ATTEMPT_SCRIPT = `local attempts = tonumber(redis.call("get", KEYS[1]) or "0")
if attempts >= tonumber(ARGV[1]) then
  local timer = redis.call("get", KEYS[2])
  if timer then
    return {1, tonumber(timer)}
  end
  redis.call("del", KEYS[1])
end
redis.call("set", KEYS[2], ARGV[3], "EX", ARGV[2], "NX")
redis.call("set", KEYS[1], 0, "EX", ARGV[2], "NX")
return {0, redis.call("incr", KEYS[1])}`

export function createRedisRateLimiter(redis: Redis, prefix: string): RateLimiter {
  return {
    async attempt(key, maxAttempts, decaySeconds, now): Promise<RateLimitAttempt> {
      const [limited, value] = (await redis.eval(ATTEMPT_SCRIPT, 2, `${prefix}${key}`, `${prefix}${key}:timer`, maxAttempts, decaySeconds, now + decaySeconds)) as [number, number]
      return limited === 1 ? { limited: true, availableAt: value } : { limited: false, hits: value }
    },
    async attempts(key) {
      return Number((await redis.get(`${prefix}${key}`)) ?? 0)
    },
  }
}
