import { createHash } from "node:crypto"
import { Readable } from "node:stream"
import type { ObjectBucket } from "./objectBucket"

type StoredObject = { body: Buffer; modifiedAt: Date }

export type MemoryBucket = ObjectBucket & { objects: Map<string, StoredObject>; puts: string[] }

export function memoryBucket(name = "memory", now: () => Date = () => new Date()): MemoryBucket {
  const objects = new Map<string, StoredObject>()
  const puts: string[] = []
  return {
    name,
    objects,
    puts,
    async put(key, body) {
      puts.push(key)
      objects.set(key, { body: Buffer.from(body), modifiedAt: now() })
    },
    async get(key) {
      const object = objects.get(key)
      return object === undefined ? null : Buffer.from(object.body)
    },
    async stream(key, range) {
      const object = objects.get(key)
      if (object === undefined) return null
      const body = range === undefined ? object.body : object.body.subarray(range.start, range.end + 1)
      return Readable.from([Buffer.from(body)])
    },
    async head(key) {
      const object = objects.get(key)
      if (object === undefined) return null
      return { size: object.body.length, modifiedAt: object.modifiedAt, etag: createHash("md5").update(object.body).digest("hex") }
    },
    async list(prefix, limit) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort()
      return limit === undefined ? keys : keys.slice(0, limit)
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key)
    },
  }
}
