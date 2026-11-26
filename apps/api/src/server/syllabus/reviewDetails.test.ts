// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { goldenTemplate } from "../configuration/testing"
import type { LibraryReviewRepository } from "../library/reviews"
import { coordinationReviewDetail, libraryReviewDetail, type HistoryEntry, type ReviewDetailStore, type ReviewRevision } from "./reviewDetails"
import type { DetailSyllabus, ReviewComment } from "./syllabusDetail"
import type { SignatureRecord } from "./snapshotDocuments"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` })

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const EMPTY_403 = '{"message":""}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const FIRST = "70000000-0000-4000-8000-000000000001"
const SECOND = "70000000-0000-4000-8000-000000000002"
const COORDINATOR = "90000000-0000-4000-8000-000000000001"

let root: string
let world: FakeWorld
let syllabus: DetailSyllabus
let revisions: ReviewRevision[]
let history: HistoryEntry[]
let signatures: SignatureRecord[]
let submission: Awaited<ReturnType<ReviewDetailStore["librarySubmission"]>>
let comments: ReviewComment[]

const template = goldenTemplate()
const field = template.sections[0].blocks[0].fields[0]
const snapshot = {
  identification: { subject: "Biología" },
  template_definition: template.definition,
  template_variables: { nombre_asignatura: "Biología" },
  sections: [
    { key: "datos", title: "Datos", fields: [{ definition_id: field.id, key: field.key, label: field.label, quien_llena: "carrera", document: { type: "doc", content: [{ type: "paragraph" }] } }] },
    { key: "bibliografia", title: "Bibliografía", orientation: "landscape", fields: [] },
  ],
}

const store = (): ReviewDetailStore => ({
  revision: async (id) => revisions.find((item) => item.id === id.toLowerCase()) ?? null,
  syllabus: async () => syllabus,
  teachers: async () => ["Ana Pérez", "Ana Pérez"],
  history: async () => history,
  snapshot: async () => snapshot,
  signatures: async () => signatures,
  librarySubmission: async () => submission,
  userName: async (id) => (id === COORDINATOR ? "Coordinadora" : null),
  comments: async (_id, stage) => comments.filter((comment) => comment.stage === stage),
})

const libraryReviews = (): LibraryReviewRepository => ({
  page: async () => ({ total: 0, items: [] }),
  summaries: async () => new Map([[SYLLABUS, { subject: "Biología", code: "C2", faculty: "Ciencias", career: "Software", period: "2026-2", parallel: "A", teachers: ["Ana Pérez"] }]]),
  userNames: async () => new Map(),
  faculties: async () => [],
  pastPeriods: async () => [],
  existing: async () => 0,
})

const deps = () => ({ bridge: fakeDeps(world), store: store(), libraryReviews: libraryReviews(), logos: { faculty: async () => null } })

const entry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: FIRST,
  number: 1,
  submittedAt: "2026-11-18T11:06:40+00:00",
  submittedBy: "Ana Pérez",
  coordination: null,
  approval: null,
  library: { verifiedAt: null, verifier: null, inherited: false },
  correction: null,
  ...overrides,
})

const revision = (overrides: Partial<ReviewRevision> = {}): ReviewRevision => ({
  id: FIRST,
  syllabusId: SYLLABUS,
  number: 1,
  submittedAt: 1795000000,
  submittedBy: "Ana Pérez",
  fingerprint: "a".repeat(64),
  ...overrides,
})

async function call(handler: typeof coordinationReviewDetail, url: string, id: string) {
  const response = await handler(apiRequest(url, { cookie }), id, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, ReturnType<typeof JSON.parse>>) : null }
}

const coordination = (id = FIRST) => call(coordinationReviewDetail, `/api/v1/coordination/reviews/${id}`, id)
const library = (id = FIRST, query = "") => call(libraryReviewDetail, `/api/v1/library/reviews/${id}${query}`, id)

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-reviews-"))
  process.env.STORAGE_PATH = path.join(root, "storage", "app")
  process.env.PUBLIC_ASSETS_PATH = path.join(root, "public")
})

afterAll(async () => {
  delete process.env.STORAGE_PATH
  delete process.env.PUBLIC_ASSETS_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { id: golden.sessionId, userId: golden.userId, payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  syllabus = {
    id: SYLLABUS,
    state: "en_revision",
    careerId: CAREER,
    convocationState: "abierto",
    processState: "abierto",
    dueOn: "2026-12-01",
    currentTeacher: false,
    writtenByUser: false,
    hasLibrarySubmission: true,
    subjectId: "a0000000-0000-4000-8000-000000000001",
    convocationId: "b0000000-0000-4000-8000-000000000001",
    subject: "Biología",
    code: "C2",
    parallel: "A",
    career: "Software",
    period: "2026-2",
    startedAt: null,
    savedAt: null,
    version: 4,
    context: {},
  }
  revisions = [revision()]
  history = [entry({ library: { verifiedAt: "2026-11-19T10:00:00+00:00", verifier: "Bibliotecario", inherited: false } })]
  signatures = []
  submission = { sentAt: 1795000000, sentBy: "Ana Pérez", verifiedAt: null, verifiedBy: null, state: "pendiente", outcome: null, responsibleId: null }
  comments = []
})

describe("GET coordination/reviews/{revision}", () => {
  it("lets the coordinator decide the current revision once the library verified it, with the signing statement", async () => {
    const { status, json } = await coordination()
    expect(status).toBe(200)
    expect(Object.keys(json!)).toEqual([
      "syllabus", "my_stage", "can_decide", "signing_statement", "signatures", "presentation", "revision", "history", "timeline",
      "correction_request", "decisions_allowed", "convocation_closed", "decision_block", "reset",
    ])
    expect(json).toMatchObject({
      syllabus: { id: SYLLABUS, subject: "Biología", code: "C2", period: "2026-2", state: "en_revision", stage: "coordinacion", teachers: ["Ana Pérez", "Ana Pérez"] },
      my_stage: "coordinacion",
      can_decide: true,
      signing_statement: `silabos-ueb|silabo:${SYLLABUS}|accion:aprobacion_coordinacion|huella:${"a".repeat(64)}`,
      signatures: [],
      revision: { id: FIRST, number: 1, submitted_at: "2026-11-18T11:06:40+00:00", submitted_by: "Ana Pérez", is_current: true },
      history: [{ id: FIRST, number: 1, submitted_at: "2026-11-18T11:06:40+00:00", submitted_by: "Ana Pérez", coordination_reviewed_at: null, coordination_reviewed_by: null, approved_at: null, approved_by: null }],
      timeline: [
        { kind: "biblioteca_verifico", at: "2026-11-19T10:00:00+00:00", revision_id: FIRST, revision_number: 1, by: "Bibliotecario", comment: null, previous_id: null },
        { kind: "enviado", at: "2026-11-18T11:06:40+00:00", revision_id: FIRST, revision_number: 1, by: "Ana Pérez", comment: null, previous_id: null },
      ],
      correction_request: null,
      decisions_allowed: true,
      convocation_closed: false,
      decision_block: null,
      reset: { allowed: false, erases_history: false, revisions: 1, signatures: 0, has_pdf: false },
    })
    expect(json!.presentation.logos).toEqual({ institution: "http://localhost:3000/logos/institucion?v=0", faculty: "http://localhost:3000/images/silabo/facultad.jpeg?v=0" })
    expect(json!.revision.snapshot.sections[1]).toMatchObject({ key: "bibliografia", orientation: "landscape", fields: [] })
    expect(json!.revision.snapshot.sections[0].fields[0]).toMatchObject({ id: field.id, quien_llena: "carrera", teacher_editable: false, required: false })
  })

  it("orders a resubmission after a coordination correction and blocks decisions while the convocation is paused", async () => {
    syllabus = { ...syllabus, convocationState: "pausado" }
    revisions = [revision(), revision({ id: SECOND, number: 2, submittedAt: 1795100000 })]
    history = [
      entry({ correction: { stage: "coordinacion", at: "2026-11-19T12:00:00+00:00", by: "Coordinadora", justification: "Ajuste la bibliografía." } }),
      entry({ id: SECOND, number: 2, submittedAt: "2026-11-19T14:53:20+00:00" }),
    ]
    const { json } = await coordination(FIRST)
    expect(json).toMatchObject({
      syllabus: { stage: null },
      can_decide: false,
      signing_statement: null,
      revision: { is_current: false },
      correction_request: { justification: "Ajuste la bibliografía.", stage: "coordinacion", requested_by: "Coordinadora", requested_at: "2026-11-19T12:00:00+00:00" },
      decisions_allowed: false,
      convocation_closed: false,
      decision_block: "El periodo académico de la carrera está en pausa: las revisiones se retoman cuando se reanude.",
    })
    expect(json!.timeline.map((event: { kind: string; previous_id: string | null }) => [event.kind, event.previous_id])).toEqual([
      ["enviado", FIRST],
      ["correccion", null],
      ["enviado", null],
    ])
  })

  it("forbids the review to a coordinator of another career and leaves unknown revisions to Laravel", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000009" })]
    expect(await coordination()).toMatchObject({ status: 403, text: EMPTY_403 })
    expect(await coordination("70000000-0000-4000-8000-000000000099")).toMatchObject({ status: 404, text: modelNotFound("SyllabusRevision", "70000000-0000-4000-8000-000000000099") })
    expect(await coordination("x")).toMatchObject({ status: 404, text: modelNotFound("SyllabusRevision", "x") })
  })
})

describe("GET library/reviews/{revision}", () => {
  beforeEach(() => {
    world.assignments = [makeAssignment({ role: "bibliotecario", careerId: null })]
    history = [entry()]
  })

  it("shows the pending bibliography to the librarian with the comment reasons and the library signing statement", async () => {
    comments = [{ stage: "biblioteca", comment: "El ISBN es incorrecto.", commented_at: "2026-11-10T10:00:00+00:00", commented_by: "Bibliotecario", revision_number: 1 }]
    const { status, json } = await library()
    expect(status).toBe(200)
    const review = json!.review
    expect(Object.keys(review)).toEqual([
      "syllabus_id", "subject", "code", "faculty", "career", "period", "parallels", "teachers", "revision_number", "revision_id", "sent_at", "sent_by",
      "state", "outcome", "responsible", "assigned_to_other", "can_comment", "can_verify", "decision_block", "signing_statement", "signatures",
      "verified_at", "verified_by", "approved_at", "presentation", "template_variables", "sections", "comments", "comment_reasons",
    ])
    expect(review).toMatchObject({
      syllabus_id: SYLLABUS,
      faculty: "Ciencias",
      career: "Software",
      parallels: ["A"],
      teachers: ["Ana Pérez"],
      revision_number: 1,
      revision_id: FIRST,
      sent_at: "2026-11-18T11:06:40+00:00",
      sent_by: "Ana Pérez",
      state: "pendiente",
      outcome: null,
      responsible: null,
      assigned_to_other: false,
      can_comment: true,
      can_verify: true,
      decision_block: null,
      signing_statement: `silabos-ueb|silabo:${SYLLABUS}|accion:aprobacion_biblioteca|huella:${"a".repeat(64)}`,
      verified_at: null,
      verified_by: null,
      approved_at: null,
      template_variables: { nombre_asignatura: "Biología" },
      comments: [{ comment: "El ISBN es incorrecto.", commented_at: "2026-11-10T10:00:00+00:00", commented_by: "Bibliotecario", revision_number: 1 }],
      comment_reasons: [
        { code: "libro_no_disponible", label: "El libro no está disponible en biblioteca" },
        { code: "codigo_incorrecto", label: "El código del libro es incorrecto" },
        { code: "isbn_incorrecto", label: "El ISBN es incorrecto" },
        { code: "edicion_desactualizada", label: "La edición está desactualizada" },
        { code: "datos_incompletos", label: "Los datos de la obra están incompletos" },
        { code: "otro", label: "Otro motivo" },
      ],
    })
    expect(review.sections).toHaveLength(1)
    expect(review.sections[0]).toMatchObject({ key: "bibliografia" })
  })

  it("warns when another librarian handles it and closes it once verified", async () => {
    submission = { ...submission!, responsibleId: COORDINATOR }
    expect((await library()).json!.review).toMatchObject({ responsible: "Coordinadora", assigned_to_other: true, can_verify: true })
    submission = { ...submission!, state: "atendido", outcome: "firmado", verifiedAt: "2026-11-19T10:00:00+00:00", verifiedBy: "Bibliotecario" }
    history = [entry({ library: { verifiedAt: "2026-11-19T10:00:00+00:00", verifier: "Bibliotecario", inherited: false } })]
    expect((await library()).json!.review).toMatchObject({ state: "atendido", outcome: "firmado", assigned_to_other: false, can_verify: false, signing_statement: null, verified_by: "Bibliotecario" })
  })

  it("rejects other roles, invalid filters and revisions that never went to the library", async () => {
    expect((await library(FIRST, "?state=otro")).status).toBe(422)
    submission = null
    expect(await library()).toMatchObject({ status: 404, text: '{"message":""}' })
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect(await library()).toMatchObject({ status: 403, text: '{"message":"No tiene permiso para hacer esto."}' })
    expect(await library("70000000-0000-4000-8000-000000000099")).toMatchObject({ status: 404, text: modelNotFound("SyllabusRevision", "70000000-0000-4000-8000-000000000099") })
  })
})
