// @vitest-environment node
import { readFile, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { NOT_FOUND_PAGE } from "../http/errorPages"
import { facultyLogo, institutionLogo, publicSyllabusImage } from "./logoRoutes"
import { templateSchema } from "./templateReads"
import type { LogoStore, StoredFaculty } from "./institutionalLogos"

const FACULTY = "01a1c5bc-798f-72af-b64b-3cd174a1687b"
const BARE = "01a1c5bc-798f-72af-b64b-3cd174a1687c"
const MISSING = "00000000-0000-4000-8000-000000000000"
const MODEL = "App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Faculty"
const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.from("resto del logo")])
const JPEG = Buffer.concat([Buffer.from("ffd8ffe0", "hex"), Buffer.from("logo de facultad")])
const SECURITY = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
}

let root: string
let faculties: Map<string, StoredFaculty>

const store: LogoStore = { faculty: async (id) => faculties.get(id) ?? null }

async function file(relative: string, content: Buffer, mtime: number) {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
  await utimes(target, mtime, mtime)
}

function get(url: string, headers: Record<string, string> = {}, method = "GET"): Request {
  return new Request(`http://localhost:3000${url}`, { method, headers: { "x-forwarded-for": "::1", ...headers } })
}

function headersOf(response: Response): Record<string, string> {
  return Object.fromEntries([...response.headers].filter(([name]) => name !== "set-cookie"))
}

const cookieNames = (response: Response) => response.headers.getSetCookie().map((header) => header.slice(0, header.indexOf("=")))

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-logo-routes-"))
  process.env.STORAGE_PATH = path.join(root, "storage", "app")
  process.env.PUBLIC_ASSETS_PATH = path.join(root, "public")
  await file("public/images/silabo/facultad.jpeg", JPEG, 1789530560)
  await file("public/images/silabo/logo-universidad.png", PNG, 1789530561)
  await file(`storage/app/private/logos/facultades/${FACULTY}/logo.png`, PNG, 1794318825)
})

afterAll(async () => {
  delete process.env.STORAGE_PATH
  delete process.env.PUBLIC_ASSETS_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  faculties = new Map([
    [FACULTY, { id: FACULTY, logo: { disk: "private", path: `logos/facultades/${FACULTY}/logo.png`, classification: "logo_facultad" } }],
    [BARE, { id: BARE, logo: null }],
  ])
})

describe("GET /logos/institucion", () => {
  it("serves the logo file like BinaryFileResponse without a session", async () => {
    const response = await institutionLogo(get("/logos/institucion?v=1789530561"))
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true)
    expect(headersOf(response)).toEqual({
      "cache-control": "max-age=300, public",
      "content-type": "image/png",
      "content-length": String(PNG.length),
      "last-modified": "Wed, 16 Sep 2026 03:49:21 GMT",
      "accept-ranges": "bytes",
      ...SECURITY,
      "cross-origin-resource-policy": "cross-origin",
    })
    expect(cookieNames(response)).toEqual([])
  })

  it("answers HEAD with the same headers and no body, and a byte range with 206 like Symfony", async () => {
    const head = await institutionLogo(get("/logos/institucion", {}, "HEAD"))
    expect(head.status).toBe(200)
    expect(head.headers.get("content-length")).toBe(String(PNG.length))
    expect((await head.arrayBuffer()).byteLength).toBe(0)
    const range = await institutionLogo(get("/logos/institucion", { range: "bytes=2-5" }))
    expect(range.status).toBe(206)
    expect([range.headers.get("content-range"), range.headers.get("content-length")]).toEqual([`bytes 2-5/${PNG.length}`, "4"])
    expect(Buffer.from(await range.arrayBuffer()).equals(PNG.subarray(2, 6))).toBe(true)
    const suffix = await institutionLogo(get("/logos/institucion", { range: "bytes=-3" }))
    expect(Buffer.from(await suffix.arrayBuffer()).equals(PNG.subarray(PNG.length - 3))).toBe(true)
    const outside = await institutionLogo(get("/logos/institucion", { range: "bytes=-99" }))
    expect([outside.status, outside.headers.get("content-range"), outside.headers.get("content-length")]).toEqual([416, `bytes */${PNG.length}`, "0"])
    const stale = await institutionLogo(get("/logos/institucion", { range: "bytes=2-5", "if-range": "Mon, 01 Jan 2024 00:00:00 GMT" }))
    expect([stale.status, stale.headers.get("content-length")]).toEqual([200, String(PNG.length)])
  })
})

describe("GET /logos/facultad/{faculty}", () => {
  it("serves the stored faculty logo and falls back to the default JPEG", async () => {
    const stored = await facultyLogo(get(`/logos/facultad/${FACULTY}?v=1`), FACULTY, { store })
    expect([stored.status, stored.headers.get("content-type"), stored.headers.get("last-modified")]).toEqual([200, "image/png", "Tue, 10 Nov 2026 13:53:45 GMT"])
    const fallback = await facultyLogo(get(`/logos/facultad/${BARE}`), BARE, { store })
    expect([fallback.status, fallback.headers.get("content-type")]).toEqual([200, "image/jpeg"])
    expect(Buffer.from(await fallback.arrayBuffer()).equals(JPEG)).toBe(true)
  })

  it("answers an unknown faculty with Laravel's 404 and a malformed id like an unknown route, without cookies", async () => {
    const html = await facultyLogo(get(`/logos/facultad/${MISSING}`), MISSING, { store })
    expect([html.status, html.headers.get("content-type"), html.headers.get("cache-control"), html.headers.get("x-frame-options")]).toEqual([404, "text/html; charset=utf-8", "no-cache, private", null])
    expect(await html.text()).toBe(NOT_FOUND_PAGE)
    expect(cookieNames(html)).toEqual([])
    const json = await facultyLogo(get(`/logos/facultad/${MISSING}`, { accept: "application/json" }), MISSING, { store })
    expect(await json.text()).toBe(`{"message":"No query results for model [${MODEL}] ${MISSING}"}`)
    const malformed = await facultyLogo(get("/logos/facultad/abc"), "abc", { store })
    expect([malformed.status, await malformed.text(), cookieNames(malformed)]).toEqual([404, NOT_FOUND_PAGE, []])
  })
})

describe("GET /plantilla.schema.json", () => {
  it("serves Laravel's schema file byte for byte without a session", async () => {
    const response = await templateSchema(get("/plantilla.schema.json"))
    const expected = await readFile(path.join(process.cwd(), "src", "server", "configuration", "plantilla.schema.json"))
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).equals(expected)).toBe(true)
    expect(JSON.parse(expected.toString("utf8")).title).toBe("Plantilla del sílabo")
    const headers = headersOf(response)
    expect({ ...headers, "last-modified": undefined }).toEqual({
      "content-type": "application/schema+json",
      "cache-control": "public",
      "content-length": String(expected.length),
      "accept-ranges": "bytes",
      "last-modified": undefined,
      ...SECURITY,
      "cross-origin-resource-policy": "same-origin",
    })
    expect(headers["last-modified"]).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/)
    expect(response.headers.getSetCookie()).toEqual([])
  })
})

describe("GET /images/silabo/{file}", () => {
  it("serves the default faculty logo that defaultFacultyUrl points to", async () => {
    const response = await publicSyllabusImage(get("/images/silabo/facultad.jpeg?v=1789530560"), "facultad.jpeg")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    expect(Buffer.from(await response.arrayBuffer()).equals(JPEG)).toBe(true)
  })

  it("answers not found for files outside the public syllabus images", async () => {
    for (const file of ["otro.png", "..%2F..%2F.env", "../index.php"]) {
      const response = await publicSyllabusImage(get(`/images/silabo/${file}`), file)
      expect(response.status).toBe(404)
    }
  })
})
