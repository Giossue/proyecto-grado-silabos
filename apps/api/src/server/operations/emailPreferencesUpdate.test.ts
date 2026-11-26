// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { createRateLimiter, type RateLimiter } from "../http/throttle"
import { updateEmailPreferences } from "./emailPreferences"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const PATH = "/api/v1/notifications/email-preferences"

let world: FakeWorld
let saved: [string, unknown][]
let limiter: RateLimiter

function deps() {
  return {
    bridge: fakeDeps(world),
    limiter,
    preferences: {
      async save(userId: string, preferences: Record<string, unknown>) {
        saved.push([userId, preferences])
      },
    },
  }
}

function put(body: unknown, headers: Record<string, string> = {}, path = PATH): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      referer: "http://localhost:3000/configuracion/notificaciones",
      cookie,
      "x-csrf-token": golden.csrfToken,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function send(body: unknown, headers: Record<string, string> = {}, path = PATH) {
  const response = await updateEmailPreferences(put(body, headers, path), deps())
  const text = await response.text()
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown>, headers: response.headers }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment()],
  }
  saved = []
  limiter = createRateLimiter()
})

describe("PUT /api/v1/notifications/email-preferences", () => {
  it("lets a teacher turn off the daily summary and answers the option with it off", async () => {
    const result = await send({ preferences: { "docente.resumen_diario": false } })
    expect(result.status).toBe(200)
    expect(result.json.options).toEqual([expect.objectContaining({ type: "docente.resumen_diario", label: "Resumen diario", enabled: false })])
    expect(saved).toEqual([[golden.userId, { "docente.resumen_diario": false }]])
    expect(result.headers.get("x-ratelimit-limit")).toBe("20")
    expect(result.headers.get("x-ratelimit-remaining")).toBe("19")
  })

  it("keeps the earlier switches and casts 1, 0, '1' and '0' to booleans", async () => {
    world.users = [makeUser({ emailPreferences: { "silabo.aprobado": false } })]
    const casts: [unknown, boolean][] = [[0, false], ["1", true], [" 0 ", false], [1, true]]
    for (const [input, expected] of casts) {
      saved = []
      expect((await send({ preferences: { "docente.resumen_diario": input } })).status).toBe(200)
      expect(saved).toEqual([[golden.userId, { "silabo.aprobado": false, "docente.resumen_diario": expected }]])
    }
  })

  it("rejects notices of other roles with Laravel's message", async () => {
    expect(await send({ preferences: { "coordinacion.resumen_diario": false } })).toMatchObject({
      status: 422,
      text: '{"message":"Hay avisos que no corresponden a sus roles.","errors":{"preferences":["Hay avisos que no corresponden a sus roles."]}}',
    })
    expect((await send({ preferences: { "proceso.eliminado": false } })).status).toBe(422)
    expect(saved).toEqual([])
  })

  it("validates the list like the FormRequest, in Laravel's order", async () => {
    const required = '{"message":"El campo avisos por correo es obligatorio.","errors":{"preferences":["El campo avisos por correo es obligatorio."]}}'
    expect((await send({})).text).toBe(required)
    expect((await send({ preferences: [] })).text).toBe(required)
    expect((await send({ preferences: "   " })).text).toBe(required)
    expect((await send("not json")).text).toBe(required)
    expect((await send({ preferences: false })).json.errors).toEqual({
      preferences: ["El campo avisos por correo debe ser una lista.", "El campo avisos por correo debe tener al menos 1 elementos."],
    })
    expect((await send({ preferences: "si" })).json.errors).toEqual({ preferences: ["El campo avisos por correo debe ser una lista."] })
    const mixed = await send({ preferences: { "docente.resumen_diario": "true", otro: true, "coordinacion.resumen_diario": null } })
    expect(mixed.text).toBe(
      '{"message":"El campo aviso por correo debe ser verdadero o falso. (y 2 errores más)","errors":{' +
        '"preferences.docente.resumen_diario":["El campo aviso por correo debe ser verdadero o falso."],' +
        '"preferences.coordinacion.resumen_diario":["El campo aviso por correo debe ser verdadero o falso."],' +
        '"preferences":["Hay avisos que no corresponden a sus roles."]}}',
    )
    expect(saved).toEqual([])
  })

  it("limits each user to 20 changes a minute with Laravel's 429", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await send({ preferences: {} })).status).toBe(422)
    const limited = await send({ preferences: { "docente.resumen_diario": false } })
    expect(limited.status).toBe(429)
    expect(limited.text).toBe('{"message":"Too Many Attempts."}')
    expect(limited.headers.get("retry-after")).toBe("60")
    expect(saved).toEqual([])
  })

  it("counts the attempt before the account checks, like Laravel's middleware order", async () => {
    world.users = [makeUser({ active: false })]
    const result = await send({ preferences: { "docente.resumen_diario": false } })
    expect(result.status).toBe(403)
    expect(result.headers.get("x-ratelimit-remaining")).toBe("19")
  })

  it("needs the session and the web app's origin before counting", async () => {
    expect((await send({ preferences: { "docente.resumen_diario": false } }, { origin: "https://evil.example" })).status).toBe(401)
    expect((await send({ preferences: { "docente.resumen_diario": false } }, { referer: "", cookie: "" })).status).toBe(401)
    expect(limiter.attempts(`throttle:20,1:${golden.userId}`, NOW)).toBe(0)
  })

  it("reads the preferences from the query when the body has none, as Laravel's input() does", async () => {
    const result = await send({}, {}, `${PATH}?preferences[docente.resumen_diario]=0`)
    expect(result.status).toBe(200)
    expect(saved).toEqual([[golden.userId, { "docente.resumen_diario": false }]])
  })

  it("reads a form body like Laravel's request input", async () => {
    const request = new Request(`http://localhost:3000${PATH}`, {
      method: "PUT",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie, referer: "http://localhost:3000/", "x-csrf-token": golden.csrfToken },
      body: "preferences[docente.resumen_diario]=0",
    })
    const response = await updateEmailPreferences(request, deps())
    expect(response.status).toBe(200)
  })
})

