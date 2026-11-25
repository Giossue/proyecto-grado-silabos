export const QUEUE_NAMES = ["critica", "documentos", "ia", "general"] as const

export type QueueName = (typeof QUEUE_NAMES)[number]

export const WORKER_DEFAULTS = { tries: 3, timeout: 60, backoff: 0 } as const

const DEFAULT_RETRY_AFTER = 960

export function retryAfterSeconds(env: Record<string, string | undefined> = process.env): number {
  const raw = env.QUEUE_RETRY_AFTER ?? env.REDIS_QUEUE_RETRY_AFTER
  const seconds = raw === undefined ? DEFAULT_RETRY_AFTER : Number.parseInt(raw.trim(), 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER
}

export function queuePrefix(): string {
  return `${process.env.REDIS_PREFIX ?? "silabos-ueb:"}queue`
}

export function maxRunSeconds(env: Record<string, string | undefined> = process.env): number {
  const seconds = Number.parseInt(env.QUEUE_MAX_TIME ?? "0", 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}
