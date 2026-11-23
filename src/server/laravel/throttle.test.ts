// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createRateLimiter, throttle } from "./throttle"

const limit = { key: "k", maxAttempts: 2, decaySeconds: 60 }

describe("throttle", () => {
  it("counts each hit in a fixed window and answers 429 with Laravel's headers and body", async () => {
    const limiter = createRateLimiter()
    let now = 1000
    const first = throttle(limiter, limit, () => now)
    expect(first.hit()).toBeNull()
    expect(first.decorate(new Response("ok")).headers.get("x-ratelimit-remaining")).toBe("1")
    now = 1010
    const second = throttle(limiter, limit, () => now)
    expect(second.hit()).toBeNull()
    const decorated = second.decorate(new Response("ok"))
    expect(decorated.headers.get("x-ratelimit-limit")).toBe("2")
    expect(decorated.headers.get("x-ratelimit-remaining")).toBe("0")
    now = 1020
    const third = throttle(limiter, limit, () => now).hit()
    expect(third?.status).toBe(429)
    expect(await third?.text()).toBe('{\n    "message": "Too Many Attempts."\n}')
    expect(third?.headers.get("retry-after")).toBe("40")
    expect(third?.headers.get("x-ratelimit-reset")).toBe("1060")
    expect(third?.headers.get("x-ratelimit-remaining")).toBe("0")
    now = 1060
    expect(throttle(limiter, limit, () => now).hit()).toBeNull()
  })

  it("keeps each key apart and leaves untouched responses and Laravel's own headers alone", () => {
    const limiter = createRateLimiter()
    const one = throttle(limiter, limit, () => 0)
    expect(one.decorate(new Response("ok")).headers.has("x-ratelimit-limit")).toBe(false)
    one.hit()
    one.hit()
    expect(throttle(limiter, { ...limit, key: "other" }, () => 0).hit()).toBeNull()
    const forwarded = new Response("x", { headers: { "x-ratelimit-limit": "20", "x-ratelimit-remaining": "19" } })
    expect(one.decorate(forwarded).headers.get("x-ratelimit-remaining")).toBe("19")
  })
})
