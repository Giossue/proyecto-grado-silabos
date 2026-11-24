// @vitest-environment node
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { embeddedLogos, facultyUrl, institutionPath, institutionUrl, type LogoStore, type StoredFaculty } from "./institutionalLogos"

const FACULTY = "01a1c5bc-798f-72af-b64b-3cd174a1687b"
let root: string
let faculties: Map<string, StoredFaculty>

const store: LogoStore = { faculty: async (id) => faculties.get(id.toLowerCase()) ?? null }
const request = new Request("http://localhost:3000/api/v1/teacher/syllabi/x", { headers: { host: "localhost:3000" } })

async function file(relative: string, content: string, mtime: number) {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
  await utimes(target, mtime, mtime)
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-logos-"))
  process.env.LARAVEL_STORAGE_PATH = path.join(root, "storage", "app")
  process.env.LARAVEL_PUBLIC_PATH = path.join(root, "public")
  await file("public/images/silabo/facultad.jpeg", "jpeg", 1789530560)
  await file("public/images/silabo/logo-universidad.png", "default", 1789530561)
  await file(`storage/app/private/logos/facultades/${FACULTY}/logo.png`, "faculty", 1794318825)
})

afterAll(async () => {
  delete process.env.LARAVEL_STORAGE_PATH
  delete process.env.LARAVEL_PUBLIC_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  faculties = new Map([[FACULTY, { id: FACULTY, logo: { disk: "private", path: `logos/facultades/${FACULTY}/logo.png`, classification: "logo_facultad" } }]])
})

describe("institutional logos", () => {
  it("uses the public default institution logo until one is uploaded, versioned by its modification time", async () => {
    expect(await institutionPath()).toBe(path.join(root, "public", "images", "silabo", "logo-universidad.png"))
    expect(await institutionUrl(request)).toBe("http://localhost:3000/logos/institucion?v=1789530561")
    await file("storage/app/private/logos/institucion.png", "uploaded", 1794000000)
    expect(await institutionUrl(request)).toBe("http://localhost:3000/logos/institucion?v=1794000000")
    await rm(path.join(root, "storage/app/private/logos/institucion.png"))
  })

  it("links a configured faculty logo through the logo route with the stored file version", async () => {
    expect(await facultyUrl(request, FACULTY, store)).toBe(`http://localhost:3000/logos/facultad/${FACULTY}?v=1794318825`)
  })

  it("falls back to the sample faculty image when the faculty has no usable logo", async () => {
    const sample = "http://localhost:3000/images/silabo/facultad.jpeg?v=1789530560"
    expect(await facultyUrl(request, null, store)).toBe(sample)
    expect(await facultyUrl(request, "01a1c5bc-0000-7000-8000-000000000000", store)).toBe(sample)
    faculties.set(FACULTY, { id: FACULTY, logo: { disk: "private", path: "logos/facultades/missing.png", classification: "logo_facultad" } })
    expect(await facultyUrl(request, FACULTY, store)).toBe(sample)
    faculties.set(FACULTY, { id: FACULTY, logo: { disk: "private", path: `logos/facultades/${FACULTY}/logo.png`, classification: "otro" } })
    expect(await facultyUrl(request, FACULTY, store)).toBe(sample)
    faculties.set(FACULTY, { id: FACULTY, logo: null })
    expect(await facultyUrl(request, FACULTY, store)).toBe(sample)
  })

  it("embeds both logo files as base64, the faculty one even without the logo classification", async () => {
    faculties.set(FACULTY, { id: FACULTY, logo: { disk: "private", path: `logos/facultades/${FACULTY}/logo.png`, classification: "otro" } })
    expect(await embeddedLogos(FACULTY, store)).toEqual({ institution: Buffer.from("default").toString("base64"), faculty: Buffer.from("faculty").toString("base64") })
    expect(await embeddedLogos(null, store)).toEqual({ institution: Buffer.from("default").toString("base64"), faculty: Buffer.from("jpeg").toString("base64") })
  })
})
