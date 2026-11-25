// @vitest-environment node
import { Queue } from "bullmq"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { clearPrefix, testRedis, testRedisUrl } from "../redis/testing"
import type { QueueName } from "./config"
import { createDispatcher, withAfterCommit } from "./dispatch"
import { defineJob } from "./job"

const PREFIX = "t11a-test:dispatch"

const exportJob = defineJob<{ id: string }>({ name: "Export", queue: "documentos", uniqueId: (data) => data.id, handle: async () => {} })
const plainJob = defineJob<{ id: string }>({ name: "Plain", queue: "general", handle: async () => {} })

function fakeTransaction() {
  const log: string[] = []
  const transaction = async <T>(work: () => Promise<T>): Promise<T> => {
    log.push("begin")
    try {
      const result = await work()
      log.push("commit")
      return result
    } catch (error) {
      log.push("rollback")
      throw error
    }
  }
  return { log, transaction }
}

describe("withAfterCommit", () => {
  it("runs the callbacks after the transaction commits, in order", async () => {
    const { log, transaction } = fakeTransaction()
    const result = await withAfterCommit((afterCommit) =>
      transaction(async () => {
        afterCommit(() => void log.push("dispatch 1"))
        afterCommit(async () => void log.push("dispatch 2"))
        log.push("write")
        return "saved"
      }),
    )
    expect(result).toBe("saved")
    expect(log).toEqual(["begin", "write", "commit", "dispatch 1", "dispatch 2"])
  })

  it("drops the callbacks when the transaction rolls back", async () => {
    const { log, transaction } = fakeTransaction()
    await expect(
      withAfterCommit((afterCommit) =>
        transaction(async () => {
          afterCommit(() => void log.push("dispatch"))
          throw new Error("conflict")
        }),
      ),
    ).rejects.toThrow("conflict")
    expect(log).toEqual(["begin", "rollback"])
  })
})

describe.skipIf(testRedisUrl() === null)("dispatch", () => {
  const redis = testRedis()
  const queues = new Map<QueueName, Queue>()
  const queueFor = (name: QueueName) => {
    if (!queues.has(name)) queues.set(name, new Queue(name, { connection: redis, prefix: PREFIX }))
    return queues.get(name) as Queue
  }
  const dispatcher = createDispatcher(queueFor)

  beforeEach(() => clearPrefix(redis, PREFIX))
  afterAll(async () => {
    await clearPrefix(redis, PREFIX)
    await Promise.all([...queues.values()].map((queue) => queue.close()))
    await redis.quit()
  })

  it("puts the job on its queue with Laravel's attempts and keeps one copy per unique id", async () => {
    const first = await dispatcher.dispatch(exportJob, { id: "e-1" })
    const second = await dispatcher.dispatch(exportJob, { id: "e-1" })
    await dispatcher.dispatch(exportJob, { id: "e-2" })
    expect(first).toBe("Export-e-1")
    expect(second).toBe(first)
    const waiting = await queueFor("documentos").getJobs(["wait"])
    expect(waiting.map((job) => job.id).sort()).toEqual(["Export-e-1", "Export-e-2"])
    expect(waiting[0].opts.attempts).toBe(3)
    expect(await queueFor("general").count()).toBe(0)
  })

  it("queues nothing when the transaction rolls back and exactly one job when it commits", async () => {
    const { transaction } = fakeTransaction()
    await expect(
      withAfterCommit((afterCommit) =>
        transaction(async () => {
          afterCommit(() => dispatcher.dispatch(plainJob, { id: "rolled-back" }))
          throw new Error("conflict")
        }),
      ),
    ).rejects.toThrow("conflict")
    expect(await queueFor("general").count()).toBe(0)
    await withAfterCommit((afterCommit) => transaction(async () => afterCommit(() => dispatcher.dispatch(plainJob, { id: "committed" }))))
    const jobs = await queueFor("general").getJobs(["wait"])
    expect(jobs.map((job) => job.data)).toEqual([{ id: "committed" }])
  })
})
