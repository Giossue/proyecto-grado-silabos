import "../src/config/load-env"
import { storagePath } from "../src/server/http/storage"
import { s3Bucket, s3Client } from "../src/server/storage/objectBucket"
import { s3Settings } from "../src/server/storage/storageConfig"
import { migrateLocalStorage, migrationArguments } from "../src/server/storage/storageMigration"

async function main(): Promise<void> {
  const { dryRun } = migrationArguments(process.argv.slice(2))
  const settings = s3Settings()
  const root = storagePath()
  const bucket = s3Bucket(s3Client(settings), settings.bucket)
  console.info(JSON.stringify({ message: "storage-migrate-start", root, bucket: settings.bucket, dryRun }))
  const report = await migrateLocalStorage({
    root,
    bucket,
    dryRun,
    onEntry: (entry) => console.info(JSON.stringify({ message: "storage-migrate-entry", ...entry })),
  })
  console.info(JSON.stringify({ message: "storage-migrate-done", uploaded: report.uploaded, skipped: report.skipped, pending: report.pending, bytes: report.bytes }))
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ message: "storage-migrate-failed", error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = 1
})
