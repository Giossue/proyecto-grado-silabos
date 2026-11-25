import { randomBytes } from "node:crypto"
import type { Redis } from "ioredis"
import { redisPrefix } from "./connection"

const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`

export class LockTimeoutError extends Error {
  constructor() {
    super("Unable to acquire lock.")
    this.name = "LockTimeoutError"
  }
}

export type LockOptions = { owner?: string; prefix?: string; sleepMilliseconds?: number }

export type RedisLock = {
  readonly name: string
  readonly owner: string
  acquire(): Promise<boolean>
  release(): Promise<boolean>
  forceRelease(): Promise<void>
  isOwnedByCurrentProcess(): Promise<boolean>
  get<T>(callback: () => Promise<T>): Promise<T | false>
  block<T = true>(seconds: number, callback?: () => Promise<T>): Promise<T | true>
}

function randomOwner(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  return Array.from(randomBytes(16), (byte) => alphabet[byte % alphabet.length]).join("")
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export function redisLock(redis: Redis, name: string, seconds = 0, options: LockOptions = {}): RedisLock {
  const key = `${options.prefix ?? redisPrefix()}${name}`
  const owner = options.owner ?? randomOwner()
  const sleepMilliseconds = options.sleepMilliseconds ?? 250

  const acquire = async () => {
    const result = seconds > 0 ? await redis.set(key, owner, "EX", seconds, "NX") : await redis.set(key, owner, "NX")
    return result === "OK"
  }
  const release = async () => Number(await redis.eval(RELEASE_SCRIPT, 1, key, owner)) === 1
  const run = async <T>(callback: () => Promise<T>) => {
    try {
      return await callback()
    } finally {
      await release()
    }
  }

  return {
    name,
    owner,
    acquire,
    release,
    async forceRelease() {
      await redis.del(key)
    },
    async isOwnedByCurrentProcess() {
      return (await redis.get(key)) === owner
    },
    async get(callback) {
      if (!(await acquire())) return false
      return run(callback)
    },
    async block(waitSeconds, callback) {
      const startedAt = Math.floor(Date.now() / 1000)
      while (!(await acquire())) {
        await sleep(sleepMilliseconds)
        if (Math.floor(Date.now() / 1000) - waitSeconds >= startedAt) throw new LockTimeoutError()
      }
      return callback ? run(callback) : true
    },
  }
}
