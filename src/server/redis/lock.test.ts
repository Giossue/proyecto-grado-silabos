// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { LockTimeoutError, redisLock } from "./lock"
import { clearPrefix, testRedis, testRedisUrl } from "./testing"

const PREFIX = "t11a-test:lock:"

describe.skipIf(testRedisUrl() === null)("redisLock", () => {
  const redis = testRedis()

  beforeEach(() => clearPrefix(redis, PREFIX))
  afterAll(async () => {
    await clearPrefix(redis, PREFIX)
    await redis.quit()
  })

  it("lets one owner hold the lock until it releases it, like Cache::lock()->get()", async () => {
    const first = redisLock(redis, "report", 10, { prefix: PREFIX })
    const second = redisLock(redis, "report", 10, { prefix: PREFIX })
    expect(await first.acquire()).toBe(true)
    expect(await second.acquire()).toBe(false)
    expect(await second.release()).toBe(false)
    expect(await first.isOwnedByCurrentProcess()).toBe(true)
    expect(await redis.ttl(`${PREFIX}report`)).toBeGreaterThan(0)
    expect(await first.release()).toBe(true)
    expect(await second.acquire()).toBe(true)
  })

  it("runs the callback only when the lock is free and always releases it", async () => {
    const busy = redisLock(redis, "job", 10, { prefix: PREFIX })
    await busy.acquire()
    let runs = 0
    expect(await redisLock(redis, "job", 10, { prefix: PREFIX }).get(async () => ++runs)).toBe(false)
    await busy.release()
    expect(await redisLock(redis, "job", 10, { prefix: PREFIX }).get(async () => ++runs)).toBe(1)
    await expect(redisLock(redis, "job", 10, { prefix: PREFIX }).get(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom")
    expect(await redis.exists(`${PREFIX}job`)).toBe(0)
  })

  it("waits for a busy lock and gives up with LockTimeoutError after the given seconds", async () => {
    const holder = redisLock(redis, "wait", 10, { prefix: PREFIX })
    await holder.acquire()
    const waiting = redisLock(redis, "wait", 10, { prefix: PREFIX, sleepMilliseconds: 20 })
    setTimeout(() => void holder.release(), 60)
    expect(await waiting.block(1, async () => "done")).toBe("done")
    await holder.acquire()
    await expect(redisLock(redis, "wait", 10, { prefix: PREFIX, sleepMilliseconds: 20 }).block(0)).rejects.toBeInstanceOf(LockTimeoutError)
  })

  it("keeps a lock without expiry when seconds is 0 and lets another owner restore or force it", async () => {
    const lock = redisLock(redis, "forever", 0, { prefix: PREFIX })
    await lock.acquire()
    expect(await redis.ttl(`${PREFIX}forever`)).toBe(-1)
    const restored = redisLock(redis, "forever", 0, { prefix: PREFIX, owner: lock.owner })
    expect(await restored.release()).toBe(true)
    await lock.acquire()
    await redisLock(redis, "forever", 0, { prefix: PREFIX }).forceRelease()
    expect(await redis.exists(`${PREFIX}forever`)).toBe(0)
  })
})
