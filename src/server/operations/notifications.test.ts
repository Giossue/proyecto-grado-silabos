// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { listNotifications, type DestinationLookups, type NotificationRecord, type NotificationRepository } from "./notifications"
import { showEmailPreferences } from "./emailPreferences"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const ADMIN_ROLE = "a0000000-0000-4000-8000-000000000001"

let world: FakeWorld
let notifications: NotificationRecord[]
let unreadOnlyCalls: boolean[]
let lookups: DestinationLookups

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: "n-1",
    type: "documento.exportacion_fallida",
    title: "No se pudieron generar los documentos",
    message: "Mensaje de prueba.",
    resourceType: null,
    resourceId: null,
    readAt: null,
    notifiedAt: "2026-11-23T15:04:05+00:00",
    ...overrides,
  }
}

const repository = (): NotificationRepository => ({
  async page(userId, { page, perPage, onlyUnread }) {
    unreadOnlyCalls.push(onlyUnread)
    const visible = notifications.filter((item) => userId === golden.userId && (!onlyUnread || item.readAt === null))
    return { total: visible.length, items: visible.slice((page - 1) * perPage, page * perPage) }
  },
  async unreadCount(userId) {
    return notifications.filter((item) => userId === golden.userId && item.readAt === null).length
  },
})

const emptyLookups = (): DestinationLookups => ({
  processCareerIds: async () => [],
  convocationCareerIds: async () => [],
  syllabusExists: async () => false,
  syllabusCareerId: async () => null,
  latestRevisionId: async () => null,
  teacherAssignmentIds: async () => [],
  artifactRevision: async () => null,
})

function deps() {
  return { bridge: fakeDeps(world), notifications: repository(), lookups }
}

async function getJson(path: string): Promise<{ status: number; text: string; json: Record<string, unknown> }> {
  const response = await listNotifications(apiRequest(path, { cookie }), deps())
  const text = await response.text()
  return { status: response.status, text, json: response.status < 300 ? JSON.parse(text) : {} }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: ADMIN_ROLE })), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ id: ADMIN_ROLE, role: "administrador", careerId: null, careerLabel: null })],
  }
  notifications = []
  unreadOnlyCalls = []
  lookups = emptyLookups()
})

describe("GET /api/v1/notifications", () => {
  it("answers Laravel's 401 to a guest", async () => {
    const response = await listNotifications(apiRequest("/api/v1/notifications"), deps())
    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text())).toEqual(JSON.parse(golden.errors.unauthenticated.body))
  })

  it("answers 403 to an unverified user", async () => {
    world.users = [makeUser({ emailVerifiedAt: null })]
    const { status, text } = await getJson("/api/v1/notifications")
    expect(status).toBe(403)
    expect(JSON.parse(text)).toEqual(JSON.parse(golden.errors.unverified.body))
  })

  it("rejects an unknown status filter with Laravel's 422 body", async () => {
    const invalid = await getJson("/api/v1/notifications?status=x")
    expect(invalid.status).toBe(422)
    expect(JSON.parse(invalid.text)).toEqual(JSON.parse(golden.errors.invalidStatus.body))
    const array = await getJson("/api/v1/notifications?status[]=x")
    expect(array.status).toBe(422)
    expect(JSON.parse(array.text)).toEqual(JSON.parse(golden.errors.arrayStatus.body))
  })

  it("renders the exact JSON Laravel renders for one notification", async () => {
    notifications = [notification({ id: "0193-n", title: "Título «ñ» / 1" })]
    const { status, text } = await getJson("/api/v1/notifications")
    expect(status).toBe(200)
    const url = "http://localhost:3000/api/v1/notifications"
    expect(text).toBe(
      `{"filters":{"status":"all"},"notifications":{"current_page":1,"data":[{"id":"0193-n","tipo":"documento.exportacion_fallida",` +
        `"titulo":"Título «ñ» / 1","mensaje":"Mensaje de prueba.","leido_en":null,"notificado_en":"2026-11-23T15:04:05+00:00",` +
        `"has_destination":false,"context":null}],"first_page_url":"${url}?page=1","from":1,"last_page":1,` +
        `"last_page_url":"${url}?page=1","links":[{"url":null,"label":"pagination.previous","page":null,"active":false},` +
        `{"url":"${url}?page=1","label":"1","page":1,"active":true},{"url":null,"label":"pagination.next","page":null,"active":false}],` +
        `"next_page_url":null,"path":"${url}","per_page":20,"prev_page_url":null,"to":1,"total":1},"unread_count":1}`,
    )
  })

  it("filters unread notices, keeps the query string in the links and counts every unread notice", async () => {
    notifications = Array.from({ length: 25 }, (_, index) =>
      notification({ id: `n-${index}`, readAt: index === 0 ? "2026-11-23T16:00:00+00:00" : null }),
    )
    const { json } = await getJson("/api/v1/notifications?status=unread&page=2")
    const page = json.notifications as Record<string, unknown>
    expect(json.filters).toEqual({ status: "unread" })
    expect(unreadOnlyCalls).toEqual([true])
    expect(page.current_page).toBe(2)
    expect(page.total).toBe(24)
    expect((page.data as unknown[]).length).toBe(4)
    expect(page.first_page_url).toBe("http://localhost:3000/api/v1/notifications?status=unread&page=1")
    expect(json.unread_count).toBe(24)
  })

  it("notices without a screen for the user have no destination and the rest do", async () => {
    world.assignments = [makeAssignment({ id: "teach", role: "docente", careerId: "career-1", careerLabel: "Software" })]
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: "teach" })), lastActivity: NOW })
    lookups.convocationCareerIds = async (id) => (id === "conv-1" ? ["career-1"] : [])
    notifications = [
      notification({ id: "informational", type: "silabo.correccion_solicitada", resourceType: "silabo", resourceId: "s-missing" }),
      notification({ id: "actionable", type: "convocatoria.abierta", resourceType: "convocatoria", resourceId: "conv-1" }),
    ]
    const data = ((await getJson("/api/v1/notifications")).json.notifications as { data: Record<string, unknown>[] }).data
    const byId = Object.fromEntries(data.map((item) => [item.id, item]))
    expect(byId.informational.has_destination).toBe(false)
    expect(byId.informational.context).toBeNull()
    expect(byId.actionable.has_destination).toBe(true)
  })

  it("a failed export notice no longer sends Administración to Auditoría", async () => {
    notifications = [notification({ id: "failed", type: "documento.exportacion_fallida", resourceType: "artefacto_exportacion", resourceId: "x" })]
    const data = ((await getJson("/api/v1/notifications")).json.notifications as { data: Record<string, unknown>[] }).data
    expect(data[0].has_destination).toBe(false)
    expect(data[0].context).toBeNull()
  })

  it("teacher notices keep the teaching context even when coordination is active", async () => {
    const coordination = makeAssignment({ id: "coord", role: "coordinador", careerId: "career-1", careerLabel: "Software" })
    const teaching = makeAssignment({ id: "teach", role: "docente", careerId: "career-1", careerLabel: "Software" })
    world.assignments = [coordination, teaching]
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: "coord" })), lastActivity: NOW })
    lookups.convocationCareerIds = async (id) => (id === "conv-1" ? ["career-1"] : [])
    notifications = [notification({ id: "notice", type: "convocatoria.abierta", resourceType: "convocatoria", resourceId: "conv-1" })]
    const data = ((await getJson("/api/v1/notifications")).json.notifications as { data: Record<string, unknown>[] }).data
    expect(String(data[0].context)).toMatch(/^Docencia/)
    expect(data[0].context).toBe("Docencia · Software")
  })

  it("a coordinator's syllabus notice opens the review of its career", async () => {
    world.assignments = [makeAssignment({ id: "coord", role: "coordinador", careerId: "career-1", careerLabel: "Software" })]
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: "coord" })), lastActivity: NOW })
    lookups.syllabusExists = async () => true
    lookups.syllabusCareerId = async () => "career-1"
    lookups.latestRevisionId = async () => "rev-1"
    notifications = [notification({ type: "aviso.prueba", resourceType: "silabo", resourceId: "s-1" })]
    const page = (await getJson("/api/v1/notifications")).json.notifications as { total: number; data: Record<string, unknown>[] }
    expect(page.total).toBe(1)
    expect(page.data[0].has_destination).toBe(true)
    expect(page.data[0].context).toBe("Coordinación · Software")
  })

  it("without an active role, a teacher of two careers still gets the context of the syllabus career", async () => {
    world.assignments = [
      makeAssignment({ id: "t-1", role: "docente", careerId: "career-1", careerLabel: "Software" }),
      makeAssignment({ id: "t-2", role: "docente", careerId: "career-2", careerLabel: "Turismo" }),
    ]
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: undefined })), lastActivity: NOW })
    lookups.syllabusExists = async () => true
    lookups.syllabusCareerId = async () => "career-2"
    lookups.teacherAssignmentIds = async () => ["t-2"]
    notifications = [notification({ type: "silabo.correccion_solicitada", resourceType: "silabo", resourceId: "s-1" })]
    const data = ((await getJson("/api/v1/notifications")).json.notifications as { data: Record<string, unknown>[] }).data
    expect(data[0].has_destination).toBe(true)
    expect(data[0].context).toBe("Docencia · Turismo")
    expect(data[0]).not.toHaveProperty("resource_path")
  })

  it("lists what the repository returns for the current period and its unread count", async () => {
    notifications = [notification({ id: "current" })]
    const { json } = await getJson("/api/v1/notifications")
    expect((json.notifications as { data: { id: string }[] }).data.map((item) => item.id)).toEqual(["current"])
    expect(json.unread_count).toBe(1)
  })
})

describe("GET /api/v1/notifications/email-preferences", () => {
  async function types(role: string, preferences: unknown = null): Promise<string[]> {
    world.assignments = [makeAssignment({ id: "r", role, careerId: role === "coordinador" ? "c" : null })]
    world.users = [makeUser({ emailPreferences: preferences })]
    const response = await showEmailPreferences(apiRequest("/api/v1/notifications/email-preferences", { cookie }), { bridge: fakeDeps(world) })
    expect(response.status).toBe(200)
    const { options } = JSON.parse(await response.text()) as { options: { type: string; enabled: boolean }[] }
    return options.map((option) => `${option.type}:${option.enabled ? "si" : "no"}`)
  }

  it("each role sees only its email notices, all on by default", async () => {
    expect(await types("docente")).toEqual([
      "docente.resumen_diario:si", "convocatoria.abierta:si", "convocatoria.reanudada:si", "silabo.correccion_solicitada:si",
      "silabo.devuelto_borrador:si", "silabo.aprobado:si", "silabo.reiniciado:si", "proceso.cierre_proximo:si",
    ])
    expect(await types("coordinador")).toEqual(["coordinacion.resumen_diario:si", "biblioteca.verificado:si", "proceso.reanudado:si", "proceso.cierre_proximo:si"])
    expect(await types("bibliotecario")).toEqual(["biblioteca.resumen_diario:si", "silabo.enviado:si", "silabo.reenviado_biblioteca:si", "proceso.reanudado:si"])
    expect(await types("administrador")).toEqual([])
  })

  it("keeps the first position and the last text of a notice two roles share", async () => {
    world.assignments = [
      makeAssignment({ id: "t", role: "docente" }),
      makeAssignment({ id: "c", role: "coordinador", careerId: "c" }),
    ]
    const response = await showEmailPreferences(apiRequest("/api/v1/notifications/email-preferences", { cookie }), { bridge: fakeDeps(world) })
    const { options } = JSON.parse(await response.text()) as { options: { type: string; description: string }[] }
    expect(options.map((option) => option.type)).toEqual([
      "docente.resumen_diario", "convocatoria.abierta", "convocatoria.reanudada", "silabo.correccion_solicitada", "silabo.devuelto_borrador",
      "silabo.aprobado", "silabo.reiniciado", "proceso.cierre_proximo", "coordinacion.resumen_diario", "biblioteca.verificado", "proceso.reanudado",
    ])
    expect(options[7].description).toBe("3 días antes del último día de entrega, si su carrera tiene sílabos sin aprobar")
  })

  it("shows a notice turned off and keeps the rest on", async () => {
    expect((await types("coordinador", { "coordinacion.resumen_diario": false }))[0]).toBe("coordinacion.resumen_diario:no")
    expect((await types("docente", { "silabo.aprobado": false, "silabo.reiniciado": 0 }))[5]).toBe("silabo.aprobado:no")
    expect((await types("docente", { "silabo.reiniciado": 0 }))[6]).toBe("silabo.reiniciado:si")
  })

  it("renders the exact JSON Laravel renders", async () => {
    world.assignments = [makeAssignment({ id: "r", role: "bibliotecario", careerId: null })]
    const response = await showEmailPreferences(apiRequest("/api/v1/notifications/email-preferences", { cookie }), { bridge: fakeDeps(world) })
    expect(await response.text()).toBe(
      '{"options":[{"type":"biblioteca.resumen_diario","label":"Resumen diario","description":"Sílabos por revisar, de lunes a viernes, solo si hay pendientes","enabled":true},' +
        '{"type":"silabo.enviado","label":"Sílabo por revisar","description":"Un docente envió un sílabo y espera la revisión de biblioteca","enabled":true},' +
        '{"type":"silabo.reenviado_biblioteca","label":"Sílabo reenviado","description":"El docente corrigió la bibliografía y la reenvió","enabled":true},' +
        '{"type":"proceso.reanudado","label":"Convocatoria reanudada por Administración","description":"Se retoman las revisiones tras una pausa institucional","enabled":true}]}',
    )
  })

  it("answers 401 to a guest and 403 to an unverified user", async () => {
    const guest = await showEmailPreferences(apiRequest("/api/v1/notifications/email-preferences"), { bridge: fakeDeps(world) })
    expect(guest.status).toBe(401)
    world.users = [makeUser({ emailVerifiedAt: null })]
    const unverified = await showEmailPreferences(apiRequest("/api/v1/notifications/email-preferences", { cookie }), { bridge: fakeDeps(world) })
    expect(unverified.status).toBe(403)
    expect(JSON.parse(await unverified.text())).toEqual(JSON.parse(golden.errors.unverified.body))
  })
})
