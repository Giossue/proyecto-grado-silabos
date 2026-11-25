import "server-only"
import type { Redis } from "ioredis"
import { redisLock } from "../redis/lock"
import { jobTimeout, JobTimeoutError, type JobDefinition } from "./job"

export type RunnerDeps = { redis: Redis; prefix: string }

export type RunContext = { attempt: number; jobId: string }

async function withTimeout(definition: JobDefinition<never>, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new JobTimeoutError(definition.name))
    }, jobTimeout(definition) * 1000)
  })
  try {
    await Promise.race([work(controller.signal), timedOut])
  } finally {
    clearTimeout(timer)
  }
}

export async function runJob<T>(definition: JobDefinition<T>, data: T, context: RunContext, deps: RunnerDeps): Promise<"handled" | "skipped"> {
  const job = definition as unknown as JobDefinition<never>
  const work = () => withTimeout(job, (signal) => definition.handle(data, { ...context, signal }))
  if (!definition.runsOnce || !definition.uniqueId) {
    await work()
    return "handled"
  }
  const overlap = redisLock(deps.redis, `queue-overlap:${definition.name}:${definition.uniqueId(data)}`, Math.ceil(jobTimeout(job) + 30), { prefix: deps.prefix })
  if (!(await overlap.acquire())) return "skipped"
  try {
    await work()
  } catch (error) {
    if (!(error instanceof JobTimeoutError)) await overlap.release()
    throw error
  }
  await overlap.release()
  return "handled"
}
