import "server-only"
import { Worker, type Job, type WorkerOptions } from "bullmq"
import type { Redis } from "ioredis"
import { createRedis } from "../redis/connection"
import { QUEUE_NAMES, type QueueName } from "./config"
import { retryDelay, type AnyJobDefinition, type JobDefinition } from "./job"
import { runJob } from "./runner"

export type WorkerEvent = { event: "processed" | "skipped" | "failed"; job: string; id: string; attempt: number; message?: string }

export type WorkerSetup = {
  jobs: readonly AnyJobDefinition[]
  connectionUrl: string
  prefix: string
  lockPrefix: string
  redis: Redis
  retryAfter: number
  queues?: readonly QueueName[]
  log?: (event: WorkerEvent) => void
}

export function workerOptions(retryAfter: number, definitionOf: (name: string) => AnyJobDefinition | undefined = () => undefined): Pick<WorkerOptions, "concurrency" | "lockDuration" | "settings"> {
  return {
    concurrency: 1,
    lockDuration: retryAfter * 1000,
    settings: {
      backoffStrategy: (attemptsMade, _type, error, job) => retryDelay(definitionOf(job?.name ?? "") ?? {}, attemptsMade, error, retryAfter),
    },
  }
}

const defaultLog = (event: WorkerEvent) => console.info(JSON.stringify(event))

export function createWorkers(setup: WorkerSetup): Worker[] {
  const definitions = new Map(setup.jobs.map((job) => [job.name, job as JobDefinition<unknown>]))
  const log = setup.log ?? defaultLog
  const queues = setup.queues ?? QUEUE_NAMES
  return queues.map((queue) => {
    const worker = new Worker(
      queue,
      async (job: Job) => {
        const definition = definitions.get(job.name)
        if (!definition) throw new Error(`Unknown job ${job.name}.`)
        const outcome = await runJob(definition, job.data, { attempt: job.attemptsMade + 1, jobId: String(job.id) }, { redis: setup.redis, prefix: setup.lockPrefix })
        log({ event: outcome === "handled" ? "processed" : "skipped", job: job.name, id: String(job.id), attempt: job.attemptsMade + 1 })
        return outcome
      },
      {
        connection: createRedis({ maxRetriesPerRequest: null }, setup.connectionUrl),
        prefix: setup.prefix,
        ...workerOptions(setup.retryAfter, (name) => definitions.get(name) as AnyJobDefinition | undefined),
      },
    )
    worker.on("failed", (job, error) => {
      if (!job) return
      log({ event: "failed", job: job.name, id: String(job.id), attempt: job.attemptsMade, message: error.message })
      if (typeof job.finishedOn !== "number") return
      const definition = definitions.get(job.name)
      void Promise.resolve(definition?.failed?.(job.data, error)).catch((failure: unknown) => log({ event: "failed", job: job.name, id: String(job.id), attempt: job.attemptsMade, message: String(failure) }))
    })
    return worker
  })
}
