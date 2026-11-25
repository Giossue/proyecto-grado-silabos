import { Redis, type RedisOptions } from "ioredis"

export function redisUrl(): string {
  const url = process.env.REDIS_URL
  if (!url) throw new Error("REDIS_URL is not configured.")
  return url
}

export function redisPrefix(): string {
  return process.env.REDIS_PREFIX ?? "silabos-ueb:"
}

export function createRedis(options: RedisOptions = {}, url: string = redisUrl()): Redis {
  return new Redis(url, { lazyConnect: true, ...options })
}

const globalForRedis = globalThis as unknown as { silabosRedis?: Redis }

export function sharedRedis(): Redis {
  globalForRedis.silabosRedis ??= createRedis({ maxRetriesPerRequest: 2 })
  return globalForRedis.silabosRedis
}
