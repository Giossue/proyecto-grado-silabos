// @vitest-environment node
import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it } from "vitest"
import { createRateLimiter } from "../laravel/throttle"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { exportProcessReport, processReport, type ProcessReportRepository, type ReportProcess, type ReportSyllabus } from "./processReport"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const PROCESS = "60000000-0000-4000-8000-000000000001"
const OLD = "60000000-0000-4000-8000-000000000002"
const at = (iso: string) => Date.parse(iso) / 1000

let world: FakeWorld
let forwarded: Request[]
let processes: ReportProcess[]
let syllabi: ReportSyllabus[]
let now: number

const repository = (): ProcessReportRepository => ({
  options: async () => processes.map((process) => ({ value: process.id, label: process.period ?? "" })),
  process: async (id) => (id === null ? processes[0] : processes.find((process) => process.id === id.toLowerCase())) ?? null,
  syllabi: async () => syllabi,
})

async function report(query = "") {
  const response = await processReport(apiRequest(`/api/v1/admin/reports${query}`, { cookie }), { bridge: fakeDeps(world, forwarded), reports: repository(), now: () => now })
  return { status: response.status, text: await response.text() }
}

const syllabus = (overrides: Partial<ReportSyllabus> = {}): ReportSyllabus => ({
  career: "Software",
  state: "sin_iniciar",
  teachers: ["Ana Pérez"],
  subject: "Redes",
  parallel: "A",
  revisions: [],
  ...overrides,
})

beforeEach(() => {
  forwarded = []
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  processes = [
    { id: PROCESS, period: "2026-2", startsOn: "2026-11-01", dueOn: "2026-11-20", state: "abierto" },
    { id: OLD, period: "2026-1", startsOn: "2026-04-01", dueOn: "2026-05-01", state: "cerrado" },
  ]
  syllabi = [
    syllabus({ career: "Turismo", state: "aprobado", teachers: ["Luis Mora", "Luis Mora"], subject: "Guianza", revisions: [
      { number: 1, submittedAt: at("2026-11-20T23:30:00-05:00"), correctionStage: "biblioteca", approvedAt: null },
      { number: 2, submittedAt: at("2026-11-21T10:00:00-05:00"), correctionStage: null, approvedAt: at("2026-11-23T11:30:00-05:00") },
    ] }),
    syllabus({ state: "borrador", subject: "Bases de datos" }),
    syllabus({ state: "en_revision", subject: "Algoritmos", teachers: [], revisions: [{ number: 1, submittedAt: at("2026-11-22T08:00:00-05:00"), correctionStage: null, approvedAt: null }] }),
  ]
  now = at("2026-11-23T12:00:00-05:00")
})

describe("GET admin/reports", () => {
  it("builds the latest process report with Laravel's rounding, ordering and float output", async () => {
    const { status, text } = await report()
    expect(status).toBe(200)
    expect(text).toBe(
      JSON.stringify({
        options: [
          { value: PROCESS, label: "2026-2" },
          { value: OLD, label: "2026-1" },
        ],
        report: {
          process: { id: PROCESS, period: "2026-2", starts_at: "2026-11-01", due_at: "2026-11-20", state: "abierto" },
          kpis: { total: 3, approved_percent: "@33@", on_time_percent: "@50@", review_days: "@2.5@" },
          careers: [
            {
              career: "Software",
              total: 2,
              states: { sin_iniciar: 0, borrador: 1, en_revision: 1, correccion_solicitada: 0, aprobado: 0 },
              returns: { coordinacion: 0, biblioteca: 0 },
              late: 1,
              approved: 0,
              pending: 2,
              returned: 0,
              progress: "@0@",
            },
            {
              career: "Turismo",
              total: 1,
              states: { sin_iniciar: 0, borrador: 0, en_revision: 0, correccion_solicitada: 0, aprobado: 1 },
              returns: { coordinacion: 0, biblioteca: 1 },
              late: 0,
              approved: 1,
              pending: 0,
              returned: 0,
              progress: "@100@",
            },
          ],
          daily: [
            { day: "2026-11-20", first: 1, resubmitted: 0 },
            { day: "2026-11-21", first: 0, resubmitted: 1 },
            { day: "2026-11-22", first: 1, resubmitted: 0 },
          ],
          pending: [
            { teachers: "", career: "Software", subject: "Algoritmos", parallel: "A", state: "en_revision", late: false },
            { teachers: "Ana Pérez", career: "Software", subject: "Bases de datos", parallel: "A", state: "borrador", late: true },
          ],
        },
      })
        .replace(/"@([\d.]+)@"/g, "$1")
        .replace(/é/g, "\\u00e9"),
    )
  })

  it("reports an empty process with null rates and picks the requested one", async () => {
    syllabi = []
    const { text } = await report(`?process=${OLD}`)
    expect(JSON.parse(text).report).toEqual({
      process: { id: OLD, period: "2026-1", starts_at: "2026-04-01", due_at: "2026-05-01", state: "cerrado" },
      kpis: { total: 0, approved_percent: 0, on_time_percent: null, review_days: null },
      careers: [],
      daily: [],
      pending: [],
    })
  })

  it("answers without a report when there is no process and leaves unknown processes to Laravel", async () => {
    processes = []
    expect(await report()).toEqual({ status: 200, text: '{"options":[],"report":null}' })
    expect((await report("?process=60000000-0000-4000-8000-000000000009")).status).toBe(299)
    expect(forwarded).toHaveLength(1)
  })

  it("validates the process and forbids other roles", async () => {
    expect(await report("?process=abc")).toEqual({
      status: 422,
      text: JSON.stringify({ message: "El campo convocatoria debe ser un UUID válido.", errors: { process: ["El campo convocatoria debe ser un UUID válido."] } }).replace(/[á]/g, "\\u00e1"),
    })
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000001" })]
    expect((await report()).status).toBe(403)
  })
})

describe("GET admin/reports/export", () => {
  async function exported(query = "") {
    return exportProcessReport(apiRequest(`/api/v1/admin/reports/export${query}`, { cookie }), { bridge: fakeDeps(world, forwarded), reports: repository(), now: () => now, limiter: createRateLimiter() })
  }

  it("downloads the latest process report as a workbook with its four sheets", async () => {
    const response = await exported()
    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=reporte-2026-2.xlsx")
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await response.arrayBuffer())
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Resumen", "Por carrera", "Envíos por día", "Pendientes"])
    const summary = book.getWorksheet("Resumen") as ExcelJS.Worksheet
    expect([summary.getCell("A6").value, summary.getCell("B6").value, summary.getCell("B7").value, summary.getCell("B8").value]).toEqual(["Aprobados (%)", 33, 50, 2.5])
    expect((book.getWorksheet("Pendientes") as ExcelJS.Worksheet).getCell("F2").value).toMatch(/^(Sí|No)$/)
  })

  it("answers 404 without processes and forwards an unknown process to Laravel", async () => {
    processes = []
    expect(await (await exported()).text()).toBe('{\n    "message": "No hay convocatorias para reportar."\n}')
    expect((await exported("?process=60000000-0000-4000-8000-000000000009")).status).toBe(299)
  })
})
