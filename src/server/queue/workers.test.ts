// @vitest-environment node
import { Queue, type Worker } from "bullmq"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { clearPrefix, testRedis, testRedisUrl } from "../redis/testing"
import type { QueueName } from "./config"
import { createDispatcher } from "./dispatch"
import { defineJob } from "./job"
import { createWorkers } from "./workers"

const PREFIX = "t11a-test:workers"
const LOCK_PREFIX = "t11a-test:workers-locks:"

async function until(condition: () => boolean | Promise<boolean>, timeout = 5000) {
  const start = Date.now()
  while (!(await condition())) {
    if (Date.now() - start > timeout) throw new Error("Timed out waiting for the worker.")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe.skipIf(testRedisUrl() === null)("createWorkers", () => {
  const redis = testRedis()
  const queues = new Map<QueueName, Queue>()
  const queueFor = (name: QueueName) => {
    if (!queues.has(name)) queues.set(name, new Queue(name, { connection: redis, prefix: PREFIX }))
    return queues.get(name) as Queue
  }
  const dispatcher = createDispatcher(queueFor)
  let workers: Worker[] = []

  const start = (jobs: Parameters<typeof createWorkers>[0]["jobs"]) => {
    workers = createWorkers({ jobs, connectionUrl: testRedisUrl() as string, prefix: PREFIX, lockPrefix: LOCK_PREFIX, redis, retryAfter: 60, log: () => {} })
  }

  beforeEach(async () => {
    await clearPrefix(redis, PREFIX)
    await clearPrefix(redis, LOCK_PREFIX)
  })
  afterEach(async () => {
    await Promise.all(workers.map((worker) => worker.close()))
    workers = []
  })
  afterAll(async () => {
    await clearPrefix(redis, PREFIX)
    await clearPrefix(redis, LOCK_PREFIX)
    await Promise.all([...queues.values()].map((queue) => queue.close()))
    await redis.quit()
  })

  it("processes a job dispatched twice with the same unique id only once and removes it", async () => {
    const handled: string[] = []
    const job = defineJob<{ key: string }>({ name: "Smoke", queue: "critica", uniqueId: (data) => data.key, runsOnce: true, handle: async (data) => void handled.push(data.key) })
    await dispatcher.dispatch(job, { key: "smoke:1" })
    await dispatcher.dispatch(job, { key: "smoke:1" })
    start([job])
    await until(() => handled.length === 1)
    await until(async () => (await queueFor("critica").count()) === 0)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(handled).toEqual(["smoke:1"])
    expect(await queueFor("critica").getJobCounts("completed", "failed", "active")).toEqual({ completed: 0, failed: 0, active: 0 })
  })

  it("retries up to tries, then calls failed() once and keeps no failed job", async () => {
    const attempts: number[] = []
    const failures: string[] = []
    const job = defineJob<{ id: string }>({
      name: "Flaky",
      queue: "general",
      tries: 2,
      backoff: 0,
      handle: async (_data, context) => {
        attempts.push(context.attempt)
        throw new Error("SMTP is down")
      },
      failed: (data, error) => void failures.push(`${data.id}: ${error.message}`),
    })
    await dispatcher.dispatch(job, { id: "m-1" })
    start([job])
    await until(() => failures.length === 1)
    expect(attempts).toEqual([1, 2])
    expect(failures).toEqual(["m-1: SMTP is down"])
    expect(await queueFor("general").getJobCounts("failed", "wait", "delayed")).toEqual({ failed: 0, wait: 0, delayed: 0 })
  })

  it("recovers when a later attempt succeeds and does not call failed()", async () => {
    let calls = 0
    const failures: string[] = []
    const job = defineJob<null>({
      name: "Recovers",
      queue: "ia",
      backoff: 0,
      handle: async () => {
        calls += 1
        if (calls < 3) throw new Error("try again")
      },
      failed: () => void failures.push("failed"),
    })
    await dispatcher.dispatch(job, null)
    start([job])
    await until(() => calls === 3)
    await until(async () => (await queueFor("ia").count()) === 0)
    expect(failures).toEqual([])
  })
})
