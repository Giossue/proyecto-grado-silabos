import { text } from "node:stream/consumers"
import { beforeEach, describe, expect, it } from "vitest"
import { PathTraversal, UnknownDisk } from "../http/storage"
import type { FileStorage } from "../http/storageWriter"
import { memoryBucket, type MemoryBucket } from "./bucketTesting"
import { createS3StorageWriter, objectKey } from "./s3Storage"

let bucket: MemoryBucket
let storage: FileStorage

beforeEach(() => {
  bucket = memoryBucket("silabos", () => new Date("2026-11-25T10:00:00Z"))
  storage = createS3StorageWriter(bucket)
})

describe("S3 storage writer", () => {
  it("maps disks to the same folders as the local disk layout", () => {
    expect(objectKey("private", "logos/a.png")).toBe("private/logos/a.png")
    expect(objectKey("local", "./x/../y.pdf")).toBe("private/y.pdf")
    expect(objectKey("public", "")).toBe("public")
    expect(() => objectKey("tmp", "a")).toThrow(UnknownDisk)
    expect(() => objectKey("private", "../a")).toThrow(PathTraversal)
    expect(storage.root).toBe("s3://silabos")
    expect(storage.path("private", "a/b.pdf")).toBe("s3://silabos/private/a/b.pdf")
  })

  it("stores, reads, sizes and streams objects", async () => {
    await storage.put("private", "exports/a.pdf", "%PDF-1.7")
    await storage.put("public", "img.png", Buffer.from([1, 2, 3]))
    expect([...bucket.objects.keys()].sort()).toEqual(["private/exports/a.pdf", "public/img.png"])
    expect((await storage.get("private", "exports/a.pdf")).toString()).toBe("%PDF-1.7")
    expect(await storage.size("public", "img.png")).toBe(3)
    expect(await storage.stat("private", "exports/a.pdf")).toEqual({ size: 8, modifiedAt: new Date("2026-11-25T10:00:00Z"), isFile: true })
    expect(await text(await storage.stream("private", "exports/a.pdf"))).toBe("%PDF-1.7")
    expect(await text(await storage.stream("private", "exports/a.pdf", { start: 1, end: 3 }))).toBe("PDF")
  })

  it("treats a prefix as an existing directory like the local disk does", async () => {
    await storage.put("private", "docs/1/original.pdf", "x")
    expect(await storage.exists("private", "docs/1")).toBe(true)
    expect(await storage.stat("private", "docs/1")).toEqual({ size: 0, modifiedAt: new Date(0), isFile: false })
    expect(await storage.exists("private", "docs/2")).toBe(false)
    expect(await storage.exists("tmp", "docs/1")).toBe(false)
  })

  it("fails missing reads with ENOENT like the local disk", async () => {
    await expect(storage.get("private", "missing.pdf")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(storage.size("private", "missing.pdf")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(storage.stream("private", "missing.pdf")).rejects.toMatchObject({ code: "ENOENT" })
    expect(await storage.stat("private", "missing.pdf")).toBeNull()
    await expect(storage.stat("tmp", "a")).rejects.toBeInstanceOf(UnknownDisk)
  })

  it("deletes files and whole directories, ignoring missing ones", async () => {
    await storage.put("private", "docs/1/original.pdf", "x")
    await storage.put("private", "docs/1/vista.pdf", "y")
    await storage.put("private", "docs/10/original.pdf", "z")
    await storage.delete("private", "docs/1/original.pdf")
    await storage.delete("private", "docs/1/never.pdf")
    expect(await storage.exists("private", "docs/1/original.pdf")).toBe(false)
    await storage.deleteDirectory("private", "docs/1")
    await storage.deleteDirectory("private", "docs/none")
    expect([...bucket.objects.keys()]).toEqual(["private/docs/10/original.pdf"])
  })
})
