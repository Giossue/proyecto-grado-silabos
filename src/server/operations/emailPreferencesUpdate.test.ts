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
  it("lets a teacher turn off one notice and answers the options with it off", async () => {
    const result = await send({ preferences: { "silabo.aprobado": false } })
    expect(result.status).toBe(200)
    const options = result.json.options as { type: string; enabled: boolean }[]
    expect(options[5]).toMatchObject({ type: "silabo.aprobado", enabled: false })
    expect(options.filter((option) => !option.enabled)).toHaveLength(1)
    expect(saved).toEqual([[golden.userId, { "silabo.aprobado": false }]])
    expect(result.text).toContain('"label":"S\\u00edlabo aprobado"')
    expect(result.headers.get("x-ratelimit-limit")).toBe("20")
    expect(result.headers.get("x-ratelimit-remaining")).toBe("19")
  })

  it("keeps the earlier switches and casts 1, 0, '1' and '0' to booleans", async () => {
    world.users = [makeUser({ emailPreferences: { "silabo.aprobado": false, "convocatoria.abierta": true } })]
    const result = await send({ preferences: { "convocatoria.abierta": 0, "silabo.reiniciado": "1", "proceso.cierre_proximo": " 0 " } })
    expect(result.status).toBe(200)
    expect(saved).toEqual([
      [golden.userId, { "silabo.aprobado": false, "convocatoria.abierta": false, "silabo.reiniciado": true, "proceso.cierre_proximo": false }],
    ])
    const enabled = Object.fromEntries((result.json.options as { type: string; enabled: boolean }[]).map((option) => [option.type, option.enabled]))
    expect(enabled["silabo.aprobado"]).toBe(false)
    expect(enabled["silabo.reiniciado"]).toBe(true)
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
    const mixed = await send({ preferences: { "silabo.aprobado": "true", otro: true, "silabo.reiniciado": null } })
    expect(mixed.text).toBe(
      '{"message":"El campo aviso por correo debe ser verdadero o falso. (y 2 errores m\\u00e1s)","errors":{' +
        '"preferences.silabo.aprobado":["El campo aviso por correo debe ser verdadero o falso."],' +
        '"preferences.silabo.reiniciado":["El campo aviso por correo debe ser verdadero o falso."],' +
        '"preferences":["Hay avisos que no corresponden a sus roles."]}}',
    )
    expect(saved).toEqual([])
  })

  it("limits each user to 20 changes a minute with Laravel's 429", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await send({ preferences: {} })).status).toBe(422)
    const limited = await send({ preferences: { "silabo.aprobado": false } })
    expect(limited.status).toBe(429)
    expect(limited.text).toBe('{\n    "message": "Too Many Attempts."\n}')
    expect(limited.headers.get("retry-after")).toBe("60")
    expect(saved).toEqual([])
  })

  it("counts the attempt before the account checks, like Laravel's middleware order", async () => {
    world.users = [makeUser({ active: false })]
    const result = await send({ preferences: { "silabo.aprobado": false } })
    expect(result.status).toBe(403)
    expect(result.headers.get("x-ratelimit-remaining")).toBe("19")
  })

  it("needs the session and the CSRF token before counting", async () => {
    expect((await send({ preferences: { "silabo.aprobado": false } }, { "x-csrf-token": "other" })).status).toBe(419)
    expect((await send({ preferences: { "silabo.aprobado": false } }, { referer: "", cookie: "" })).status).toBe(401)
    expect(limiter.attempts(`throttle:20,1:${golden.userId}`, NOW)).toBe(0)
  })

  it("reads the preferences from the query when the body has none, as Laravel's input() does", async () => {
    const result = await send({}, {}, `${PATH}?preferences[silabo.aprobado]=0`)
    expect(result.status).toBe(200)
    expect(saved).toEqual([[golden.userId, { "silabo.aprobado": false }]])
  })

  it("reads a form body like Laravel's request input", async () => {
    const request = new Request(`http://localhost:3000${PATH}`, {
      method: "PUT",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie, referer: "http://localhost:3000/", "x-csrf-token": golden.csrfToken },
      body: "preferences[silabo.aprobado]=0",
    })
    const response = await updateEmailPreferences(request, deps())
    expect(response.status).toBe(200)
  })
})

