import { chmod, mkdir, readFile, readdir, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Readable } from "node:stream"
import { localStat, localStream, type StorageStat } from "../storage/fileSource"
import { s3Bucket, s3Client, type ByteRange } from "../storage/objectBucket"
import { createS3StorageWriter } from "../storage/s3Storage"
import { storageSettings, storageSignature } from "../storage/storageConfig"
import { normalizeStoragePath, storagePath, UnknownDisk } from "./storage"

type DiskConfig = { folder: string; fileMode: number | null; directoryMode: number }

const DISKS: Record<string, DiskConfig> = {
  private: { folder: "private", fileMode: 0o600, directoryMode: 0o700 },
  local: { folder: "private", fileMode: null, directoryMode: 0o700 },
  public: { folder: "public", fileMode: 0o644, directoryMode: 0o755 },
}

export interface StorageWriter {
  root: string
  path(disk: string, relative: string): string
  put(disk: string, relative: string, contents: Buffer | string): Promise<void>
  get(disk: string, relative: string): Promise<Buffer>
  exists(disk: string, relative: string): Promise<boolean>
  size(disk: string, relative: string): Promise<number>
  delete(disk: string, relative: string): Promise<void>
  deleteDirectory(disk: string, relative: string): Promise<void>
}

export type { StorageStat }

export interface FileStorage extends StorageWriter {
  stat(disk: string, relative: string): Promise<StorageStat | null>
  stream(disk: string, relative: string, range?: ByteRange): Promise<Readable>
}

function diskConfig(disk: string): DiskConfig {
  const config = DISKS[disk]
  if (config === undefined) throw new UnknownDisk(disk)
  return config
}

async function ensureDirectory(directory: string, mode: number): Promise<void> {
  try {
    if ((await stat(/*turbopackIgnore: true*/ directory)).isDirectory()) return
  } catch {}
  await mkdir(/*turbopackIgnore: true*/ directory, { recursive: true, mode })
}

export function phpDirname(relative: string): string {
  const index = relative.lastIndexOf("/")
  if (index < 0) return "."
  return index === 0 ? "/" : relative.slice(0, index)
}

export function createStorageWriter(root: string = storagePath()): FileStorage {
  const resolve = (disk: string, relative: string) => path.join(/*turbopackIgnore: true*/ root, diskConfig(disk).folder, normalizeStoragePath(relative))
  return {
    root,
    path: resolve,
    async put(disk, relative, contents) {
      const config = diskConfig(disk)
      const absolute = resolve(disk, relative)
      await ensureDirectory(path.join(/*turbopackIgnore: true*/ root, config.folder), config.directoryMode)
      await ensureDirectory(path.dirname(absolute), config.directoryMode)
      await writeFile(/*turbopackIgnore: true*/ absolute, contents)
      if (config.fileMode !== null) await chmod(/*turbopackIgnore: true*/ absolute, config.fileMode)
    },
    get: (disk, relative) => readFile(/*turbopackIgnore: true*/ resolve(disk, relative)),
    async exists(disk, relative) {
      try {
        await stat(/*turbopackIgnore: true*/ resolve(disk, relative))
        return true
      } catch {
        return false
      }
    },
    async size(disk, relative) {
      return (await stat(/*turbopackIgnore: true*/ resolve(disk, relative))).size
    },
    async stat(disk, relative) {
      return localStat(resolve(disk, relative))
    },
    async stream(disk, relative, range) {
      return localStream(resolve(disk, relative), range)
    },
    async delete(disk, relative) {
      try {
        await unlink(/*turbopackIgnore: true*/ resolve(disk, relative))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    },
    async deleteDirectory(disk, relative) {
      const absolute = resolve(disk, relative)
      try {
        if (!(await stat(/*turbopackIgnore: true*/ absolute)).isDirectory()) return
      } catch {
        return
      }
      for (const entry of await readdir(/*turbopackIgnore: true*/ absolute)) await rm(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ absolute, entry), { recursive: true, force: true })
      await rmdir(/*turbopackIgnore: true*/ absolute)
    },
  }
}

function hasFileAccess(storage: StorageWriter): storage is FileStorage {
  return typeof (storage as Partial<FileStorage>).stat === "function" && typeof (storage as Partial<FileStorage>).stream === "function"
}

export function storedStat(storage: StorageWriter, disk: string, relative: string): Promise<StorageStat | null> {
  return hasFileAccess(storage) ? storage.stat(disk, relative) : localStat(storage.path(disk, relative))
}

let shared: { signature: string; storage: FileStorage } | null = null

export function storageWriter(): FileStorage {
  const settings = storageSettings()
  const signature = storageSignature(settings, storagePath())
  if (shared === null || shared.signature !== signature) {
    const storage = settings.driver === "s3" ? createS3StorageWriter(s3Bucket(s3Client(settings.s3), settings.s3.bucket)) : createStorageWriter()
    shared = { signature, storage }
  }
  return shared.storage
}
