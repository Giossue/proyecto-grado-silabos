// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import type { ReviewRevision } from "../syllabus/reviewDetails"
import type { DetailSyllabus } from "../syllabus/syllabusDetail"
import { createRateLimiter } from "../laravel/throttle"
import { downloadExport, requestRevisionDocuments, revisionDocuments, type ArtifactRow, type DocumentDeps, type DocumentRequestDeps, type StoredArtifact } from "./revisionDocuments"
import type { ExportArtifactRow } from "./syllabusExport"
import { laravelSlug } from "./slug"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const NOT_FOUND = '{\n    "message": ""\n}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const REVISION = "70000000-0000-4000-8000-000000000001"
const ARTIFACT = "e1000000-0000-4000-8000-000000000001"
const OBJECT = "f1000000-0000-4000-8000-000000000001"

let root: string
let world: FakeWorld
let forwarded: Request[]
let syllabus: DetailSyllabus
let revision: ReviewRevision | null
let approval: { approvedAt: string; approvedBy: string } | null
let artifacts: ArtifactRow[]
let artifact: StoredArtifact | null
let audits: AuditEventInput[]

function deps(): DocumentDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    store: {
      revision: async (id) => (revision !== null && revision.id === id ? revision : null),
      syllabus: async () => syllabus,
      approval: async () => approval,
      artifacts: async () => artifacts,
      artifact: async (id) => (artifact !== null && artifact.id === id ? artifact : null),
      recordAudit: async (event) => void audits.push(event),
    },
    now: () => NOW,
  }
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-documents-"))
  process.env.LARAVEL_STORAGE_PATH = path.join(root, "storage", "app")
  await mkdir(path.join(root, "storage", "app", "private", "exports", REVISION, ARTIFACT), { recursive: true })
  await writeFile(path.join(root, "storage", "app", "private", "exports", REVISION, ARTIFACT, "syllabus.pdf"), "%PDF-1.7 prueba\n%%EOF\n")
})

afterAll(async () => {
  delete process.env.LARAVEL_STORAGE_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  forwarded = []
  world = {
    sessions: new Map([[golden.sessionId, { id: golden.sessionId, userId: golden.userId, payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  syllabus = {
    id: SYLLABUS,
    state: "aprobado",
    careerId: CAREER,
    convocationState: "abierta",
    processState: "abierto",
    dueOn: "2026-12-01",
    currentTeacher: false,
    writtenByUser: false,
    hasLibrarySubmission: true,
    subjectId: "a0000000-0000-4000-8000-000000000001",
    convocationId: "b0000000-0000-4000-8000-000000000001",
    subject: "Biología",
    code: "BIO 101/Á",
    parallel: "A",
    career: "Software",
    period: "2026-2",
    startedAt: null,
    savedAt: null,
    version: 9,
    context: [],
  }
  revision = { id: REVISION, syllabusId: SYLLABUS, number: 3, submittedAt: NOW - 100, submittedBy: "Ana", fingerprint: "f".repeat(64) }
  approval = { approvedAt: "2026-11-20T15:00:00+00:00", approvedBy: "María José Pérez López" }
  artifacts = [
    { id: ARTIFACT, state: "completado", requestedAt: "2026-11-20T15:00:00+00:00", completedAt: "2026-11-20T15:00:09+00:00", pdfSize: 18432 },
    { id: "e1000000-0000-4000-8000-000000000002", state: "fallido", requestedAt: "2026-11-20T14:00:00+00:00", completedAt: null, pdfSize: null },
    { id: "e1000000-0000-4000-8000-000000000003", state: "pendiente", requestedAt: "2026-11-20T13:00:00+00:00", completedAt: null, pdfSize: null },
  ]
  artifact = { id: ARTIFACT, revisionId: REVISION, state: "completado", object: { id: OBJECT, disk: "private", path: `exports/${REVISION}/${ARTIFACT}/syllabus.pdf` } }
  audits = []
})

const get = (target: string) => apiRequest(target, { cookie })

describe("GET revisions/{r}/documents", () => {
  it("lists the export artifacts of an approved revision", async () => {
    const response = await revisionDocuments(get(`/api/v1/revisions/${REVISION}/documents`), REVISION, deps())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      syllabus: { id: SYLLABUS, subject: "Biología", code: "BIO 101/Á", period: "2026-2" },
      revision: { id: REVISION, number: 3, approved_at: "2026-11-20T15:00:00+00:00", approved_by: "María José Pérez López" },
      artifacts: [
        { id: ARTIFACT, estado: "completado", requested_at: "2026-11-20T15:00:00+00:00", completed_at: "2026-11-20T15:00:09+00:00", renderer_label: "Formato institucional en revisión", error: null, files: { pdf_size: 18432 } },
        { id: "e1000000-0000-4000-8000-000000000002", estado: "fallido", requested_at: "2026-11-20T14:00:00+00:00", completed_at: null, renderer_label: "Formato institucional en revisión", error: "No se pudo generar el PDF. Puede reintentar.", files: null },
        { id: "e1000000-0000-4000-8000-000000000003", estado: "pendiente", requested_at: "2026-11-20T13:00:00+00:00", completed_at: null, renderer_label: "Formato institucional en revisión", error: null, files: null },
      ],
    })
  })

  it("forbids people who cannot see the syllabus and hides revisions that were not approved", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000099" })]
    expect(await (await revisionDocuments(get(`/api/v1/revisions/${REVISION}/documents`), REVISION, deps())).text()).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    approval = null
    const missing = await revisionDocuments(get(`/api/v1/revisions/${REVISION}/documents`), REVISION, deps())
    expect([missing.status, await missing.text()]).toEqual([404, NOT_FOUND])
  })
})

describe("GET exports/{a}/pdf", () => {
  it("downloads the stored PDF with the Laravel headers and audits it", async () => {
    const response = await downloadExport(get(`/api/v1/exports/${ARTIFACT}/pdf`), ARTIFACT, deps())
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("%PDF-1.7 prueba\n%%EOF\n")
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-length")).toBe("22")
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=silabo-bio-101a-revision-3.pdf")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(audits).toEqual([
      {
        actorId: golden.userId,
        roleAssignmentId: golden.roleId,
        action: "documento.descargado",
        resourceType: "artefacto_exportacion",
        resourceId: ARTIFACT,
        result: "exito",
        metadata: { format: "pdf", revision_number: 3, object_id: OBJECT },
        occurredAt: NOW,
      },
    ])
  })

  it("forbids incomplete exports and answers 404 when the file is gone", async () => {
    artifact = { ...artifact!, state: "pendiente" }
    expect(await (await downloadExport(get(`/api/v1/exports/${ARTIFACT}/pdf`), ARTIFACT, deps())).text()).toBe(FORBIDDEN)
    artifact = { ...artifact, state: "completado", object: { id: OBJECT, disk: "private", path: "exports/no-existe.pdf" } }
    const gone = await downloadExport(get(`/api/v1/exports/${ARTIFACT}/pdf`), ARTIFACT, deps())
    expect([gone.status, await gone.text()]).toEqual([404, NOT_FOUND])
    artifact = { ...artifact, object: null }
    expect((await downloadExport(get(`/api/v1/exports/${ARTIFACT}/pdf`), ARTIFACT, deps())).status).toBe(404)
    expect(audits).toEqual([])
  })
})

describe("POST revisions/{r}/documents", () => {
  const KEY = "9a5b0c3e-4f1d-4a2b-8c7d-6e5f4a3b2c1d"
  const NEW_ARTIFACT = "0a000000-0000-7000-8000-000000000001"
  type Requested = { id: string; revisionId: string; key: string; requestedBy: string; requestedAt: number; state: string }
  let requested: Requested[]
  let dispatched: string[]
  let renderable: boolean
  let approved: boolean
  let limiter: ReturnType<typeof createRateLimiter>

  function requestDeps(): DocumentRequestDeps {
    const existing = async (revisionId: string, key: string): Promise<ExportArtifactRow | null> => {
      const row = requested.find((item) => item.revisionId === revisionId && item.key === key)
      return row ? { id: row.id, state: row.state, requestedBy: row.requestedBy } : null
    }
    return {
      ...deps(),
      limiter,
      renderable: async () => renderable,
      existing,
      newId: () => NEW_ARTIFACT,
      async transaction(work) {
        const staged: Requested[] = []
        const stagedDispatch: string[] = []
        const result = await work({
          existingArtifact: existing,
          lockSyllabus: async (id) => id === SYLLABUS,
          lockRevision: async (id) => (id === REVISION ? { syllabusId: SYLLABUS, number: 3 } : null),
          approved: async () => approved,
          insertArtifact: async (row) => void staged.push({ ...row, state: "pendiente" }),
          dispatchExport: (id) => void stagedDispatch.push(id),
          recordAudit: async (event) => void audits.push(event),
        })
        requested.push(...staged)
        dispatched.push(...stagedDispatch)
        return result
      },
    }
  }

  const post = async (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) => {
    const request = new Request(apiRequest(`/api/v1/revisions/${REVISION}/documents`, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, ...headers } }), {
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
    const response = await requestRevisionDocuments(request, REVISION, requestDeps())
    return { status: response.status, text: await response.text(), limit: response.headers.get("x-ratelimit-limit"), remaining: response.headers.get("x-ratelimit-remaining") }
  }

  beforeEach(() => {
    requested = []
    dispatched = []
    renderable = true
    approved = true
    limiter = createRateLimiter()
  })

  it("requests the PDF of an approved revision once per idempotency key", async () => {
    expect(await post({ idempotency_key: KEY })).toEqual({ status: 202, text: `{"message":"El PDF se est\\u00e1 generando.","artifact_id":"${NEW_ARTIFACT}"}`, limit: "20", remaining: "19" })
    expect(requested).toEqual([{ id: NEW_ARTIFACT, revisionId: REVISION, key: KEY, requestedBy: golden.userId, requestedAt: NOW, state: "pendiente" }])
    expect(dispatched).toEqual([NEW_ARTIFACT])
    expect(audits).toEqual([
      {
        actorId: golden.userId,
        roleAssignmentId: golden.roleId,
        action: "documento.exportacion_solicitada",
        resourceType: "artefacto_exportacion",
        resourceId: NEW_ARTIFACT,
        result: "exito",
        metadata: { revision_number: 3, renderer_version: "phpword-docx-v4+libreoffice-pdf-v1" },
        occurredAt: NOW,
      },
    ])
    expect((await post({ idempotency_key: KEY })).status).toBe(202)
    expect([requested.length, dispatched.length, audits.length]).toEqual([1, 1, 1])
  })

  it("says the PDF was already available for a completed request", async () => {
    requested = [{ id: ARTIFACT, revisionId: REVISION, key: KEY, requestedBy: golden.userId, requestedAt: NOW - 10, state: "completado" }]
    expect((await post({ idempotency_key: KEY })).text).toBe(`{"message":"El PDF ya estaba disponible.","artifact_id":"${ARTIFACT}"}`)
    expect(dispatched).toEqual([])
  })

  it("forbids reusing someone else's key", async () => {
    requested = [{ id: ARTIFACT, revisionId: REVISION, key: KEY, requestedBy: "a1000000-0000-4000-8000-000000000009", requestedAt: NOW - 10, state: "pendiente" }]
    expect(await post({ idempotency_key: KEY })).toMatchObject({ status: 403, text: NOT_FOUND })
  })

  it("only an approved revision generates documents", async () => {
    approved = false
    expect(await post({ idempotency_key: KEY })).toMatchObject({
      status: 422,
      text: '{"message":"Solo una revisi\\u00f3n aprobada puede generar documentos.","errors":{"revision":["Solo una revisi\\u00f3n aprobada puede generar documentos."]}}',
    })
    expect(requested).toEqual([])
  })

  it("validates the idempotency key and authorizes like viewing the revision", async () => {
    expect((await post({ idempotency_key: "no-es-uuid" })).text).toBe(
      '{"message":"El campo identificador de la solicitud debe ser un UUID v\\u00e1lido.","errors":{"idempotency_key":["El campo identificador de la solicitud debe ser un UUID v\\u00e1lido."]}}',
    )
    expect((await post({})).text).toBe('{"message":"El campo identificador de la solicitud es obligatorio.","errors":{"idempotency_key":["El campo identificador de la solicitud es obligatorio."]}}')
    world.assignments = [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })]
    expect(await post({ idempotency_key: KEY })).toEqual({ status: 403, text: FORBIDDEN, limit: "20", remaining: "17" })
    expect(requested).toEqual([])
  })

  it("throttles at 20 requests a minute", async () => {
    for (let attempt = 0; attempt < 20; attempt++) await post({ idempotency_key: KEY })
    const limited = await post({ idempotency_key: KEY })
    expect([limited.status, limited.limit, limited.remaining]).toEqual([429, "20", "0"])
  })

  it("leaves to Laravel what Next cannot render or read", async () => {
    renderable = false
    expect((await post({ idempotency_key: KEY })).text).toBe("from-laravel")
    renderable = true
    expect((await post("idempotency_key=x", { "content-type": "application/x-www-form-urlencoded" })).text).toBe("from-laravel")
    expect(requested).toEqual([])
    expect(forwarded).toHaveLength(2)
  })
})

describe("Str::slug", () => {
  it.each([
    ["BIO 101/Á", "bio-101a"],
    ["ALG-101", "alg-101"],
    ["  Ñandú_2026 ", "nandu-2026"],
    ["a@b", "a-at-b"],
    ["///", ""],
  ])("%s → %s", (value, expected) => {
    expect(laravelSlug(value)).toBe(expected)
  })
})
