import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import type { ObjectBucket } from "./objectBucket"

const FOLDERS = ["private", "public"] as const

export type MigrationOutcome = "uploaded" | "skipped" | "pending"

export type MigrationEntry = { key: string; size: number; outcome: MigrationOutcome }

export type MigrationReport = { entries: MigrationEntry[]; uploaded: number; skipped: number; pending: number; bytes: number }

export type MigrationOptions = { root: string; bucket: ObjectBucket; dryRun: boolean; onEntry?: (entry: MigrationEntry) => void }

async function* localFiles(directory: string, prefix: string): AsyncGenerator<{ absolute: string; key: string }> {
  let entries
  try {
    entries = await readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(/*turbopackIgnore: true*/ directory, entry.name)
    const key = `${prefix}/${entry.name}`
    if (entry.isDirectory()) yield* localFiles(absolute, key)
    else if (entry.isFile()) yield { absolute, key }
  }
}

function sameObject(local: Buffer, remote: { size: number; etag: string | null }): boolean {
  if (remote.size !== local.length) return false
  if (remote.etag === null || remote.etag.includes("-")) return true
  return remote.etag === createHash("md5").update(local).digest("hex")
}

export async function migrateLocalStorage(options: MigrationOptions): Promise<MigrationReport> {
  const report: MigrationReport = { entries: [], uploaded: 0, skipped: 0, pending: 0, bytes: 0 }
  for (const folder of FOLDERS) {
    for await (const file of localFiles(path.join(/*turbopackIgnore: true*/ options.root, folder), folder)) {
      const size = (await stat(/*turbopackIgnore: true*/ file.absolute)).size
      const remote = await options.bucket.head(file.key)
      let outcome: MigrationOutcome
      if (remote !== null && remote.size === size && sameObject(await readFile(/*turbopackIgnore: true*/ file.absolute), remote)) outcome = "skipped"
      else if (options.dryRun) outcome = "pending"
      else {
        await options.bucket.put(file.key, await readFile(/*turbopackIgnore: true*/ file.absolute))
        outcome = "uploaded"
      }
      const entry = { key: file.key, size, outcome }
      report.entries.push(entry)
      report[outcome] += 1
      if (outcome !== "skipped") report.bytes += size
      options.onEntry?.(entry)
    }
  }
  return report
}

export function migrationArguments(argv: string[]): { dryRun: boolean } {
  const unknown = argv.filter((argument) => argument !== "--dry-run" && argument !== "--")
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown.join(" ")} (use --dry-run).`)
  return { dryRun: argv.includes("--dry-run") }
}
