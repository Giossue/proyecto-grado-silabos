// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import type { ListSort } from "@/schemas/listSort"
import type { SyllabusFacts } from "./policy"
import {
  compareRevisions,
  coordinationHistory,
  coordinationReviews,
  type CoordinationReviewRepository,
  type HistoryFilters,
  type HistoryRow,
  type ReviewListRow,
  type RevisionRecord,
} from "./coordinationReviews"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` })

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const OTHER_SYLLABUS = "50000000-0000-4000-8000-000000000002"
const REVISION_1 = "70000000-0000-4000-8000-000000000001"
const REVISION_2 = "70000000-0000-4000-8000-000000000002"
const FOREIGN_REVISION = "70000000-0000-4000-8000-000000000003"
const PERIOD = "e0000000-0000-4000-8000-000000000001"

let world: FakeWorld
let reviewCalls: unknown[]
let historyCalls: HistoryFilters[]
let reviewRows: ReviewListRow[]
let historyRows: HistoryRow[]
let facts: Map<string, SyllabusFacts>
let revisions: Map<string, RevisionRecord>

const reviewRow = (overrides: Partial<ReviewListRow> = {}): ReviewListRow => ({
  id: SYLLABUS,
  subject: "Redes",
  code: "SW-501",
  period: "2026-2",
  state: "en_revision",
  revisionId: REVISION_2,
  revisionNumber: 2,
  submittedAt: "2026-11-20T14:00:00+00:00",
  approved: false,
  verified: true,
  ...overrides,
})

const snapshot = (value: string, extra: object[] = []) => ({
  sections: [
    { key: "datos", title: "Datos", fields: [{ key: "descripcion", label: "Descripción", quien_llena: "carrera", value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] } }, ...extra] },
    { key: "cierre", blocks: [{ fields: [{ key: "firmas", value: null }] }] },
  ],
})

const repository = (): CoordinationReviewRepository => ({
  async reviewPage(filters, page, perPage) {
    reviewCalls.push({ filters, page, perPage })
    return { total: reviewRows.length, items: reviewRows }
  },
  async teacherNames(ids) {
    return new Map(ids.map((id) => [id, ["Ana", "Luis"]]))
  },
  async historyPage(filters, page, perPage) {
    historyCalls.push(filters)
    return { total: historyRows.length * page * 0 + historyRows.length, items: perPage === 20 ? historyRows : [] }
  },
  async historyPeriods() {
    return [{ id: PERIOD, code: "2025-2026" }]
  },
  async periodExists(id) {
    return id.toLowerCase() === PERIOD
  },
  async revision(id) {
    return revisions.get(id.toLowerCase()) ?? null
  },
  async syllabus(id) {
    return facts.get(id) ?? null
  },
  async syllabusSummary(id) {
    return {
      id,
      subject: "Redes",
      code: "SW-501",
      period: "2026-2",
      revisions: [
        { id: REVISION_1, number: 1, submittedAt: "2026-11-01T10:00:00+00:00" },
        { id: REVISION_2, number: 2, submittedAt: "2026-11-10T10:00:00+00:00" },
      ],
    }
  },
})

const deps = () => ({ bridge: fakeDeps(world), reviews: repository() })

async function call(handler: (request: Request) => Promise<Response>, path: string) {
  const response = await handler(apiRequest(path, { cookie }))
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const syllabusFacts = (overrides: Partial<SyllabusFacts> = {}): SyllabusFacts => ({
  id: SYLLABUS,
  state: "en_revision",
  careerId: CAREER,
  convocationState: "abierta",
  processState: "abierto",
  dueOn: "2026-12-10",
  currentTeacher: false,
  writtenByUser: false,
  hasLibrarySubmission: false,
  ...overrides,
})

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  reviewCalls = []
  historyCalls = []
  reviewRows = [reviewRow()]
  historyRows = [{ id: SYLLABUS, subject: "Bases de Datos", code: "SW-602", period: "2024-2025", parallel: "B", revisionId: REVISION_1, author: "Ana", approvedAt: "2025-02-01T10:00:00+00:00" }]
  facts = new Map([
    [SYLLABUS, syllabusFacts()],
    [OTHER_SYLLABUS, syllabusFacts({ id: OTHER_SYLLABUS })],
  ])
  revisions = new Map([
    [REVISION_1, { id: REVISION_1, syllabusId: SYLLABUS, number: 1, snapshot: snapshot("Antes") }],
    [REVISION_2, { id: REVISION_2, syllabusId: SYLLABUS, number: 2, snapshot: snapshot("Después", [{ key: "nuevo", value: "x" }]) }],
    [FOREIGN_REVISION, { id: FOREIGN_REVISION, syllabusId: OTHER_SYLLABUS, number: 1, snapshot: snapshot("Otro") }],
  ])
})

describe("GET /api/v1/coordination/reviews", () => {
  it("lists the syllabi waiting for Coordination with the exact payload", async () => {
    const { status, text, json } = await call((request) => coordinationReviews(request, deps()), "/api/v1/coordination/reviews?search=%20redes%20")
    expect(status).toBe(200)
    expect(reviewCalls).toEqual([{ filters: { careerId: CAREER, search: "redes" }, page: 1, perPage: 20 }])
    expect(json?.filters).toEqual({ search: "redes" })
    expect((json?.syllabi as { data: unknown }).data).toEqual([
      {
        id: SYLLABUS,
        revision_id: REVISION_2,
        revision_number: 2,
        subject: "Redes",
        code: "SW-501",
        period: "2026-2",
        state: "en_revision",
        stage: "coordinacion",
        teachers: ["Ana", "Luis"],
        submitted_at: "2026-11-20T14:00:00+00:00",
      },
    ])
    expect(text).toBe(JSON.stringify(JSON.parse(text)))
  })

  it("keeps an empty search as an empty string and computes the stage of each revision", async () => {
    reviewRows = [reviewRow({ verified: false }), reviewRow({ approved: true }), reviewRow({ state: "aprobado" }), reviewRow({ revisionId: null, revisionNumber: null, submittedAt: null })]
    const { json } = await call((request) => coordinationReviews(request, deps()), "/api/v1/coordination/reviews")
    expect(json?.filters).toEqual({ search: "" })
    expect((json?.syllabi as { data: { stage: unknown }[] }).data.map((item) => item.stage)).toEqual(["biblioteca", "biblioteca", null, null])
  })

  it("forbids a teacher and validates the search", async () => {
    expect((await call((request) => coordinationReviews(request, deps()), `/api/v1/coordination/reviews?search=${"a".repeat(121)}`)).json?.errors).toEqual({
      search: ["El campo búsqueda no debe tener más de 120 caracteres."],
    })
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await call((request) => coordinationReviews(request, deps()), "/api/v1/coordination/reviews")).text).toBe(FORBIDDEN)
  })
})

describe("ordering the coordination lists", () => {
  const subjects = Array.from({ length: 25 }, (_, index) => `Materia ${String(index + 1).padStart(2, "0")}`)
  let sorts: unknown[]

  const sortedPage = <T extends { subject: string }>(rows: T[], sort: ListSort | undefined, page: number, perPage: number) => {
    sorts.push(sort ?? null)
    const ordered = sort ? rows.toSorted((left, right) => (sort.direction === "asc" ? 1 : -1) * left.subject.localeCompare(right.subject)) : rows
    return { total: rows.length, items: ordered.slice((page - 1) * perPage, page * perPage) }
  }

  const sortingDeps = () => ({
    bridge: fakeDeps(world),
    reviews: {
      ...repository(),
      reviewPage: async (_filters: unknown, page: number, perPage: number, sort?: ListSort) =>
        sortedPage(subjects.map((subject, index) => reviewRow({ id: `${SYLLABUS.slice(0, -2)}${String(index).padStart(2, "0")}`, subject })), sort, page, perPage),
      historyPage: async (_filters: unknown, page: number, perPage: number, sort?: ListSort) =>
        sortedPage(subjects.map((subject) => ({ ...historyRows[0]!, subject })), sort, page, perPage),
    },
  })

  beforeEach(() => {
    sorts = []
  })

  it("sorts the review queue by the chosen column across every page", async () => {
    const { status, json } = await call((request) => coordinationReviews(request, sortingDeps()), "/api/v1/coordination/reviews?sort=subject&dir=desc&page=2")
    expect(status).toBe(200)
    expect(sorts).toEqual([{ column: "subject", direction: "desc" }])
    expect((json?.syllabi as { data: { subject: string }[] }).data.map((item) => item.subject)).toEqual(["Materia 05", "Materia 04", "Materia 03", "Materia 02", "Materia 01"])
  })

  it("sorts the history by the chosen column and defaults the direction to ascending", async () => {
    const { json } = await call((request) => coordinationHistory(request, sortingDeps()), "/api/v1/coordination/history?sort=code")
    expect(sorts).toEqual([{ column: "code", direction: "asc" }])
    expect(json?.filters).toEqual({ q: null, period: null })
  })

  it("keeps today's order and payload when no column is chosen", async () => {
    const plain = await call((request) => coordinationReviews(request, deps()), "/api/v1/coordination/reviews?page=1")
    const sorting = await call((request) => coordinationReviews(request, sortingDeps()), "/api/v1/coordination/reviews?page=1")
    expect(sorts).toEqual([null])
    expect(Object.keys(sorting.json!)).toEqual(Object.keys(plain.json!))
    expect((sorting.json?.syllabi as { data: { subject: string }[] }).data.map((item) => item.subject)).toEqual(subjects.slice(0, 20))
  })

  it("rejects a column or direction outside the whitelist", async () => {
    const reviews = await call((request) => coordinationReviews(request, sortingDeps()), "/api/v1/coordination/reviews?sort=password&dir=sideways")
    expect(reviews.status).toBe(422)
    expect(reviews.json?.errors).toEqual({
      sort: ["El valor seleccionado en orden no es válido."],
      dir: ["El valor seleccionado en dirección del orden no es válido."],
    })
    const history = await call((request) => coordinationHistory(request, sortingDeps()), "/api/v1/coordination/history?sort=teacher")
    expect(history.status).toBe(422)
    expect(sorts).toEqual([])
  })
})

describe("GET /api/v1/coordination/history", () => {
  it("lists the approved syllabi of past periods with their periods", async () => {
    const { status, text } = await call((request) => coordinationHistory(request, deps()), `/api/v1/coordination/history?q=bases%20de%20d%C3%A1tos&period=${PERIOD}`)
    expect(status).toBe(200)
    expect(historyCalls).toEqual([{ careerId: CAREER, search: "bases de dátos", periodId: PERIOD }])
    const json = JSON.parse(text)
    expect(json.filters).toEqual({ q: "bases de dátos", period: PERIOD })
    expect(json.periods).toEqual([{ id: PERIOD, code: "2025-2026" }])
    expect(json.syllabi.data).toEqual([
      { id: SYLLABUS, revision_id: REVISION_1, period: "2024-2025", subject: "Bases de Datos", code: "SW-602", parallels: ["B"], author: "Ana", approved_at: "2025-02-01T10:00:00+00:00" },
    ])
    expect(Object.keys(json)).toEqual(["filters", "periods", "syllabi"])
  })

  it("validates the period and the search with their Spanish names", async () => {
    const { status, json } = await call((request) => coordinationHistory(request, deps()), `/api/v1/coordination/history?period=e0000000-0000-4000-8000-00000000ffff`)
    expect(status).toBe(422)
    expect(json?.errors).toEqual({ period: ["El valor seleccionado en período no es válido."] })
    expect((await call((request) => coordinationHistory(request, deps()), "/api/v1/coordination/history?period=abc")).json?.errors).toEqual({
      period: ["El campo período debe ser un UUID válido."],
    })
  })

  it("only lets the active coordinator read it", async () => {
    world.assignments = [makeAssignment({ role: "bibliotecario", careerId: null })]
    expect((await call((request) => coordinationHistory(request, deps()), "/api/v1/coordination/history")).text).toBe(FORBIDDEN)
  })
})

describe("GET /api/v1/coordination/reviews/{before}/compare/{after}", () => {
  const compare = (before: string, after: string) => call((request) => compareRevisions(request, before, after, deps()), `/api/v1/coordination/reviews/${before}/compare/${after}`)

  it("compares two revisions of the same syllabus in revision order", async () => {
    const { status, text } = await compare(REVISION_2, REVISION_1)
    expect(status).toBe(200)
    expect(text).toBe(
      JSON.stringify({
        syllabus: {
          id: SYLLABUS,
          subject: "Redes",
          code: "SW-501",
          period: "2026-2",
          current_revision_id: REVISION_2,
          revisions: [
            { id: REVISION_1, number: 1, submitted_at: "2026-11-01T10:00:00+00:00" },
            { id: REVISION_2, number: 2, submitted_at: "2026-11-10T10:00:00+00:00" },
          ],
        },
        comparison: {
          before_revision: 1,
          after_revision: 2,
          changed_fields: 2,
          changes: [
            {
              section_key: "datos",
              section_title: "Datos",
              field_key: "descripcion",
              label: "Descripción",
              quien_llena: "carrera",
              change: "modified",
              before: { value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Antes" }] }] } },
              after: { value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Después" }] }] } },
            },
            { section_key: "datos", section_title: "Datos", field_key: "nuevo", label: "nuevo", quien_llena: "docente", change: "added", before: null, after: { value: "x" } },
          ],
        },
      }),
    )
  })

  it("rejects revisions of different syllabi", async () => {
    const { status, json } = await compare(REVISION_1, FOREIGN_REVISION)
    expect(status).toBe(422)
    expect(json).toEqual({ message: "Solo pueden compararse revisiones del mismo expediente.", errors: { revisions: ["Solo pueden compararse revisiones del mismo expediente."] } })
  })

  it("aborts with an empty 403 when a revision is not visible and leaves unknown ones to Laravel", async () => {
    facts.set(OTHER_SYLLABUS, syllabusFacts({ id: OTHER_SYLLABUS, careerId: "c0000000-0000-4000-8000-000000000009" }))
    const denied = await compare(REVISION_1, FOREIGN_REVISION)
    expect(denied.status).toBe(403)
    expect(denied.text).toBe('{"message":""}')
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    facts.set(SYLLABUS, syllabusFacts({ writtenByUser: true }))
    expect((await compare(REVISION_1, REVISION_2)).status).toBe(200)
    expect(await compare(REVISION_1, "70000000-0000-4000-8000-00000000ffff")).toMatchObject({ status: 404, text: modelNotFound("SyllabusRevision", "70000000-0000-4000-8000-00000000ffff") })
    expect(await compare("x", REVISION_2)).toMatchObject({ status: 404, text: modelNotFound("SyllabusRevision", "x") })
  })
})
