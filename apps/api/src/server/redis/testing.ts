import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseEnv } from "node:util"
import type { Redis } from "ioredis"
import { workspaceRoot } from "../../config/workspace"
import { createRedis } from "./connection"

const TEST_DATABASE = 15

export function testRedisUrl(): string | null {
  const configured = process.env.REDIS_TEST_URL
  if (configured) return configured
  const file = resolve(workspaceRoot(), ".env.local")
  const base = process.env.REDIS_URL ?? (existsSync(file) ? parseEnv(readFileSync(file, "utf8")).REDIS_URL : undefined)
  if (!base) return null
  const url = new URL(base)
  url.pathname = `/${TEST_DATABASE}`
  return url.toString()
}

export function testRedis(): Redis {
  const url = testRedisUrl()
  if (!url) throw new Error("No Redis is configured for tests.")
  return createRedis({ maxRetriesPerRequest: 1 }, url)
}

export async function clearPrefix(redis: Redis, prefix: string): Promise<void> {
  let cursor = "0"
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500)
    if (keys.length > 0) await redis.del(...keys)
    cursor = next
  } while (cursor !== "0")
}
