import "server-only"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

const DISK_FOLDERS: Record<string, string> = { private: "private", local: "private", public: "public" }

export class UnknownDisk extends Error {}
export class PathTraversal extends Error {}

export function storagePath(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_PATH ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "storage"))
}

export function publicPath(relative: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.PUBLIC_ASSETS_PATH ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "assets"))
  return path.join(/*turbopackIgnore: true*/ root, relative)
}

export function normalizeStoragePath(relative: string): string {
  const parts: string[] = []
  for (const part of relative.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") {
      if (parts.length === 0) throw new PathTraversal(relative)
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join("/")
}

export function diskPath(disk: string, relative: string): string {
  const folder = DISK_FOLDERS[disk]
  if (folder === undefined) throw new UnknownDisk(disk)
  return path.join(/*turbopackIgnore: true*/ storagePath(), folder, normalizeStoragePath(relative))
}

export async function diskExists(disk: string, relative: string): Promise<boolean> {
  try {
    await stat(/*turbopackIgnore: true*/ diskPath(disk, relative))
    return true
  } catch (error) {
    if (error instanceof UnknownDisk || error instanceof PathTraversal) throw error
    return false
  }
}

export async function fileModifiedAt(absolute: string): Promise<string> {
  try {
    return String(Math.floor((await stat(/*turbopackIgnore: true*/ absolute)).mtimeMs / 1000))
  } catch {
    return "0"
  }
}

export async function fileBase64(absolute: string): Promise<string> {
  try {
    if (!(await stat(/*turbopackIgnore: true*/ absolute)).isFile()) return ""
    return (await readFile(/*turbopackIgnore: true*/ absolute)).toString("base64")
  } catch {
    return ""
  }
}
