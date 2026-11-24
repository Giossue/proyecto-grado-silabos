// @vitest-environment node
import { describe, expect, it } from "vitest"
import { sendMailJob } from "../mail/sendMailJob"
import { QUEUE_NAMES, retryAfterSeconds } from "./config"
import { defineJob, jobOptions, JobTimeoutError, retryDelay } from "./job"
import { platformSmokeJob } from "./jobs/platformSmoke"
import { workerOptions } from "./workers"

describe("queue configuration", () => {
  it("keeps Laravel's four queues in worker priority order", () => {
    expect(QUEUE_NAMES).toEqual(["critica", "documentos", "ia", "general"])
  })

  it("reads retry_after like config/queue.php: QUEUE_RETRY_AFTER, then REDIS_QUEUE_RETRY_AFTER, then 960", () => {
    expect(retryAfterSeconds({})).toBe(960)
    expect(retryAfterSeconds({ REDIS_QUEUE_RETRY_AFTER: "180" })).toBe(180)
    expect(retryAfterSeconds({ QUEUE_RETRY_AFTER: "600", REDIS_QUEUE_RETRY_AFTER: "180" })).toBe(600)
    expect(retryAfterSeconds({ QUEUE_RETRY_AFTER: "300s" })).toBe(300)
    expect(retryAfterSeconds({ QUEUE_RETRY_AFTER: "" })).toBe(960)
  })

  it("hands a stalled job back after retry_after and runs one job per queue at a time", () => {
    const options = workerOptions(180)
    expect(options.lockDuration).toBe(180_000)
    expect(options.concurrency).toBe(1)
    expect(options.settings?.backoffStrategy).toBeTypeOf("function")
  })
})

describe("job options", () => {
  it("ports PlatformSmokeJob: critica, 3 tries, backoff 1, 5, 15 s, unique by key and RunsOnce", () => {
    const options = jobOptions(platformSmokeJob, { key: "smoke:abc" })
    expect(platformSmokeJob.queue).toBe("critica")
    expect(platformSmokeJob.timeout).toBe(30)
    expect(platformSmokeJob.runsOnce).toBe(true)
    expect(options).toEqual({
      attempts: 3,
      backoff: { type: "laravel" },
      jobId: "PlatformSmokeJob-smoke%3Aabc",
      removeOnComplete: true,
      removeOnFail: true,
    })
    expect([1, 2, 3, 4].map((attempt) => retryDelay(platformSmokeJob, attempt, new Error("x"), 180))).toEqual([1000, 5000, 15000, 15000])
  })

  it("gives queued mail the worker defaults: general, 3 tries, no backoff, 60 s, not unique", () => {
    const options = jobOptions(sendMailJob, { mailable: "workflow", to: "a@example.test", data: { name: "a", title: "t", body: "b", url: "u" } })
    expect(sendMailJob.queue).toBe("general")
    expect(options).toEqual({ attempts: 3, backoff: { type: "laravel" }, removeOnComplete: true, removeOnFail: true })
    expect(retryDelay(sendMailJob, 1, new Error("x"), 180)).toBe(0)
  })

  it("waits retry_after before retrying a job that timed out, as a killed Laravel worker does", () => {
    const job = defineJob<{ id: string }>({ name: "Slow", queue: "documentos", backoff: [5], handle: async () => {} })
    expect(retryDelay(job, 1, new JobTimeoutError("Slow"), 180)).toBe(180_000)
    expect(new JobTimeoutError("Slow").message).toBe("Slow has timed out.")
  })
})
