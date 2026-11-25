import { open, readFile, stat } from "node:fs/promises"
import type { Readable } from "node:stream"
import type { FileStorage } from "../http/storageWriter"
import type { ByteRange } from "./objectBucket"

export type StorageStat = { size: number; modifiedAt: Date; isFile: boolean }

export async function localStat(absolute: string): Promise<StorageStat | null> {
  try {
    const found = await stat(/*turbopackIgnore: true*/ absolute)
    return { size: found.size, modifiedAt: found.mtime, isFile: found.isFile() }
  } catch {
    return null
  }
}

export async function localStream(absolute: string, range?: ByteRange): Promise<Readable> {
  const handle = await open(/*turbopackIgnore: true*/ absolute, "r")
  return handle.createReadStream(range === undefined ? {} : { start: range.start, end: range.end })
}

export interface FileSource {
  key: string
  stat(): Promise<StorageStat | null>
  read(): Promise<Buffer>
  stream(range?: ByteRange): Promise<Readable>
}

export function localFile(absolute: string): FileSource {
  return {
    key: absolute,
    stat: () => localStat(absolute),
    read: () => readFile(/*turbopackIgnore: true*/ absolute),
    stream: (range) => localStream(absolute, range),
  }
}

export function storedFile(storage: FileStorage, disk: string, relative: string): FileSource {
  return {
    key: storage.path(disk, relative),
    stat: () => storage.stat(disk, relative),
    read: () => storage.get(disk, relative),
    stream: (range) => storage.stream(disk, relative, range),
  }
}

export function fileSource(file: string | FileSource): FileSource {
  return typeof file === "string" ? localFile(file) : file
}
