// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpJsonEncode } from "../laravel/phpJson"
import { teacherHistory, teacherHistoryCareer, teacherSyllabi, type PastSyllabusRow, type TeacherPageFilters, type TeacherSyllabusRepository, type TeacherSyllabusRow } from "./teacherSyllabi"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const OTHER_CAREER = "c0000000-0000-4000-8000-000000000002"

let world: FakeWorld
let forwarded: Request[]
let pages: { filters: TeacherPageFilters; page: number; perPage: number }[]
let current: TeacherSyllabusRow[]
let past: PastSyllabusRow[]
let pastCalls: { userId: string; careerId: string | null }[]
let open: boolean

const row = (overrides: Partial<TeacherSyllabusRow> = {}): TeacherSyllabusRow => ({
  id: "50000000-0000-4000-8000-000000000001",
  subject: "Biología",
  code: "C2",
  career: "Software",
  period: "2026-2",
  state: "borrador",
  startedAt: "2026-11-20T14:00:00+00:00",
  parallel: "O2",
  savedAt: null,
  ...overrides,
})

const pastRow = (overrides: Partial<PastSyllabusRow> = {}): PastSyllabusRow => ({
  id: "50000000-0000-4000-8000-000000000009",
  careerId: CAREER,
  career: "Software",
  subject: "Álgebra",
  period: "2025-2",
  periodEndsOn: "2026-03-01",
  state: "aprobado",
  parallel: "A",
  savedAt: "2026-01-10T15:00:00+00:00",
  ...overrides,
})

const repository = (): TeacherSyllabusRepository => ({
  async page(filters, page, perPage) {
    pages.push({ filters, page, perPage })
    return { total: current.length, items: current.slice((page - 1) * perPage, page * perPage) }
  },
  async convocationOpen(careerId) {
    return open && careerId === CAREER
  },
  async past(userId, careerId) {
    pastCalls.push({ userId, careerId })
    return past.filter((item) => careerId === null || item.careerId === careerId.toLowerCase())
  },
})

const deps = () => ({ bridge: fakeDeps(world, forwarded), syllabi: repository() })

async function call(handler: (request: Request) => Promise<Response>, path: string) {
  const response = await handler(apiRequest(path, { cookie }))
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const list = (path: string) => call((request) => teacherSyllabi(request, deps()), path)
const history = (path: string) => call((request) => teacherHistory(request, deps()), path)
const historyCareer = (path: string, career: string) => call((request) => teacherHistoryCareer(request, career, deps()), path)

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "docente", careerId: CAREER })],
  }
  forwarded = []
  pages = []
  current = [row()]
  past = []
  pastCalls = []
  open = true
})

describe("GET /api/v1/teacher/syllabi", () => {
  it("lists the teacher's current syllabi of the active career with the exact Laravel payload", async () => {
    const { status, text, json } = await list("/api/v1/teacher/syllabi?q=bio")
    expect(status).toBe(200)
    expect(pages).toEqual([{ filters: { userId: golden.userId, careerId: CAREER, search: "bio", state: null }, page: 1, perPage: 20 }])
    const syllabi = json?.syllabi as Record<string, unknown>
    expect(syllabi.data).toEqual([
      {
        id: "50000000-0000-4000-8000-000000000001",
        subject: "Biología",
        code: "C2",
        convocation: "Software · 2026-2",
        period: "2026-2",
        state: "borrador",
        iniciado_en: "2026-11-20T14:00:00+00:00",
        parallels: ["O2"],
        guardado_en: null,
      },
    ])
    expect(Object.keys(json ?? {})).toEqual(["filters", "syllabi", "convocation_open"])
    expect(json?.filters).toEqual({ q: "bio", state: null })
    expect(json?.convocation_open).toBe(true)
    expect(syllabi.first_page_url).toBe("http://localhost:3000/api/v1/teacher/syllabi?q=bio&page=1")
    expect(text).toBe(phpJsonEncode(JSON.parse(text)))
    expect(text).toContain('"subject":"Biolog\\u00eda"')
  })

  it("keeps a falsy search out of the query and the filters, and ignores state=all", async () => {
    const { json } = await list("/api/v1/teacher/syllabi?q=0&state=all")
    expect(pages[0].filters).toEqual({ userId: golden.userId, careerId: CAREER, search: null, state: null })
    expect(json?.filters).toEqual({ q: null, state: null })
  })

  it("filters by an explicit state", async () => {
    const { json } = await list("/api/v1/teacher/syllabi?state=en_revision&page=2")
    expect(pages[0]).toEqual({ filters: { userId: golden.userId, careerId: CAREER, search: null, state: "en_revision" }, page: 2, perPage: 20 })
    expect(json?.filters).toEqual({ q: null, state: "en_revision" })
  })

  it("says whether the career has an open convocation", async () => {
    open = false
    expect((await list("/api/v1/teacher/syllabi")).json?.convocation_open).toBe(false)
  })

  it("forbids a coordinator", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    const { status, text } = await list("/api/v1/teacher/syllabi")
    expect(status).toBe(403)
    expect(text).toBe(FORBIDDEN)
    expect(pages).toEqual([])
  })

  it("validates the filters with Laravel's Spanish messages", async () => {
    const { status, json } = await list(`/api/v1/teacher/syllabi?q=${"a".repeat(121)}&state=otro&page=0`)
    expect(status).toBe(422)
    expect(json).toEqual({
      message: "El campo búsqueda no debe tener más de 120 caracteres. (y 2 errores más)",
      errors: {
        q: ["El campo búsqueda no debe tener más de 120 caracteres."],
        state: ["El valor seleccionado en estado no es válido."],
        page: ["El campo página debe ser al menos 1."],
      },
    })
  })

  it("requires a session", async () => {
    const response = await teacherSyllabi(apiRequest("/api/v1/teacher/syllabi"), deps())
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"message":"Unauthenticated."}')
  })
})

describe("GET /api/v1/teacher/history", () => {
  it("groups the past syllabi by career in natural name order", async () => {
    past = [
      pastRow({ careerId: OTHER_CAREER, career: "Software 10" }),
      pastRow(),
      pastRow({ id: "50000000-0000-4000-8000-00000000000a" }),
      pastRow({ id: "50000000-0000-4000-8000-00000000000b", careerId: "c0000000-0000-4000-8000-000000000003", career: "software 2" }),
    ]
    const { status, text } = await history("/api/v1/teacher/history")
    expect(status).toBe(200)
    expect(pastCalls).toEqual([{ userId: golden.userId, careerId: null }])
    expect(text).toBe(
      phpJsonEncode({
        careers: [
          { id: CAREER, name: "Software", syllabi_count: 2 },
          { id: "c0000000-0000-4000-8000-000000000003", name: "software 2", syllabi_count: 1 },
          { id: OTHER_CAREER, name: "Software 10", syllabi_count: 1 },
        ],
      }),
    )
  })

  it("returns an empty list and validates like the current list", async () => {
    expect((await history("/api/v1/teacher/history")).text).toBe('{"careers":[]}')
    expect((await history("/api/v1/teacher/history?state=x")).status).toBe(422)
  })

  it("forbids a librarian", async () => {
    world.assignments = [makeAssignment({ role: "bibliotecario", careerId: null })]
    expect((await history("/api/v1/teacher/history")).text).toBe(FORBIDDEN)
  })
})

describe("GET /api/v1/teacher/history/{career}", () => {
  it("lists the career's past syllabi from the latest period", async () => {
    past = [pastRow({ periodEndsOn: "2025-08-01", period: "2025-1" }), pastRow({ id: "50000000-0000-4000-8000-00000000000c", periodEndsOn: "2026-03-01", state: "borrador", savedAt: null })]
    const career = CAREER.toUpperCase()
    const { status, text } = await historyCareer(`/api/v1/teacher/history/${career}`, career)
    expect(status).toBe(200)
    expect(pastCalls).toEqual([{ userId: golden.userId, careerId: career }])
    expect(text).toBe(
      phpJsonEncode({
        career: { id: career, name: "Software" },
        syllabi: [
          { id: "50000000-0000-4000-8000-00000000000c", subject: "Álgebra", period: "2025-2", state: "borrador", parallels: ["A"], guardado_en: null },
          { id: "50000000-0000-4000-8000-000000000009", subject: "Álgebra", period: "2025-1", state: "aprobado", parallels: ["A"], guardado_en: "2026-01-10T15:00:00+00:00" },
        ],
      }),
    )
  })

  it("aborts with an empty 404 when the teacher wrote nothing there", async () => {
    const { status, text } = await historyCareer(`/api/v1/teacher/history/${OTHER_CAREER}`, OTHER_CAREER)
    expect(status).toBe(404)
    expect(text).toBe('{\n    "message": ""\n}')
  })

  it("leaves a non UUID career to Laravel's router", async () => {
    const { status } = await historyCareer("/api/v1/teacher/history/abc", "abc")
    expect(status).toBe(299)
    expect(forwarded).toHaveLength(1)
  })
})
