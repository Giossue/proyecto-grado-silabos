// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import catalog from "./screenHelpCatalog.json"
import { availableScreenHelp, showScreenHelp } from "./screenHelp"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const HELP = catalog as Record<string, { title: string; content: string }>

let world: FakeWorld

function asRole(role: string) {
  world.assignments = [makeAssignment({ role, careerId: role === "administrador" || role === "bibliotecario" ? null : "c-1" })]
}

async function call(handler: typeof showScreenHelp, path: string) {
  const response = await handler(apiRequest(path, { cookie }), { bridge: fakeDeps(world) })
  return { status: response.status, text: await response.text() }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [],
  }
  asRole("docente")
})

describe("screen help", () => {
  it("keeps the help texts in code with the screens the Laravel test lists", () => {
    const screens = Object.keys(HELP)
    expect(screens.length).toBeGreaterThanOrEqual(30)
    for (const screen of ["/admin/convocatorias", "/admin/configuracion/sistema", "/docente/mis-silabos/:syllabus", "/coordinacion/revisiones/:revision/historial", "/biblioteca/historial", "/coordinacion/historial"]) {
      expect(screens).toContain(screen)
    }
    for (const screen of ["/admin/ayuda", "/docente/panel", "/biblioteca/panel", "/coordinacion/panel"]) expect(screens).not.toContain(screen)
    expect(HELP["/coordinacion/revisiones"].content.startsWith("Arriba ve el aviso con el plazo de entrega")).toBe(true)
    expect(HELP["/coordinacion/historial"].content).toContain("aunque ya no dicte ese paralelo ni esté en la carrera")
  })

  it("lets any role read the help of a screen", async () => {
    const found = await call(showScreenHelp, "/api/v1/help?screen=%2Fdocente%2Fmis-silabos")
    expect(found.status).toBe(200)
    expect(JSON.parse(found.text)).toEqual({ help: { screen: "/docente/mis-silabos", ...HELP["/docente/mis-silabos"] } })
    expect(found.text.startsWith('{"help":{"screen":"\\/docente\\/mis-silabos","title":"Mis s\\u00edlabos","content":"Arriba ve')).toBe(true)

    const missing = await call(showScreenHelp, "/api/v1/help?screen=/docente/panel")
    expect(missing).toEqual({ status: 200, text: '{"help":null}' })
  })

  it("validates the screen like Laravel", async () => {
    expect(await call(showScreenHelp, "/api/v1/help?screen=sin-barra")).toEqual({
      status: 422,
      text: '{"message":"El formato del campo pantalla no es v\\u00e1lido.","errors":{"screen":["El formato del campo pantalla no es v\\u00e1lido."]}}',
    })
    expect(await call(showScreenHelp, "/api/v1/help")).toEqual({
      status: 422,
      text: '{"message":"El campo pantalla es obligatorio.","errors":{"screen":["El campo pantalla es obligatorio."]}}',
    })
    const long = await call(showScreenHelp, `/api/v1/help?screen=/${"a".repeat(160)}`)
    expect(long.status).toBe(422)
    expect(JSON.parse(long.text).errors).toEqual({ screen: ["El campo pantalla no debe tener más de 160 caracteres."] })
    const array = await call(showScreenHelp, "/api/v1/help?screen[]=/docente")
    expect(JSON.parse(array.text).errors).toEqual({
      screen: ["El campo pantalla debe ser una cadena de texto.", "El formato del campo pantalla no es válido."],
    })
  })

  it("gives the active role only the help of its screens", async () => {
    const response = await call(availableScreenHelp, "/api/v1/help/available")
    expect(response.status).toBe(200)
    const expected = Object.keys(HELP).filter((screen) => screen.startsWith("/docente/"))
    const help = (JSON.parse(response.text) as { help: { screen: string }[] }).help
    expect(help.map((item) => item.screen)).toEqual(expected)
    expect(help[0]).toEqual({ screen: expected[0], ...HELP[expected[0]] })

    asRole("bibliotecario")
    const library = JSON.parse((await call(availableScreenHelp, "/api/v1/help/available")).text) as { help: { screen: string }[] }
    expect(library.help.map((item) => item.screen)).toEqual(Object.keys(HELP).filter((screen) => screen.startsWith("/biblioteca/")))
  })

  it("has no help for Auditoría or Reportes, which are no longer part of the system", async () => {
    asRole("administrador")
    for (const screen of ["/admin/auditoria", "/admin/reportes"]) {
      expect(await call(showScreenHelp, `/api/v1/help?screen=${encodeURIComponent(screen)}`)).toEqual({ status: 200, text: '{"help":null}' })
    }
    const admin = (JSON.parse((await call(availableScreenHelp, "/api/v1/help/available")).text) as { help: { screen: string; title: string; content: string }[] }).help
    expect(admin.length).toBeGreaterThan(0)
    expect(admin.filter((item) => /auditor|reporte/i.test(`${item.screen} ${item.title} ${item.content}`))).toEqual([])
  })

  it("asks for an active role before answering", async () => {
    world.assignments = []
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: undefined })), lastActivity: NOW })
    expect(await call(availableScreenHelp, "/api/v1/help/available")).toEqual({ status: 409, text: '{\n    "message": "Seleccione un rol vigente."\n}' })
    expect((await call(showScreenHelp, "/api/v1/help?screen=/admin")).status).toBe(409)
  })
})
