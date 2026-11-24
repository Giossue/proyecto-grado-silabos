import { createRedisRateLimiter } from "../redis/rateLimiter"
import { redisPrefix, sharedRedis } from "../redis/connection"
import { laravelHttpError } from "./responses"

export type RateLimit = { key: string; maxAttempts: number; decaySeconds: number }

export type RateLimitAttempt = { limited: false; hits: number } | { limited: true; availableAt: number }

export interface RateLimiter {
  attempt(key: string, maxAttempts: number, decaySeconds: number, now: number): RateLimitAttempt | Promise<RateLimitAttempt>
  attempts(key: string, now: number): number | Promise<number>
}

type Window = { attempts: number; availableAt: number }

export function createRateLimiter() {
  const windows = new Map<string, Window>()
  const live = (key: string, now: number): Window | null => {
    const window = windows.get(key)
    if (!window) return null
    if (window.availableAt <= now) {
      windows.delete(key)
      return null
    }
    return window
  }
  return {
    attempts: (key: string, now: number): number => live(key, now)?.attempts ?? 0,
    attempt(key: string, maxAttempts: number, decaySeconds: number, now: number): RateLimitAttempt {
      const window = live(key, now)
      if (window && window.attempts >= maxAttempts) return { limited: true, availableAt: window.availableAt }
      if (window) window.attempts += 1
      else windows.set(key, { attempts: 1, availableAt: now + decaySeconds })
      return { limited: false, hits: window?.attempts ?? 1 }
    },
  } satisfies RateLimiter
}

const globalForLimiter = globalThis as unknown as { laravelRateLimiter?: RateLimiter }

export function sharedRateLimiter(): RateLimiter {
  globalForLimiter.laravelRateLimiter ??= createRedisRateLimiter(sharedRedis(), `${redisPrefix()}throttle:`)
  return globalForLimiter.laravelRateLimiter
}

export type Throttle = {
  hit(): Promise<Response | null>
  decorate(response: Response): Response
}

export function throttle(limiter: RateLimiter, limit: RateLimit, now: () => number): Throttle {
  let remaining: number | null = null
  return {
    async hit() {
      const current = now()
      const attempt = await limiter.attempt(limit.key, limit.maxAttempts, limit.decaySeconds, current)
      if (attempt.limited) {
        const response = laravelHttpError(429, "Too Many Attempts.")
        response.headers.set("X-RateLimit-Limit", String(limit.maxAttempts))
        response.headers.set("X-RateLimit-Remaining", "0")
        response.headers.set("Retry-After", String(Math.max(0, attempt.availableAt - current)))
        response.headers.set("X-RateLimit-Reset", String(attempt.availableAt))
        return response
      }
      remaining = limit.maxAttempts - attempt.hits
      return null
    },
    decorate(response) {
      if (remaining === null || response.headers.has("x-ratelimit-limit")) return response
      response.headers.set("X-RateLimit-Limit", String(limit.maxAttempts))
      response.headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)))
      return response
    },
  }
}
