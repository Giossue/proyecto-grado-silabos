import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { memoryBucket, type MemoryBucket } from "./bucketTesting"
import { migrateLocalStorage, migrationArguments } from "./storageMigration"

let root: string
let bucket: MemoryBucket

async function file(relative: string, content: string) {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-storage-migrate-"))
  bucket = memoryBucket()
  await file("private/logos/institucion.png", "logo")
  await file("private/exports/1/silabo.pdf", "%PDF")
  await file("public/images/a.png", "img")
  await file("other/ignored.txt", "no")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("local storage migration", () => {
  it("lists what would be copied without writing on a dry run", async () => {
    const report = await migrateLocalStorage({ root, bucket, dryRun: true })
    expect(report.entries.map((entry) => [entry.key, entry.outcome])).toEqual([
      ["private/exports/1/silabo.pdf", "pending"],
      ["private/logos/institucion.png", "pending"],
      ["public/images/a.png", "pending"],
    ])
    expect(report).toMatchObject({ uploaded: 0, skipped: 0, pending: 3, bytes: 11 })
    expect(bucket.objects.size).toBe(0)
  })

  it("copies every file under the same keys and skips identical objects on a second run", async () => {
    expect(await migrateLocalStorage({ root, bucket, dryRun: false })).toMatchObject({ uploaded: 3, skipped: 0, bytes: 11 })
    expect(bucket.objects.get("private/logos/institucion.png")?.body.toString()).toBe("logo")
    const again = await migrateLocalStorage({ root, bucket, dryRun: false })
    expect(again).toMatchObject({ uploaded: 0, skipped: 3, bytes: 0 })
    expect(bucket.puts).toHaveLength(3)
  })

  it("uploads again when the stored object differs in size or content", async () => {
    await migrateLocalStorage({ root, bucket, dryRun: false })
    await file("private/logos/institucion.png", "LOGO")
    await file("public/images/a.png", "image")
    const report = await migrateLocalStorage({ root, bucket, dryRun: false })
    expect(report.entries.filter((entry) => entry.outcome === "uploaded").map((entry) => entry.key)).toEqual(["private/logos/institucion.png", "public/images/a.png"])
    expect(bucket.objects.get("private/logos/institucion.png")?.body.toString()).toBe("LOGO")
  })

  it("accepts only the dry-run flag", () => {
    expect(migrationArguments([])).toEqual({ dryRun: false })
    expect(migrationArguments(["--", "--dry-run"])).toEqual({ dryRun: true })
    expect(() => migrationArguments(["--force"])).toThrow("Unknown argument: --force (use --dry-run).")
  })
})
