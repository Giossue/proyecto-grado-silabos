import type { JobsOptions } from "bullmq"
import { WORKER_DEFAULTS, type QueueName } from "./config"

export type JobContext = { attempt: number; jobId: string; signal: AbortSignal }

export type JobDefinition<T> = {
  name: string
  queue: QueueName
  tries?: number
  timeout?: number
  backoff?: number | readonly number[]
  uniqueId?: (data: T) => string
  runsOnce?: boolean
  handle(data: T, context: JobContext): Promise<void>
  failed?(data: T, error: Error): Promise<void> | void
}

export type AnyJobDefinition = JobDefinition<never>

export function defineJob<T>(definition: JobDefinition<T>): JobDefinition<T> {
  return definition
}

export class JobTimeoutError extends Error {
  constructor(jobName: string) {
    super(`${jobName} has timed out.`)
    this.name = "JobTimeoutError"
  }
}

export function jobTries(definition: Pick<JobDefinition<never>, "tries">): number {
  return definition.tries ?? WORKER_DEFAULTS.tries
}

export function jobTimeout(definition: Pick<JobDefinition<never>, "timeout">): number {
  return definition.timeout ?? WORKER_DEFAULTS.timeout
}

export function uniqueJobId<T>(definition: JobDefinition<T>, data: T): string | null {
  return definition.uniqueId ? `${definition.name}-${encodeURIComponent(definition.uniqueId(data))}` : null
}

export function jobOptions<T>(definition: JobDefinition<T>, data: T): JobsOptions {
  const jobId = uniqueJobId(definition, data)
  return {
    attempts: jobTries(definition),
    backoff: { type: "job-schedule" },
    ...(jobId ? { jobId } : {}),
    removeOnComplete: true,
    removeOnFail: true,
  }
}

export function retryDelay(definition: Pick<JobDefinition<never>, "backoff">, attemptsMade: number, error: Error | undefined, retryAfter: number): number {
  if (error?.name === "JobTimeoutError") return retryAfter * 1000
  const backoff = definition.backoff ?? WORKER_DEFAULTS.backoff
  const delays = typeof backoff === "number" ? [backoff] : backoff
  return (delays[attemptsMade - 1] ?? delays[delays.length - 1] ?? 0) * 1000
}
