// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createRedisRateLimiter } from "../redis/rateLimiter"
import { clearPrefix, testRedis, testRedisUrl } from "../redis/testing"
import { createRateLimiter, throttle, type RateLimiter } from "./throttle"

const limit = { key: "k", maxAttempts: 2, decaySeconds: 60 }
const PREFIX = "t11a-test:throttle:"

function behavesLikeThrottle(limiter: () => RateLimiter) {
  it("counts each hit in a fixed window and answers 429 with Laravel's headers and body", async () => {
    const store = limiter()
    let now = 1000
    const first = throttle(store, limit, () => now)
    expect(await first.hit()).toBeNull()
    expect(first.decorate(new Response("ok")).headers.get("x-ratelimit-remaining")).toBe("1")
    now = 1010
    const second = throttle(store, limit, () => now)
    expect(await second.hit()).toBeNull()
    const decorated = second.decorate(new Response("ok"))
    expect(decorated.headers.get("x-ratelimit-limit")).toBe("2")
    expect(decorated.headers.get("x-ratelimit-remaining")).toBe("0")
    now = 1020
    const third = await throttle(store, limit, () => now).hit()
    expect(third?.status).toBe(429)
    expect(third?.headers.get("content-type")).toBe("application/json")
    expect(await third?.text()).toBe('{\n    "message": "Too Many Attempts."\n}')
    expect(third?.headers.get("retry-after")).toBe("40")
    expect(third?.headers.get("x-ratelimit-reset")).toBe("1060")
    expect(third?.headers.get("x-ratelimit-limit")).toBe("2")
    expect(third?.headers.get("x-ratelimit-remaining")).toBe("0")
    expect(await store.attempts("k", now)).toBe(2)
  })

  it("keeps each key apart and leaves untouched responses and Laravel's own headers alone", async () => {
    const store = limiter()
    const one = throttle(store, limit, () => 0)
    expect(one.decorate(new Response("ok")).headers.has("x-ratelimit-limit")).toBe(false)
    await one.hit()
    await one.hit()
    expect(await throttle(store, { ...limit, key: "other" }, () => 0).hit()).toBeNull()
    const forwarded = new Response("x", { headers: { "x-ratelimit-limit": "20", "x-ratelimit-remaining": "19" } })
    expect(one.decorate(forwarded).headers.get("x-ratelimit-remaining")).toBe("19")
  })
}

describe("throttle with the in-memory limiter", () => {
  behavesLikeThrottle(createRateLimiter)

  it("opens a new window once the old one is over", async () => {
    const store = createRateLimiter()
    let now = 1000
    await throttle(store, limit, () => now).hit()
    await throttle(store, limit, () => now).hit()
    now = 1060
    expect(await throttle(store, limit, () => now).hit()).toBeNull()
    expect(store.attempts("k", now)).toBe(1)
  })
})

describe.skipIf(testRedisUrl() === null)("throttle with the Redis limiter", () => {
  const redis = testRedis()

  beforeEach(() => clearPrefix(redis, PREFIX))
  afterAll(async () => {
    await clearPrefix(redis, PREFIX)
    await redis.quit()
  })

  behavesLikeThrottle(() => createRedisRateLimiter(redis, PREFIX))

  it("stores the counter and the timer with the window as expiry, like RateLimiter::hit()", async () => {
    const store = createRedisRateLimiter(redis, PREFIX)
    await throttle(store, limit, () => 5000).hit()
    expect(await redis.get(`${PREFIX}k`)).toBe("1")
    expect(await redis.get(`${PREFIX}k:timer`)).toBe("5060")
    expect(await redis.ttl(`${PREFIX}k`)).toBeGreaterThan(55)
    expect(await redis.ttl(`${PREFIX}k:timer`)).toBeGreaterThan(55)
  })

  it("lets requests through again when the window expires in Redis", async () => {
    const store = createRedisRateLimiter(redis, PREFIX)
    const short = { key: "short", maxAttempts: 1, decaySeconds: 1 }
    expect(await throttle(store, short, () => 100).hit()).toBeNull()
    expect((await throttle(store, short, () => 100).hit())?.status).toBe(429)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(await throttle(store, short, () => 101).hit()).toBeNull()
  })

  it("resets the counter when the timer is gone, like tooManyAttempts()", async () => {
    const store = createRedisRateLimiter(redis, PREFIX)
    await redis.set(`${PREFIX}k`, "5", "EX", 60)
    expect(await throttle(store, limit, () => 0).hit()).toBeNull()
    expect(await redis.get(`${PREFIX}k`)).toBe("1")
  })

  it("counts concurrent hits exactly once each", async () => {
    const store = createRedisRateLimiter(redis, PREFIX)
    const wide = { key: "wide", maxAttempts: 10, decaySeconds: 60 }
    const results = await Promise.all(Array.from({ length: 15 }, () => throttle(store, wide, () => 0).hit()))
    expect(results.filter((result) => result === null)).toHaveLength(10)
    expect(results.filter((result) => result?.status === 429)).toHaveLength(5)
  })
})
