import { Queue } from "bullmq"
import type { Redis } from "ioredis"
import { createRedis } from "../redis/connection"
import { queuePrefix, type QueueName } from "./config"
import { jobOptions, type JobDefinition } from "./job"

export type QueueProvider = (name: QueueName) => Queue

export type Dispatcher = { dispatch<T>(definition: JobDefinition<T>, data: T): Promise<string> }

export function createDispatcher(queueFor: QueueProvider): Dispatcher {
  return {
    async dispatch(definition, data) {
      const job = await queueFor(definition.queue).add(definition.name, data, jobOptions(definition, data))
      return String(job.id)
    },
  }
}

type SharedQueue = { queue: Queue; connection: Redis }

const globalForQueues = globalThis as unknown as { silabosQueues?: Map<QueueName, SharedQueue> }

function sharedQueues(): Map<QueueName, SharedQueue> {
  globalForQueues.silabosQueues ??= new Map()
  return globalForQueues.silabosQueues
}

export function sharedQueue(name: QueueName): Queue {
  const queues = sharedQueues()
  if (!queues.has(name)) {
    const connection = createRedis({ maxRetriesPerRequest: null })
    queues.set(name, { queue: new Queue(name, { connection, prefix: queuePrefix() }), connection })
  }
  return (queues.get(name) as SharedQueue).queue
}

export async function closeSharedQueues(): Promise<void> {
  const queues = sharedQueues()
  await Promise.all(
    [...queues.values()].map(async ({ queue, connection }) => {
      await queue.close()
      await connection.quit()
    }),
  )
  queues.clear()
}

export function dispatch<T>(definition: JobDefinition<T>, data: T): Promise<string> {
  return createDispatcher(sharedQueue).dispatch(definition, data)
}

export type AfterCommit = (callback: () => unknown) => void

export async function withAfterCommit<T>(transaction: (afterCommit: AfterCommit) => Promise<T>): Promise<T> {
  const callbacks: Array<() => unknown> = []
  const result = await transaction((callback) => void callbacks.push(callback))
  for (const callback of callbacks) await callback()
  return result
}
