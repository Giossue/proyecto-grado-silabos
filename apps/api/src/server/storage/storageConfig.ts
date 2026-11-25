import { createHash } from "node:crypto"

export type Env = Record<string, string | undefined>

export type S3Settings = {
  endpoint: string | undefined
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

export type StorageSettings = { driver: "local" } | { driver: "s3"; s3: S3Settings }

export class StorageConfigError extends Error {}

const REQUIRED_S3 = ["S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}

function flag(value: string | undefined, fallback: boolean): boolean {
  const normalized = present(value)?.toLowerCase()
  if (normalized === undefined) return fallback
  return ["1", "true", "yes", "on"].includes(normalized)
}

export function s3Settings(env: Env = process.env): S3Settings {
  const missing = REQUIRED_S3.filter((name) => present(env[name]) === undefined)
  if (missing.length > 0) throw new StorageConfigError(`S3 storage needs ${missing.join(", ")}.`)
  return {
    endpoint: present(env.S3_ENDPOINT),
    region: present(env.S3_REGION) ?? "us-east-1",
    bucket: present(env.S3_BUCKET) as string,
    accessKeyId: present(env.S3_ACCESS_KEY) as string,
    secretAccessKey: present(env.S3_SECRET_KEY) as string,
    forcePathStyle: flag(env.S3_FORCE_PATH_STYLE, true),
  }
}

export function storageSettings(env: Env = process.env): StorageSettings {
  const driver = (present(env.STORAGE_DRIVER) ?? "local").toLowerCase()
  if (driver === "local") return { driver: "local" }
  if (driver !== "s3") throw new StorageConfigError(`Unknown STORAGE_DRIVER "${driver}" (use "local" or "s3").`)
  return { driver: "s3", s3: s3Settings(env) }
}

export function storageSignature(settings: StorageSettings, localRoot: string): string {
  if (settings.driver === "local") return `local:${localRoot}`
  const { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle } = settings.s3
  const secret = createHash("sha256").update(secretAccessKey).digest("hex")
  return JSON.stringify(["s3", endpoint ?? "", region, bucket, accessKeyId, secret, forcePathStyle])
}
