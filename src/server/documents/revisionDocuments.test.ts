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
import { downloadExport, revisionDocuments, type ArtifactRow, type DocumentDeps, type StoredArtifact } from "./revisionDocuments"
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
