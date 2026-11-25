import { normalizeStoragePath, UnknownDisk } from "../http/storage"
import type { FileStorage } from "../http/storageWriter"
import type { StorageStat } from "./fileSource"
import type { ObjectBucket } from "./objectBucket"

const DISK_FOLDERS: Record<string, string> = { private: "private", local: "private", public: "public" }

export class MissingStoredObject extends Error {
  readonly code = "ENOENT"

  constructor(readonly key: string) {
    super(`ENOENT: no such stored object '${key}'`)
  }
}

export function objectKey(disk: string, relative: string): string {
  const folder = DISK_FOLDERS[disk]
  if (folder === undefined) throw new UnknownDisk(disk)
  const normalized = normalizeStoragePath(relative)
  return normalized === "" ? folder : `${folder}/${normalized}`
}

export function createS3StorageWriter(bucket: ObjectBucket): FileStorage {
  const root = `s3://${bucket.name}`
  const stat = async (disk: string, relative: string): Promise<StorageStat | null> => {
    const key = objectKey(disk, relative)
    const head = await bucket.head(key)
    if (head !== null) return { size: head.size, modifiedAt: head.modifiedAt, isFile: true }
    return (await bucket.list(`${key}/`, 1)).length > 0 ? { size: 0, modifiedAt: new Date(0), isFile: false } : null
  }
  return {
    root,
    path: (disk, relative) => `${root}/${objectKey(disk, relative)}`,
    async put(disk, relative, contents) {
      await bucket.put(objectKey(disk, relative), typeof contents === "string" ? Buffer.from(contents) : contents)
    },
    async get(disk, relative) {
      const key = objectKey(disk, relative)
      const bytes = await bucket.get(key)
      if (bytes === null) throw new MissingStoredObject(key)
      return bytes
    },
    async exists(disk, relative) {
      try {
        return (await stat(disk, relative)) !== null
      } catch {
        return false
      }
    },
    async size(disk, relative) {
      const found = await stat(disk, relative)
      if (found === null) throw new MissingStoredObject(objectKey(disk, relative))
      return found.size
    },
    stat,
    async stream(disk, relative, range) {
      const key = objectKey(disk, relative)
      const body = await bucket.stream(key, range)
      if (body === null) throw new MissingStoredObject(key)
      return body
    },
    async delete(disk, relative) {
      await bucket.delete([objectKey(disk, relative)])
    },
    async deleteDirectory(disk, relative) {
      const keys = await bucket.list(`${objectKey(disk, relative)}/`)
      if (keys.length > 0) await bucket.delete(keys)
    },
  }
}
