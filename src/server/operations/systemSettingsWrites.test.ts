// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import settingsGolden from "./__fixtures__/system-settings-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, testKey, type FakeWorld } from "../auth/testing"
import { decrypt, encrypt } from "../http/encrypter"
import { createRateLimiter, type RateLimiter } from "../http/throttle"
import type { SettingsEnvironment } from "./systemSettings"
import { testSystemSettings, updateSystemSettings, type SystemSettingsWriteDeps } from "./systemSettingsWrites"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const PASSWORD = "Secreta-2026"
const ENVIRONMENT: SettingsEnvironment = {
  NOTIFICATION_EMAILS: "true",
  NOTIFICATION_DIGEST_TIME: "08:00",
  AI_DRIVER: "deepseek",
  AI_BASE_URL: "https://api.deepseek.com",
  AI_MODEL: "deepseek-chat",
  AI_API_KEY: "clave-entorno",
  AI_CONNECT_TIMEOUT: "2",
  AI_TIMEOUT: "50",
  CATALOG_DRIVER: "koha",
  KOHA_BASE_URL: "https://biblioteca.ueb.edu.ec",
}

let world: FakeWorld
let stored: Map<string, unknown>
let environment: SettingsEnvironment
let limiter: RateLimiter
let writes: { field: string; value: unknown; actorId: string; at: number }[]
let fetched: { url: string; init: RequestInit }[]
let fetchResult: () => Promise<Response>
let libraries: () => Promise<unknown[]>

function deps(): SystemSettingsWriteDeps {
  return {
    bridge: fakeDeps(world),
    stored: async () => new Map(stored),
    environment: () => environment,
    limiter,
    verifyPassword: async (plain) => plain === PASSWORD,
    save: async (rows, actorId, at) => {
      for (const row of rows) {
        writes.push({ field: row.field, value: row.value, actorId, at })
        stored.set(row.field, row.value)
      }
    },
    fetch: async (url, init) => {
      fetched.push({ url, init })
      return fetchResult()
    },
    libraries: () => libraries(),
  }
}

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      referer: "http://localhost:3000/configuracion/sistema",
      cookie,
      "x-csrf-token": golden.csrfToken,
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function update(section: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await updateSystemSettings(request("PUT", `/api/v1/admin/system-settings/${section}`, body, headers), section, deps())
  const text = await response.text()
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown>, headers: response.headers }
}

async function probe(section: string) {
  const response = await testSystemSettings(request("POST", `/api/v1/admin/system-settings/${section}/test`), section, deps())
  return { status: response.status, json: JSON.parse(await response.text()) as Record<string, unknown> }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })],
  }
  stored = new Map()
  environment = { ...ENVIRONMENT }
  limiter = createRateLimiter()
  writes = []
  fetched = []
  fetchResult = async () => new Response("{}", { status: 200 })
  libraries = async () => [{ code: "BC" }, { code: "BG" }]
})

describe("PUT admin/system-settings/{section}", () => {
  it.each(settingsGolden.validation.map((sample, index) => [index, sample] as const))("matches UpdateSystemSettingsRequest case %i", async (_, sample) => {
    const response = await update(sample.section, sample.input)
    if (sample.settings === null) {
      expect(response.status).toBe(422)
      expect(response.json.errors).toEqual(sample.errors)
      expect(writes).toEqual([])
      return
    }
    expect(response.status).toBe(200)
    const saved = Object.fromEntries(writes.map((write) => [write.field, write.field === "ai.api_key" && typeof write.value === "string" ? decrypt(write.value, testKey, false) : write.value]))
    expect(saved).toEqual(sample.settings)
  })

  it("saves the section and answers with the new description", async () => {
    stored.set("notifications.emails", true)
    const response = await update("notificaciones", { emails: true, digest_time: "07:30" })
    expect(response.status).toBe(200)
    expect(response.headers.get("x-ratelimit-limit")).toBe("10")
    expect(response.headers.get("x-ratelimit-remaining")).toBe("9")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(writes).toEqual([
      { field: "notifications.emails", value: true, actorId: golden.userId, at: NOW },
      { field: "notifications.digest_time", value: "07:30", actorId: golden.userId, at: NOW },
    ])
    expect(response.json.notifications).toEqual({ emails: { value: true, source: "pantalla" }, digest_time: { value: "07:30", source: "pantalla" } })
  })

  it("encrypts a new AI key, keeps it when omitted and clears it on request", async () => {
    const base = { current_password: PASSWORD, driver: "deepseek", base_url: "https://api.deepseek.com/", model: "deepseek-chat", connect_timeout: 2, timeout: 50 }
    await update("ia", { ...base, api_key: "sk-nueva" })
    const key = writes.find((write) => write.field === "ai.api_key")
    expect(typeof key?.value === "string" && decrypt(key.value, testKey, false)).toBe("sk-nueva")
    expect(writes.find((write) => write.field === "ai.base_url")?.value).toBe("https://api.deepseek.com")
    writes = []
    const kept = await update("ia", base)
    expect(writes.map((write) => write.field)).not.toContain("ai.api_key")
    expect((kept.json.ai as Record<string, unknown>).api_key).toEqual({ configured: true, source: "pantalla" })
    writes = []
    await update("ia", { ...base, clear_api_key: true })
    expect(writes.find((write) => write.field === "ai.api_key")?.value).toBeNull()
  })

  it("answers 500 when the current password is a list, like PHP's password_verify", async () => {
    expect((await update("biblioteca", { current_password: ["x"], driver: "koha", base_url: "https://b.ec" })).status).toBe(500)
    expect(writes).toEqual([])
  })

  it("forbids every other role and throttles after ten attempts a minute", async () => {
    world.assignments = [makeAssignment({ role: "coordinador" })]
    const denied = await update("notificaciones", { emails: true, digest_time: "07:30" })
    expect(denied.status).toBe(403)
    expect(denied.text).toBe('{"message":"No tiene permiso para hacer esto."}')
    for (let attempt = 1; attempt < 10; attempt += 1) await update("notificaciones", {})
    const limited = await update("notificaciones", {})
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("60")
  })
})

describe("POST admin/system-settings/{section}/test", () => {
  it("checks the AI provider with the saved key and reports Laravel's messages", async () => {
    stored.set("ai.api_key", encrypt("sk-guardada", testKey, false))
    expect(await probe("ia")).toEqual({ status: 200, json: { ok: true, message: "Conexión correcta con el proveedor de IA" } })
    expect(fetched[0].url).toBe("https://api.deepseek.com/models")
    expect(new Headers(fetched[0].init.headers).get("authorization")).toBe("Bearer sk-guardada")
    expect(fetched[0].init.redirect).toBe("manual")
    fetchResult = async () => new Response("", { status: 401 })
    expect((await probe("ia")).json).toEqual({ ok: false, message: "El proveedor no aceptó la clave" })
    fetchResult = async () => new Response("", { status: 302 })
    expect((await probe("ia")).json).toEqual({ ok: false, message: "El proveedor de IA respondió con un error (302)" })
    fetchResult = async () => Promise.reject(new TypeError("fetch failed"))
    expect((await probe("ia")).json).toEqual({ ok: false, message: "No se pudo conectar con el proveedor de IA" })
  })

  it("explains why the AI test cannot run", async () => {
    environment = { ...ENVIRONMENT, AI_DRIVER: "disabled" }
    expect((await probe("ia")).json).toEqual({ ok: false, message: "El asistente de IA está desactivado" })
    environment = { ...ENVIRONMENT, AI_API_KEY: "  " }
    expect((await probe("ia")).json).toEqual({ ok: false, message: "Falta la clave del proveedor de IA" })
    environment = { ...ENVIRONMENT, AI_BASE_URL: "http://api.deepseek.com" }
    expect((await probe("ia")).json).toEqual({ ok: false, message: "La dirección del proveedor debe empezar con https://" })
    expect(fetched).toEqual([])
  })

  it("counts the Koha libraries", async () => {
    expect((await probe("biblioteca")).json).toEqual({ ok: true, message: "Conexión correcta: 2 bibliotecas" })
    libraries = async () => [{ code: "BC" }]
    expect((await probe("biblioteca")).json).toEqual({ ok: true, message: "Conexión correcta: 1 biblioteca" })
    libraries = async () => Promise.reject(new Error("caído"))
    expect((await probe("biblioteca")).json).toEqual({ ok: false, message: "No se pudo consultar el catálogo de la biblioteca" })
    environment = { ...ENVIRONMENT, CATALOG_DRIVER: "disabled" }
    expect((await probe("biblioteca")).json).toEqual({ ok: false, message: "La búsqueda en la biblioteca está desactivada" })
  })
})
