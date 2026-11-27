// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { showSystemSettings, type SettingsEnvironment } from "./systemSettings"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const KEY = "clave-prueba-0000000000004c2e"
const ENVIRONMENT: SettingsEnvironment = {
  NOTIFICATION_EMAILS: "true",
  NOTIFICATION_DIGEST_TIME: "08:00",
  AI_DRIVER: "deepseek",
  AI_BASE_URL: "https://api.deepseek.com",
  AI_MODEL: "deepseek-chat",
  AI_API_KEY: KEY,
  AI_CONNECT_TIMEOUT: "2",
  AI_TIMEOUT: "50",
  CATALOG_DRIVER: "koha",
  KOHA_BASE_URL: "https://biblioteca.ueb.edu.ec",
}

let world: FakeWorld
let stored: Map<string, unknown>
let environment: SettingsEnvironment

async function show() {
  const response = await showSystemSettings(apiRequest("/api/v1/admin/system-settings", { cookie }), {
    bridge: fakeDeps(world),
    stored: async () => stored,
    environment: () => environment,
  })
  return { status: response.status, text: await response.text() }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })],
  }
  stored = new Map()
  environment = { ...ENVIRONMENT }
})

describe("system settings", () => {
  it("shows the environment values to Administration, without anything of the AI provider", async () => {
    const response = await show()
    expect(response.status).toBe(200)
    expect(response.text).toBe(
      '{"notifications":{"emails":{"value":true,"source":"entorno"},"digest_time":{"value":"08:00","source":"entorno"}},' +
        '"library":{"driver":{"value":"koha","source":"entorno"},"base_url":{"value":"https://biblioteca.ueb.edu.ec","source":"entorno"}},' +
        '"teacher_assistant":{"enabled":{"value":false,"source":"entorno"}}}',
    )
    expect(response.text).not.toContain("4c2e")
  })

  it("forbids every other role", async () => {
    world.assignments = [makeAssignment({ role: "coordinador" })]
    expect(await show()).toEqual({ status: 403, text: '{"message":"No tiene permiso para hacer esto."}' })
  })

  it("uses Laravel defaults when the environment is empty", async () => {
    environment = {}
    expect(JSON.parse((await show()).text)).toEqual({
      notifications: { emails: { value: true, source: "entorno" }, digest_time: { value: "08:00", source: "entorno" } },
      library: { driver: { value: "disabled", source: "entorno" }, base_url: { value: null, source: "entorno" } },
      teacher_assistant: { enabled: { value: false, source: "entorno" } },
    })
  })

  it("keeps the teacher assistant off whatever the environment says and shows what Administration saved", async () => {
    environment = { ...ENVIRONMENT, TEACHER_ASSISTANT_ENABLED: "true" }
    expect(JSON.parse((await show()).text).teacher_assistant).toEqual({ enabled: { value: false, source: "entorno" } })

    stored = new Map<string, unknown>([["teacher_assistant.enabled", true]])
    expect(JSON.parse((await show()).text).teacher_assistant).toEqual({ enabled: { value: true, source: "pantalla" } })
  })

  it("prefers what Administration saved and ignores the AI settings an older screen left stored", async () => {
    stored = new Map<string, unknown>([
      ["notifications.emails", false],
      ["notifications.digest_time", "07:30"],
      ["ai.driver", "deepseek"],
      ["ai.api_key", "resto-guardado"],
      ["library.base_url", null],
      ["otra.clave", "x"],
    ])
    const response = await show()
    const settings = JSON.parse(response.text)
    expect(settings.notifications).toEqual({ emails: { value: false, source: "pantalla" }, digest_time: { value: "07:30", source: "pantalla" } })
    expect(settings.library.base_url).toEqual({ value: null, source: "pantalla" })
    expect(Object.keys(settings)).toEqual(["notifications", "library", "teacher_assistant"])
    expect(response.text).not.toContain("resto-guardado")
  })
})
