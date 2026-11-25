import { describe, expect, it } from "vitest"
import { s3Settings, storageSettings, storageSignature, StorageConfigError } from "./storageConfig"

const S3 = { STORAGE_DRIVER: "s3", S3_BUCKET: "silabos", S3_ACCESS_KEY: "key", S3_SECRET_KEY: "secret" }

describe("storage settings", () => {
  it("defaults to the local driver", () => {
    expect(storageSettings({})).toEqual({ driver: "local" })
    expect(storageSettings({ STORAGE_DRIVER: " " })).toEqual({ driver: "local" })
    expect(storageSettings({ STORAGE_DRIVER: "LOCAL" })).toEqual({ driver: "local" })
  })

  it("reads the S3 variables with MinIO-friendly defaults", () => {
    expect(storageSettings(S3)).toEqual({
      driver: "s3",
      s3: { endpoint: undefined, region: "us-east-1", bucket: "silabos", accessKeyId: "key", secretAccessKey: "secret", forcePathStyle: true },
    })
    expect(s3Settings({ ...S3, S3_ENDPOINT: "http://minio:9000", S3_REGION: "sa-east-1", S3_FORCE_PATH_STYLE: "false" })).toMatchObject({
      endpoint: "http://minio:9000",
      region: "sa-east-1",
      forcePathStyle: false,
    })
  })

  it("rejects an unknown driver and incomplete S3 credentials", () => {
    expect(() => storageSettings({ STORAGE_DRIVER: "ftp" })).toThrow(StorageConfigError)
    expect(() => storageSettings({ STORAGE_DRIVER: "s3", S3_BUCKET: "b" })).toThrow("S3 storage needs S3_ACCESS_KEY, S3_SECRET_KEY.")
  })

  it("changes the signature when any connection setting changes without exposing the secret", () => {
    const base = storageSignature(storageSettings(S3), "/data")
    expect(base).not.toContain("secret")
    expect(storageSignature(storageSettings({ ...S3, S3_SECRET_KEY: "other" }), "/data")).not.toBe(base)
    expect(storageSignature(storageSettings({}), "/data")).toBe("local:/data")
  })
})
