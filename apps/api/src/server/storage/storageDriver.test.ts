import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { embeddedLogos, facultyUrl, institutionUrl, type LogoStore } from "../configuration/institutionalLogos"
import { institutionLogo } from "../configuration/logoRoutes"
import { storageWriter } from "../http/storageWriter"
import { memoryBucket } from "./bucketTesting"

const bucket = vi.hoisted(() => ({ current: null as ReturnType<typeof memoryBucket> | null }))

vi.mock("./objectBucket", async (original) => ({
  ...(await original<typeof import("./objectBucket")>()),
  s3Bucket: () => bucket.current,
}))

const FACULTY = "01a1c5bc-798f-72af-b64b-3cd174a1687b"
const S3_ENV = { STORAGE_DRIVER: "s3", S3_ENDPOINT: "http://minio.invalid:9000", S3_BUCKET: "silabos", S3_ACCESS_KEY: "test", S3_SECRET_KEY: "test-secret" }
const request = new Request("http://localhost:3000/api/v1/x", { headers: { host: "localhost:3000" } })
const store: LogoStore = { faculty: async (id) => ({ id, logo: { disk: "private", path: `logos/facultades/${id}/logo.png`, classification: "logo_facultad" } }) }
let root: string

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-storage-driver-"))
  const sample = path.join(root, "public", "images", "silabo")
  await mkdir(sample, { recursive: true })
  await writeFile(path.join(sample, "logo-universidad.png"), "default")
  await writeFile(path.join(sample, "facultad.jpeg"), "jpeg")
  await utimes(path.join(sample, "logo-universidad.png"), 1789530561, 1789530561)
  process.env.STORAGE_PATH = path.join(root, "storage")
  process.env.PUBLIC_ASSETS_PATH = path.join(root, "public")
})

afterAll(async () => {
  for (const name of ["STORAGE_PATH", "PUBLIC_ASSETS_PATH", ...Object.keys(S3_ENV)]) delete process.env[name]
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  bucket.current = memoryBucket("silabos", () => new Date(1794000000 * 1000))
  for (const name of Object.keys(S3_ENV)) delete process.env[name]
})

describe("storage driver selection", () => {
  it("keeps the local disk under STORAGE_PATH by default", () => {
    expect(storageWriter().root).toBe(path.join(root, "storage"))
  })

  it("switches to the S3 bucket when STORAGE_DRIVER=s3", () => {
    Object.assign(process.env, S3_ENV)
    expect(storageWriter().root).toBe("s3://silabos")
  })

  it("serves uploaded logos from the bucket and the public defaults otherwise", async () => {
    Object.assign(process.env, S3_ENV)
    expect(await institutionUrl(request)).toBe("http://localhost:3000/logos/institucion?v=1789530561")
    await storageWriter().put("private", "logos/institucion.png", "uploaded")
    await storageWriter().put("private", `logos/facultades/${FACULTY}/logo.png`, "faculty")
    expect(await institutionUrl(request)).toBe("http://localhost:3000/logos/institucion?v=1794000000")
    expect(await facultyUrl(request, FACULTY, store)).toBe(`http://localhost:3000/logos/facultad/${FACULTY}?v=1794000000`)
    expect(await embeddedLogos(FACULTY, store)).toEqual({ institution: Buffer.from("uploaded").toString("base64"), faculty: Buffer.from("faculty").toString("base64") })
    const response = await institutionLogo(new Request("http://localhost:3000/logos/institucion", { headers: { range: "bytes=0-1" } }))
    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe("bytes 0-1/8")
    expect(response.headers.get("last-modified")).toBe(new Date(1794000000 * 1000).toUTCString())
    expect(await response.text()).toBe("up")
  })
})
