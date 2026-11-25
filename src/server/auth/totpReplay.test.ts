// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { clearPrefix, testRedis, testRedisUrl } from "../redis/testing"
import { redisReplayGuard } from "./totp"

const PREFIX = "m5-test:replay:"
const USER = "a0000000-0000-4000-8000-000000000001"

describe.skipIf(testRedisUrl() === null)("redisReplayGuard, the 2FA replay protection kept in Redis", () => {
  const redis = testRedis()

  beforeEach(() => clearPrefix(redis, PREFIX))
  afterAll(async () => {
    await clearPrefix(redis, PREFIX)
    await redis.quit()
  })

  it("accepts a code once per user and refuses its reuse until it is released", async () => {
    const guard = redisReplayGuard(redis, PREFIX)
    expect(await guard.claim(USER, "123456")).toBe(true)
    expect(await guard.claim(USER, "123456")).toBe(false)
    expect(await guard.claim("a0000000-0000-4000-8000-000000000002", "123456")).toBe(true)
    await guard.release(USER, "123456")
    expect(await guard.claim(USER, "123456")).toBe(true)
    const ttl = await redis.ttl(`${PREFIX}${(await import("./totp")).replayCacheKey(USER, "123456")}`)
    expect(ttl).toBeGreaterThan(80)
    expect(ttl).toBeLessThanOrEqual(90)
  })
})
