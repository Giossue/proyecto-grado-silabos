// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { clearPrefix, testRedis, testRedisUrl } from "../redis/testing"
import { defineJob, JobTimeoutError } from "./job"
import { runJob } from "./runner"

const PREFIX = "t11a-test:runner:"
const OVERLAP_KEY = `${PREFIX}laravel-queue-overlap:Export:e-1`
const context = { attempt: 1, jobId: "1" }

function gate() {
  let open = () => {}
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { open, opened }
}

describe.skipIf(testRedisUrl() === null)("runJob", () => {
  const redis = testRedis()
  const deps = { redis, prefix: PREFIX }

  beforeEach(() => clearPrefix(redis, PREFIX))
  afterAll(async () => {
    await clearPrefix(redis, PREFIX)
    await redis.quit()
  })

  it("discards a copy that arrives while the first one runs, like RunsOnce (WithoutOverlapping->dontRelease)", async () => {
    const release = gate()
    const started = gate()
    let runs = 0
    const job = defineJob<{ id: string }>({
      name: "Export",
      queue: "documentos",
      timeout: 120,
      uniqueId: (data) => data.id,
      runsOnce: true,
      handle: async () => {
        runs += 1
        started.open()
        await release.opened
      },
    })
    const first = runJob(job, { id: "e-1" }, context, deps)
    await started.opened
    expect(await redis.ttl(OVERLAP_KEY)).toBeGreaterThan(140)
    expect(await runJob(job, { id: "e-1" }, { ...context, jobId: "2" }, deps)).toBe("skipped")
    release.open()
    expect(await first).toBe("handled")
    expect(runs).toBe(1)
    expect(await redis.exists(OVERLAP_KEY)).toBe(0)
    expect(await runJob(job, { id: "e-1" }, context, deps)).toBe("handled")
    expect(runs).toBe(2)
  })

  it("releases the lock when the job throws, so the retry can run", async () => {
    let runs = 0
    const job = defineJob<{ id: string }>({
      name: "Export",
      queue: "documentos",
      uniqueId: (data) => data.id,
      runsOnce: true,
      handle: async () => {
        runs += 1
        if (runs === 1) throw new Error("PDF converter is down")
      },
    })
    await expect(runJob(job, { id: "e-1" }, context, deps)).rejects.toThrow("PDF converter is down")
    expect(await redis.exists(OVERLAP_KEY)).toBe(0)
    expect(await runJob(job, { id: "e-1" }, context, deps)).toBe("handled")
  })

  it("stops waiting after the job timeout and keeps the lock until it expires, like a killed worker", async () => {
    let signal: AbortSignal | null = null
    const job = defineJob<{ id: string }>({
      name: "Export",
      queue: "documentos",
      timeout: 0.05,
      uniqueId: (data) => data.id,
      runsOnce: true,
      handle: async (_data, jobContext) => {
        signal = jobContext.signal
        await new Promise((resolve) => setTimeout(resolve, 500))
      },
    })
    await expect(runJob(job, { id: "e-1" }, context, deps)).rejects.toBeInstanceOf(JobTimeoutError)
    expect((signal as AbortSignal | null)?.aborted).toBe(true)
    expect(await redis.exists(OVERLAP_KEY)).toBe(1)
  })

  it("runs jobs without RunsOnce directly and passes the attempt number", async () => {
    const attempts: number[] = []
    const job = defineJob<null>({ name: "Plain", queue: "general", handle: async (_data, jobContext) => void attempts.push(jobContext.attempt) })
    expect(await runJob(job, null, { attempt: 2, jobId: "9" }, deps)).toBe("handled")
    expect(attempts).toEqual([2])
    expect(await redis.keys(`${PREFIX}*`)).toEqual([])
  })
})
