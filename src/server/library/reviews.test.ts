// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { libraryHistory, libraryReviews, type LibraryReviewRepository, type ReviewFilters, type ReviewRow, type SyllabusSummary } from "./reviews"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const FACULTY = "f0000000-0000-4000-8000-000000000001"
const OTHER_FACULTY = "f0000000-0000-4000-8000-000000000002"
const PERIOD = "e0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const REVISION = "70000000-0000-4000-8000-000000000001"
const LIBRARIAN = golden.userId

let world: FakeWorld
let pages: { filters: ReviewFilters; page: number; perPage: number }[]
let rows: ReviewRow[]
let summaries: Map<string, SyllabusSummary>

const row = (overrides: Partial<ReviewRow> = {}): ReviewRow => ({
  revisionId: REVISION,
  syllabusId: SYLLABUS,
  revisionNumber: 1,
  sentAt: "2026-11-20T14:00:00+00:00",
  sentBy: "Docente Uno",
  signedBy: null,
  responsibleId: LIBRARIAN,
  state: "atendido",
  outcome: "devuelto",
  ...overrides,
})

const repository = (): LibraryReviewRepository => ({
  async page(filters, page, perPage) {
    pages.push({ filters, page, perPage })
    return { total: rows.length, items: rows.slice((page - 1) * perPage, page * perPage) }
  },
  async summaries(ids) {
    return new Map(ids.flatMap((id) => (summaries.has(id) ? [[id, summaries.get(id) as SyllabusSummary]] : [])))
  },
  async userNames(ids) {
    return new Map(ids.filter((id) => id === LIBRARIAN).map((id) => [id, "Bibliotecaria Ñ"]))
  },
  async faculties() {
    return [
      { id: OTHER_FACULTY, name: "Facultad de Ciencias de la Salud" },
      { id: FACULTY, name: "Facultad de Ingeniería" },
    ]
  },
  async pastPeriods() {
    return [{ id: PERIOD, code: "2026-1" }]
  },
  async existing(table, ids) {
    const known = table === "facultades" ? [FACULTY, OTHER_FACULTY] : [PERIOD]
    return ids.filter((id) => known.includes(id.toLowerCase())).length
  },
})

function deps() {
  return { bridge: fakeDeps(world), reviews: repository() }
}

async function get(handler: typeof libraryReviews, path: string) {
  const response = await handler(apiRequest(path, { cookie }), deps())
  const text = await response.text()
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown> }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "bibliotecario", careerId: null, careerLabel: null })],
  }
  pages = []
  rows = [row()]
  summaries = new Map([
    [
      SYLLABUS,
      {
        subject: "Cálculo",
        code: "MAT-101",
        faculty: "Facultad de Ingeniería",
        career: "Software · SW-1",
        period: "2026-2",
        parallel: "A",
        teachers: ["Docente Uno", "Docente Dos"],
      },
    ],
  ])
})

describe("GET /api/v1/library/reviews", () => {
  it("lists the current convocation with the summary of each syllabus, byte for byte", async () => {
    const result = await get(libraryReviews, "/api/v1/library/reviews")
    expect(result.status).toBe(200)
    expect(pages).toEqual([
      { filters: { state: null, search: null, facultyId: null, period: "actual", periodId: null, handledBy: null }, page: 1, perPage: 20 },
    ])
    expect(result.text).toBe(
      '{"filters":{"q":null,"state":null,"faculty":null,"period":null,"mine":false},' +
        `"faculties":[{"id":"${OTHER_FACULTY}","name":"Facultad de Ciencias de la Salud"},{"id":"${FACULTY}","name":"Facultad de Ingenier\\u00eda"}],` +
        '"reviews":{"current_page":1,"data":[{' +
        `"syllabus_id":"${SYLLABUS}","subject":"C\\u00e1lculo","code":"MAT-101","faculty":"Facultad de Ingenier\\u00eda","career":"Software \\u00b7 SW-1",` +
        '"period":"2026-2","parallels":["A"],"teachers":["Docente Uno","Docente Dos"],"revision_number":1,' +
        `"revision_id":"${REVISION}","sent_at":"2026-11-20T14:00:00+00:00","sent_by":"Docente Uno","signed_by":null,` +
        '"responsible":"Bibliotecaria \\u00d1","state":"atendido","outcome":"devuelto"}],' +
        '"first_page_url":"http:\\/\\/localhost:3000\\/api\\/v1\\/library\\/reviews?page=1","from":1,"last_page":1,' +
        '"last_page_url":"http:\\/\\/localhost:3000\\/api\\/v1\\/library\\/reviews?page=1",' +
        '"links":[{"url":null,"label":"pagination.previous","page":null,"active":false},' +
        '{"url":"http:\\/\\/localhost:3000\\/api\\/v1\\/library\\/reviews?page=1","label":"1","page":1,"active":true},' +
        '{"url":null,"label":"pagination.next","page":null,"active":false}],' +
        '"next_page_url":null,"path":"http:\\/\\/localhost:3000\\/api\\/v1\\/library\\/reviews","per_page":20,"prev_page_url":null,"to":1,"total":1}}',
    )
  })

  it("gives a pending review no outcome and a missing responsible null", async () => {
    rows = [row({ state: "pendiente", outcome: "pendiente", responsibleId: null })]
    const [item] = ((await get(libraryReviews, "/api/v1/library/reviews")).json.reviews as { data: Record<string, unknown>[] }).data
    expect(item).toMatchObject({ state: "pendiente", outcome: null, responsible: null })
  })

  it("filters by faculty, state and text, keeping «0» as a search but not as the q filter", async () => {
    const result = await get(libraryReviews, `/api/v1/library/reviews?faculty=${FACULTY}&state=pendiente&q=%20%C3%81rbol%20`)
    expect(result.json.filters).toEqual({ q: "Árbol", state: "pendiente", faculty: FACULTY, period: null, mine: false })
    expect(pages[0].filters).toMatchObject({ facultyId: FACULTY, state: "pendiente", search: "Árbol" })
    const zero = await get(libraryReviews, "/api/v1/library/reviews?q=0")
    expect((zero.json.filters as Record<string, unknown>).q).toBeNull()
    expect(pages[1].filters.search).toBe("0")
  })

  it("validates the filters with Laravel's messages", async () => {
    const missing = "f0000000-0000-4000-8000-000000000009"
    expect((await get(libraryReviews, `/api/v1/library/reviews?faculty=${missing}`)).json.errors).toEqual({
      faculty: ["El valor seleccionado en facultad no es válido."],
    })
    expect((await get(libraryReviews, "/api/v1/library/reviews?state=otro&q=" + "a".repeat(121))).json.errors).toEqual({
      state: ["El valor seleccionado en state no es válido."],
      q: ["El campo q no debe tener más de 120 caracteres."],
    })
    expect(pages).toEqual([])
  })

  it("rejects a faculty that is not a UUID without querying it, like Laravel's validator", async () => {
    expect(await get(libraryReviews, "/api/v1/library/reviews?faculty=abc")).toMatchObject({
      status: 422,
      json: { message: "El campo facultad debe ser un UUID válido.", errors: { faculty: ["El campo facultad debe ser un UUID válido."] } },
    })
  })

  it("is only for the library role", async () => {
    world.assignments = [makeAssignment({ role: "coordinador" })]
    expect(await get(libraryReviews, "/api/v1/library/reviews")).toMatchObject({ status: 403, text: '{"message":"No tiene permiso para hacer esto."}' })
    expect(pages).toEqual([])
  })

  it("keeps the query string in the page links", async () => {
    rows = Array.from({ length: 21 }, (_, index) => row({ revisionId: `${index}` }))
    const reviews = (await get(libraryReviews, "/api/v1/library/reviews?state=atendido&page=2")).json.reviews as Record<string, unknown>
    expect(pages[0].page).toBe(2)
    expect(reviews.prev_page_url).toBe("http://localhost:3000/api/v1/library/reviews?state=atendido&page=1")
    expect((reviews.data as unknown[]).length).toBe(1)
  })
})

describe("GET /api/v1/library/history", () => {
  it("lists past convocations with their periods, and only mine on request", async () => {
    const all = await get(libraryHistory, "/api/v1/library/history")
    expect(Object.keys(all.json)).toEqual(["filters", "faculties", "reviews", "periods"])
    expect(all.json.periods).toEqual([{ id: PERIOD, code: "2026-1" }])
    expect(pages[0].filters).toEqual({ state: null, search: null, facultyId: null, period: "terminado", periodId: null, handledBy: null })
    const mine = await get(libraryHistory, `/api/v1/library/history?mine=1&period=${PERIOD}`)
    expect(mine.json.filters).toEqual({ q: null, state: null, faculty: null, period: PERIOD, mine: true })
    expect(pages[1].filters).toMatchObject({ period: "terminado", periodId: PERIOD, handledBy: LIBRARIAN })
    await get(libraryHistory, "/api/v1/library/history?mine=0")
    expect(pages[2].filters.handledBy).toBeNull()
  })

  it("validates mine and period", async () => {
    expect((await get(libraryHistory, "/api/v1/library/history?mine=true&period=e0000000-0000-4000-8000-000000000009")).json.errors).toEqual({
      period: ["El valor seleccionado en período no es válido."],
      mine: ["El campo solo los míos debe ser verdadero o falso."],
    })
  })

  it("is forbidden to coordination", async () => {
    world.assignments = [makeAssignment({ role: "coordinador" })]
    expect((await get(libraryHistory, "/api/v1/library/history")).status).toBe(403)
  })
})
