// @vitest-environment node
import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it } from "vitest"
import { createRateLimiter } from "../laravel/throttle"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { exportAuditEvents, listAuditEvents, safeDetails, type AuditEventRow, type AuditFilters, type AuditRepository } from "./auditEvents"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const PERIOD = "e0000000-0000-4000-8000-000000000001"
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"

let world: FakeWorld
let rows: AuditEventRow[]
let pages: { filters: AuditFilters; page: number; perPage: number }[]
let lookups: { type: string; ids: string[] }[]

const row = (overrides: Partial<AuditEventRow> = {}): AuditEventRow => ({
  id: "ev-1",
  action: "silabo.enviado",
  resourceType: "silabo",
  resourceId: SYLLABUS,
  result: "exito",
  actorUserId: golden.userId,
  actorName: null,
  actorUserName: "Docente Uno",
  actorRole: null,
  assignmentRole: "docente",
  actorCareer: null,
  assignmentCareer: "Software",
  metadata: { revision_number: 2, before_name: "A", after_name: "B", from_state: "borrador", to_state: "en_revision", secreto: "x" },
  occurredAt: "2026-11-20T14:00:00+00:00",
  ...overrides,
})

const repository = (): AuditRepository => ({
  async all(filters) {
    pages.push({ filters, page: 0, perPage: 0 })
    return rows
  },
  periodCode: async (id) => (id === PERIOD ? "Abril-Agosto 2027" : null),
  async page(filters, page, perPage) {
    pages.push({ filters, page, perPage })
    return { total: rows.length, items: rows.slice((page - 1) * perPage, page * perPage) }
  },
  async actionOptions() {
    return ["silabo.enviado", "zzz.desconocida"]
  },
  async periodOptions() {
    return [{ value: PERIOD, label: "2026-2" }]
  },
  async careerOptions() {
    return [{ value: CAREER, label: "Software" }]
  },
  async targetNames(type, ids) {
    lookups.push({ type, ids })
    return new Map(type === "silabo" ? ids.map((id) => [id, "Programación · Paralelo A · Docente Uno"]) : [])
  },
})

async function get(path: string) {
  const response = await listAuditEvents(apiRequest(path, { cookie }), { bridge: fakeDeps(world), audit: repository() })
  const text = await response.text()
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown> }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })],
  }
  rows = [row()]
  pages = []
  lookups = []
})

describe("audit events", () => {
  it("lists the events with readable labels, targets and safe details", async () => {
    rows = [row(), row({ id: "ev-2", resourceType: "plantilla_silabo", resourceId: null, actorUserId: null, actorUserName: null, assignmentRole: null, assignmentCareer: null, metadata: null, result: "fallido", action: "otra.cosa" })]
    const response = await get("/api/v1/admin/audit-events")
    expect(response.status).toBe(200)
    expect(response.json.filters).toEqual({ technical: false, action: "", result: "", from: "", to: "", period: "", role: "", career: "" })
    expect(response.json.action_options).toEqual([
      { value: "silabo.enviado", label: "Sílabo enviado" },
      { value: "zzz.desconocida", label: "Acción registrada" },
    ])
    expect(response.json.period_options).toEqual([{ value: PERIOD, label: "2026-2" }])
    expect(response.json.role_options).toEqual([
      { value: "administrador", label: "Administrador" },
      { value: "coordinador", label: "Coordinador" },
      { value: "docente", label: "Docente" },
      { value: "bibliotecario", label: "Bibliotecario" },
    ])
    expect(response.json.career_options).toEqual([{ value: CAREER, label: "Software" }])
    const events = response.json.events as { data: unknown[]; total: number; per_page: number; path: string }
    expect(events.total).toBe(2)
    expect(events.per_page).toBe(20)
    expect(events.path).toBe("http://localhost:3000/api/v1/admin/audit-events")
    expect(events.data).toEqual([
      {
        id: "ev-1",
        action: "Sílabo enviado",
        resource: "Sílabo",
        target: "Programación · Paralelo A · Docente Uno",
        result: "exito",
        actor: "Docente Uno",
        role: "Docente",
        career: "Software",
        details: [
          { label: "Nombre", value: "A → B" },
          { label: "Estado", value: "Borrador → En revisión" },
          { label: "Número de revisión", value: 2 },
        ],
        occurred_at: "2026-11-20T14:00:00+00:00",
      },
      {
        id: "ev-2",
        action: "Acción registrada",
        resource: "Plantilla de sílabo",
        target: "",
        result: "fallido",
        actor: "Sistema",
        role: null,
        career: null,
        details: [],
        occurred_at: "2026-11-20T14:00:00+00:00",
      },
    ])
    expect(lookups).toEqual([{ type: "silabo", ids: [SYLLABUS] }])
    expect(response.text).toContain('"action":"S\\u00edlabo enviado"')
  })

  it("prefers the denormalized actor fields and tells deleted accounts apart", async () => {
    rows = [row({ actorName: "Nombre Guardado", actorRole: "Coordinador", actorCareer: "Civil" }), row({ id: "ev-3", actorUserName: null })]
    const data = ((await get("/api/v1/admin/audit-events")).json.events as { data: Record<string, unknown>[] }).data
    expect(data.map((event) => [event.actor, event.role, event.career])).toEqual([
      ["Nombre Guardado", "Coordinador", "Civil"],
      ["Cuenta eliminada", "Docente", "Software"],
    ])
  })

  it("passes the filters through and echoes them", async () => {
    const response = await get(`/api/v1/admin/audit-events?technical=1&action=sesion.iniciada&result=fallido&from=2026-01-01&to=2026-01-31&period=${PERIOD}&role=docente&career=${CAREER}&page=2`)
    expect(response.status).toBe(200)
    expect(pages).toEqual([
      {
        filters: { technical: true, action: "sesion.iniciada", result: "fallido", from: "2026-01-01", to: "2026-01-31", period: PERIOD, role: "docente", career: CAREER },
        page: 2,
        perPage: 20,
      },
    ])
    expect(response.json.filters).toEqual({ technical: true, action: "sesion.iniciada", result: "fallido", from: "2026-01-01", to: "2026-01-31", period: PERIOD, role: "docente", career: CAREER })
  })

  it("validates the filters like Laravel", async () => {
    const response = await get("/api/v1/admin/audit-events?technical=si&result=otro&period=x&career=y&from=2026-02-30&to=2026-01-01")
    expect(response.status).toBe(422)
    expect(response.json).toEqual({
      message: "El campo actividad técnica debe ser verdadero o falso. (y 5 errores más)",
      errors: {
        technical: ["El campo actividad técnica debe ser verdadero o falso."],
        result: ["El valor seleccionado en resultado no es válido."],
        period: ["El campo período debe ser un UUID válido."],
        career: ["El campo carrera debe ser un UUID válido."],
        from: ["El campo fecha desde debe coincidir con el formato Y-m-d."],
        to: ["El campo fecha hasta debe ser una fecha posterior o igual a fecha desde."],
      },
    })
    expect(pages).toEqual([])
    const long = await get(`/api/v1/admin/audit-events?action=${"a".repeat(121)}&role=${"r".repeat(41)}`)
    expect(long.json.errors).toEqual({
      action: ["El campo acción no debe tener más de 120 caracteres."],
      role: ["El campo rol no debe tener más de 40 caracteres."],
    })
    expect((await get("/api/v1/admin/audit-events?to=2026-01-01")).status).toBe(200)
  })

  it("forbids every role except Administration", async () => {
    world.assignments = [makeAssignment({ role: "coordinador" })]
    expect(await get("/api/v1/admin/audit-events")).toMatchObject({ status: 403, text: '{"message":"No tiene permiso para hacer esto."}' })
    expect(pages).toEqual([])
  })

  it("reads changes as before → after and hides unchanged values", () => {
    expect(
      safeDetails({ before_shift: "nocturna", after_shift: "nocturna", before_code: null, after_code: "", active: true, from_state: 1, to_state: "1", role: "coordinacion", lock_version: [1] }),
    ).toEqual([
      { label: "Activo", value: true },
      { label: "Rol", value: "Coordinación" },
    ])
    expect(safeDetails({ before_name: null, after_name: "Nueva", after_cycle: false, before_cycle: true })).toEqual([
      { label: "Nombre", value: "— → Nueva" },
      { label: "Ciclo", value: "Sí → No" },
    ])
    expect(safeDetails(["a"])).toEqual([])
    expect(safeDetails(null)).toEqual([])
  })
})

describe("GET /api/v1/admin/audit-events/export", () => {
  async function exported(path: string) {
    const response = await exportAuditEvents(apiRequest(path, { cookie }), { bridge: fakeDeps(world), audit: repository(), limiter: createRateLimiter(), today: () => "2026-11-24" })
    return response
  }

  it("downloads the filtered events and their summary as an Excel workbook named after the period", async () => {
    rows = [row({ occurredLocal: "2026-11-20 09:00:00" }), row({ id: "ev-2", action: "otra.cosa", result: "fallido", metadata: { activo: true }, assignmentCareer: null, occurredLocal: "2026-11-21 10:30:00" })]
    const response = await exported(`/api/v1/admin/audit-events/export?period=${PERIOD}`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=auditoria-abril-agosto-2027.xlsx")
    expect(response.headers.get("x-ratelimit-limit")).toBe("10")
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await response.arrayBuffer())
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Eventos", "Resumen"])
    const events = book.getWorksheet("Eventos") as ExcelJS.Worksheet
    expect((events.getRow(1).values as unknown[]).slice(1)).toEqual(["Fecha y hora", "Usuario", "Rol", "Carrera", "Acción", "Sobre qué", "Detalle", "Resultado"])
    expect(events.getCell("A2").value).toEqual(new Date("2026-11-20T09:00:00.000Z"))
    expect(events.getCell("A2").numFmt).toBe("yyyy-mm-dd hh:mm")
    expect(events.getCell("H3").value).toBe("Fallido")
    expect(events.getCell("D3").value).toBeNull()
    expect(events.getColumn(7).width).toBe(60)
    expect(book.title).toBe("Auditoría Abril-Agosto 2027")
  })

  it("names the file with today's date without a period and keeps the index rules", async () => {
    expect((await exported("/api/v1/admin/audit-events/export")).headers.get("content-disposition")).toBe("attachment; filename=auditoria-2026-11-24.xlsx")
    expect((await exported("/api/v1/admin/audit-events/export?result=otro")).status).toBe(422)
    world.assignments = [makeAssignment({ role: "docente" })]
    expect((await exported("/api/v1/admin/audit-events/export")).status).toBe(403)
  })
})
