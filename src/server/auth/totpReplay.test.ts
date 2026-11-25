// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { clearPrefix, testRedis, testRedisUrl } from "../redis/testing"
import { redisReplayCache, replayCacheKey, totpCode, totpCounter, verifyTotp } from "./totp"

const PREFIX = "t19-test:replay:"
const SECRET = "JBSWY3DPEHPK3PXP"
const NOW = 1_800_000_000

describe.skipIf(testRedisUrl() === null)("redisReplayCache, the 2FA replay protection Fortify kept in the cache", () => {
  const redis = testRedis()

  beforeEach(() => clearPrefix(redis, PREFIX))
  afterAll(async () => {
    await clearPrefix(redis, PREFIX)
    await redis.quit()
  })

  it("keeps the used counter of each code for the window in minutes and refuses its reuse", async () => {
    const cache = redisReplayCache(redis, PREFIX)
    const code = totpCode(SECRET, totpCounter(NOW))
    expect(await verifyTotp(SECRET, code, cache, NOW)).toBe(true)
    expect(await redis.get(`${PREFIX}${replayCacheKey(code)}`)).toBe(String(totpCounter(NOW)))
    expect(await redis.ttl(`${PREFIX}${replayCacheKey(code)}`)).toBeGreaterThan(55)
    expect(await redis.ttl(`${PREFIX}${replayCacheKey(code)}`)).toBeLessThanOrEqual(60)
    expect(await verifyTotp(SECRET, code, cache, NOW)).toBe(false)
  })

  it("answers null for a key it never stored or that holds something else", async () => {
    const cache = redisReplayCache(redis, PREFIX)
    expect(await cache.get("missing")).toBeNull()
    await redis.set(`${PREFIX}odd`, "abc")
    expect(await cache.get("odd")).toBeNull()
  })
})
