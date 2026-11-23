import { laravelHttpError } from "./responses"

export type RateLimit = { key: string; maxAttempts: number; decaySeconds: number }

type Window = { attempts: number; availableAt: number }

export interface RateLimiter {
  attempts(key: string, now: number): number
  availableAt(key: string, now: number): number | null
  hit(key: string, decaySeconds: number, now: number): void
}

export function createRateLimiter(): RateLimiter {
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
    attempts: (key, now) => live(key, now)?.attempts ?? 0,
    availableAt: (key, now) => live(key, now)?.availableAt ?? null,
    hit(key, decaySeconds, now) {
      const window = live(key, now)
      if (window) window.attempts += 1
      else windows.set(key, { attempts: 1, availableAt: now + decaySeconds })
    },
  }
}

const globalForLimiter = globalThis as unknown as { laravelRateLimiter?: RateLimiter }

export function sharedRateLimiter(): RateLimiter {
  globalForLimiter.laravelRateLimiter ??= createRateLimiter()
  return globalForLimiter.laravelRateLimiter
}

export type Throttle = {
  hit(): Response | null
  decorate(response: Response): Response
}

export function throttle(limiter: RateLimiter, limit: RateLimit, now: () => number): Throttle {
  let counted = false
  return {
    hit() {
      const current = now()
      const availableAt = limiter.availableAt(limit.key, current)
      if (availableAt !== null && limiter.attempts(limit.key, current) >= limit.maxAttempts) {
        const response = laravelHttpError(429, "Too Many Attempts.")
        response.headers.set("X-RateLimit-Limit", String(limit.maxAttempts))
        response.headers.set("X-RateLimit-Remaining", "0")
        response.headers.set("Retry-After", String(Math.max(0, availableAt - current)))
        response.headers.set("X-RateLimit-Reset", String(availableAt))
        return response
      }
      limiter.hit(limit.key, limit.decaySeconds, current)
      counted = true
      return null
    },
    decorate(response) {
      if (!counted || response.headers.has("x-ratelimit-limit")) return response
      const remaining = limit.maxAttempts - limiter.attempts(limit.key, now())
      response.headers.set("X-RateLimit-Limit", String(limit.maxAttempts))
      response.headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)))
      return response
    },
  }
}
