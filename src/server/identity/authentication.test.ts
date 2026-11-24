// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import filterEmailGolden from "./__fixtures__/filter-email-golden.json"
import { createMemoryAttemptLimiter } from "../auth/attemptLimiter"
import { fakeDeps, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, storedJson, testKey, xsrfHeader, type FakeWorld } from "../auth/testing"
import type { SessionWriterDeps } from "../auth/sessionWriter"
import { cookiePrefix } from "../laravel/cookies"
import { decrypt } from "../laravel/encrypter"
import { hashPasswordForCookie, loginSessionKey, recallerCookieName } from "../laravel/sessionGuard"
import { createRateLimiter } from "../laravel/throttle"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { csrfCookie, filterEmailShape, leaveActiveRole, login, logout, selectActiveRole, updatePassword, type AuthenticationDeps } from "./authentication"
import type { UserProfile } from "./session"

const PASSWORD = "Demo-2026!"
const HASH = `hash:${PASSWORD}`
const EMAIL = "docente@silabos.test"
const LOGIN_KEY = loginSessionKey()
const TOKEN = golden.csrfToken
const OTHER_ROLE = "0193a3c2-3333-7000-8000-000000000003"

let world: FakeWorld
let audits: AuditEventInput[]
let remember: Map<string, string | null>
let forwarded: Request[]
let twoFactor: boolean
let sequence: number

const profile: UserProfile = { name: "DOCENTE DEMO", email: EMAIL, formation: null, accessibility: null, twoFactorSecret: false, twoFactorConfirmed: false }

function deps(overrides: Partial<AuthenticationDeps> = {}): AuthenticationDeps {
  const writer: SessionWriterDeps = {
    ...fakeDeps(world, forwarded),
    cookie: { path: "/", domain: null, secure: false, sameSite: "lax" },
    random: (length) => String.fromCharCode(65 + (sequence++ % 26)).repeat(length),
    lottery: () => false,
  }
  return {
    writer,
    credentials: {
      findActiveUserByEmail: async (email) => {
        const user = world.users.find((candidate) => candidate.active && email === EMAIL && candidate.id === golden.userId)
        return user ? { id: user.id, passwordHash: user.passwordHash, twoFactorEnabled: twoFactor } : null
      },
      rememberToken: async (id) => remember.get(id) ?? null,
      setRememberToken: async (id, token) => void remember.set(id, token),
      setPassword: async (id, hash) => {
        world.users = world.users.map((user) => (user.id === id ? { ...user, passwordHash: hash } : user))
      },
      deleteOtherSessions: async (userId, exceptId) => {
        let deleted = 0
        for (const [id, row] of world.sessions) {
          if (row.userId === userId && id !== exceptId) {
            world.sessions.delete(id)
            deleted += 1
          }
        }
        return deleted
      },
      recordAudit: async (event) => void audits.push(event),
    },
    profiles: { find: async (id) => (id === golden.userId ? profile : null) },
    today: () => "2026-10-21",
    timezone: () => "America/Guayaquil",
    throttles: createRateLimiter(),
    attempts: createMemoryAttemptLimiter(() => NOW),
    verifyPassword: async (plain, hash) => hash === `hash:${plain}`,
    hashPassword: async (plain) => `hash:${plain}`,
    dummyHash: async () => "dummy",
    production: () => false,
    ...overrides,
  }
}

const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`

function call(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      accept: "application/json",
      referer: "http://localhost:3000/ingresar",
      cookie: COOKIE,
      "x-xsrf-token": xsrfHeader(TOKEN),
      "x-forwarded-for": "::1",
      "user-agent": "Prueba/1.0",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function withSession(attributes: Record<string, unknown>, id = golden.sessionId): void {
  world.sessions.set(id, { payload: sessionPayload(attributes), lastActivity: NOW - 60, userId: (attributes[LOGIN_KEY] as string) ?? null })
}

const anonymous = () => ({ _token: TOKEN, _previous: { url: "http://localhost:3000/sanctum/csrf-cookie", route: "sanctum.csrf-cookie" }, _flash: { old: [], new: [] } })
const loggedIn = (extra: Record<string, unknown> = {}) => ({
  _token: TOKEN,
  _flash: { old: [], new: [] },
  [LOGIN_KEY]: golden.userId,
  active_role_assignment_id: golden.roleId,
  password_hash_web: hashPasswordForCookie(HASH, golden.appKey),
  ...extra,
})

function cookies(response: Response): Record<string, { value: string; attributes: string }> {
  return Object.fromEntries(
    response.headers.getSetCookie().map((header) => {
      const name = header.slice(0, header.indexOf("="))
      const encrypted = decodeURIComponent(header.slice(name.length + 1, header.indexOf(";")))
      const plain = decrypt(encrypted, testKey, false)
      expect(plain.startsWith(cookiePrefix(name, testKey))).toBe(true)
      return [name, { value: plain.slice(41), attributes: header.slice(header.indexOf(";")) }]
    }),
  )
}

beforeEach(() => {
  world = { sessions: new Map(), users: [makeUser({ passwordHash: HASH })], assignments: [makeAssignment()] }
  audits = []
  remember = new Map([[golden.userId, "old-remember-token"]])
  forwarded = []
  twoFactor = false
  sequence = 0
})

describe("GET /sanctum/csrf-cookie", () => {
  it("answers 204 with the XSRF and session cookies and stores the previous URL, like Sanctum", async () => {
    const response = await csrfCookie(new Request("http://localhost:3000/sanctum/csrf-cookie", { headers: { accept: "application/json", "x-forwarded-for": "::1" } }), deps())
    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(response.headers.get("content-type")).toBeNull()
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(response.headers.getSetCookie().map((header) => header.slice(0, header.indexOf("=")))).toEqual(["XSRF-TOKEN", golden.cookieName])
    const set = cookies(response)
    expect(set["XSRF-TOKEN"].value).toBe("B".repeat(40))
    expect(set[golden.cookieName]).toEqual({ value: "A".repeat(40), attributes: `; expires=${new Date((NOW + 7200) * 1000).toUTCString()}; Max-Age=7200; path=/; httponly; samesite=lax` })
    expect(storedJson(world, "A".repeat(40))).toBe(JSON.stringify({ ...anonymous(), _token: "B".repeat(40) }).replaceAll("/", "\\/"))
    expect(world.sessions.get("A".repeat(40))).toMatchObject({ userId: null, ipAddress: "::1" })
  })
})

describe("POST /api/v1/authentication/login", () => {
  it("answers 400 outside the web app without a session or a password check", async () => {
    let checked = false
    const request = new Request("http://localhost:3000/api/v1/authentication/login", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    const response = await login(request, deps({ verifyPassword: async () => (checked = true) }))
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('{"message":"Inicie sesi\\u00f3n desde la aplicaci\\u00f3n web."}')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(world.sessions.size).toBe(0)
    expect(checked).toBe(false)
  })

  it("answers 419 on a token mismatch and still stores the session, without the XSRF cookie", async () => {
    const response = await login(call("/api/v1/authentication/login", "POST", { email: EMAIL, password: PASSWORD }, { cookie: "", "x-xsrf-token": "" }), deps())
    expect(response.status).toBe(419)
    expect(await response.text()).toBe('{\n    "message": "CSRF token mismatch."\n}')
    expect(Object.keys(cookies(response))).toEqual([golden.cookieName])
    expect(storedJson(world, "A".repeat(40))).toBe(`{"_token":"${"B".repeat(40)}","_flash":{"old":[],"new":[]}}`)
  })

  it("logs in, regenerates the session, picks the sole role and never sets a remember cookie", async () => {
    withSession(anonymous())
    const response = await login(call("/api/v1/authentication/login", "POST", { email: EMAIL, password: PASSWORD, remember: true }), deps())
    expect(response.status).toBe(200)
    const body = JSON.parse(await response.text())
    expect(body.user).toEqual({ id: golden.userId, name: "DOCENTE DEMO", email: EMAIL, email_verified: true, can_edit_identity: false, formation: null, accessibility: null })
    expect(body.active_role.id).toBe(golden.roleId)
    expect(response.headers.get("x-ratelimit-limit")).toBe("5")
    expect(response.headers.get("x-ratelimit-remaining")).toBe("4")
    const set = cookies(response)
    expect(Object.keys(set)).toEqual(["XSRF-TOKEN", golden.cookieName])
    expect(set).not.toHaveProperty(recallerCookieName())
    const id = set[golden.cookieName].value
    expect(id).toBe("C".repeat(40))
    expect(world.sessions.has(golden.sessionId)).toBe(false)
    expect(world.sessions.has("A".repeat(40))).toBe(false)
    expect(storedJson(world, id)).toBe(
      JSON.stringify({ ...anonymous(), _token: "D".repeat(40), [LOGIN_KEY]: golden.userId, password_hash_web: hashPasswordForCookie(HASH, golden.appKey), active_role_assignment_id: golden.roleId }).replaceAll("/", "\\/"),
    )
    expect(set["XSRF-TOKEN"].value).toBe("D".repeat(40))
    expect(world.sessions.get(id)).toMatchObject({ userId: golden.userId, ipAddress: "::1", userAgent: "Prueba/1.0", lastActivity: NOW })
    expect(audits).toEqual([{ actorId: golden.userId, roleAssignmentId: null, action: "sesion.iniciada", resourceType: "usuario", resourceId: golden.userId, result: "exito", metadata: {}, occurredAt: NOW }])
  })

  it("rejects wrong credentials with the generic message and keeps the session as guest", async () => {
    withSession(anonymous())
    const response = await login(call("/api/v1/authentication/login", "POST", { email: EMAIL, password: "otra" }), deps())
    expect(response.status).toBe(422)
    expect(await response.text()).toBe('{"message":"Las credenciales proporcionadas no son v\\u00e1lidas."}')
    expect(cookies(response)[golden.cookieName].value).toBe(golden.sessionId)
    expect(JSON.parse(storedJson(world, golden.sessionId) ?? "{}")).toEqual(anonymous())
    expect(audits).toEqual([])
  })

  it("validates with the Spanish messages of the login request", async () => {
    withSession(anonymous())
    const response = await login(call("/api/v1/authentication/login", "POST", { email: "no-es-correo", password: "" }), deps())
    expect(response.status).toBe(422)
    expect(await response.text()).toBe(
      '{"message":"Ingrese un correo electr\\u00f3nico v\\u00e1lido. (y 1 error m\\u00e1s)","errors":{"email":["Ingrese un correo electr\\u00f3nico v\\u00e1lido."],"password":["Ingrese su contrase\\u00f1a."]}}',
    )
    const missing = await login(call("/api/v1/authentication/login", "POST", {}), deps())
    expect(JSON.parse(await missing.text()).errors).toEqual({ email: ["Ingrese su correo electrónico."], password: ["Ingrese su contraseña."] })
  })

  it("scopes the throttle by email, so six people behind one IP can all try", async () => {
    withSession(anonymous())
    const shared = deps()
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await login(call("/api/v1/authentication/login", "POST", { email: `persona${attempt}@silabos.test`, password: "incorrecta" }), shared)
      expect(response.status).toBe(422)
    }
  })

  it("stops the sixth attempt of one email in a minute with the throttle middleware", async () => {
    withSession(anonymous())
    const shared = deps()
    for (let attempt = 1; attempt <= 5; attempt += 1) await login(call("/api/v1/authentication/login", "POST", { email: EMAIL, password: "incorrecta" }), shared)
    const response = await login(call("/api/v1/authentication/login", "POST", { email: EMAIL, password: PASSWORD }), shared)
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{\n    "message": "Too Many Attempts."\n}')
    expect(Object.keys(cookies(response))).toEqual(["XSRF-TOKEN", golden.cookieName])
  })

  it("locks an account after twenty failures from any IP, with Retry-After", async () => {
    withSession(anonymous())
    const shared = deps()
    for (let attempt = 0; attempt < 20; attempt += 1) await shared.attempts.hit(`login-account:${EMAIL}`, 3600)
    const response = await login(call("/api/v1/authentication/login", "POST", { email: EMAIL, password: PASSWORD }), shared)
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"message":"Demasiados intentos. Intente nuevamente en unos minutos."}')
    expect(response.headers.get("retry-after")).toBe("3600")
  })

  it("hands off to the second factor without logging in or regenerating the session", async () => {
    withSession(anonymous())
    twoFactor = true
    const response = await login(call("/api/v1/authentication/login", "POST", { email: EMAIL, password: PASSWORD }), deps())
    expect(response.status).toBe(202)
    expect(await response.text()).toBe('{"two_factor_required":true,"message":"Ingrese el c\\u00f3digo de su aplicaci\\u00f3n de autenticaci\\u00f3n."}')
    expect(cookies(response)[golden.cookieName].value).toBe(golden.sessionId)
    expect(JSON.parse(storedJson(world, golden.sessionId) ?? "{}")).toEqual({ ...anonymous(), login: { id: golden.userId, at: NOW } })
    expect(audits).toEqual([])
  })

  it("rejects itself, without Laravel, the emails PHP's filter rejects", async () => {
    withSession(anonymous())
    const response = await login(call("/api/v1/authentication/login", "POST", { email: "ana@localhost", password: PASSWORD }), deps())
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ message: "Ingrese un correo electrónico válido.", errors: { email: ["Ingrese un correo electrónico válido."] } })
    expect(forwarded).toHaveLength(0)
  })
})

describe("POST /api/v1/authentication/logout", () => {
  it("audits, cycles the remember token, deletes the session and starts a new guest one owned by the Sanctum user", async () => {
    withSession(loggedIn())
    const response = await logout(call("/api/v1/authentication/logout", "POST"), deps())
    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(world.sessions.has(golden.sessionId)).toBe(false)
    const set = cookies(response)
    expect(set[golden.cookieName].value).toBe("B".repeat(40))
    expect(set["XSRF-TOKEN"].value).toBe("C".repeat(40))
    expect(storedJson(world, "B".repeat(40))).toBe(`{"_token":"${"C".repeat(40)}","_flash":{"old":[],"new":[]}}`)
    expect(world.sessions.get("B".repeat(40))?.userId).toBe(golden.userId)
    expect(remember.get(golden.userId)).toBe("A".repeat(60))
    expect(audits.map((event) => [event.action, event.roleAssignmentId])).toEqual([["sesion.cerrada", golden.roleId]])
  })

  it("keeps an empty remember token empty", async () => {
    withSession(loggedIn())
    remember.set(golden.userId, null)
    await logout(call("/api/v1/authentication/logout", "POST"), deps())
    expect(remember.get(golden.userId)).toBeNull()
  })

  it("answers 401 to a guest, with the session cookies", async () => {
    withSession(anonymous())
    const response = await logout(call("/api/v1/authentication/logout", "POST"), deps())
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"message":"Unauthenticated."}')
    expect(Object.keys(cookies(response))).toEqual(["XSRF-TOKEN", golden.cookieName])
  })

  it("leaves to Laravel a logout that has to forget a remember cookie", async () => {
    withSession(loggedIn())
    await logout(call("/api/v1/authentication/logout", "POST", undefined, { cookie: `${COOKIE}; ${recallerCookieName()}=x` }), deps())
    expect(forwarded).toHaveLength(1)
    expect(world.sessions.has(golden.sessionId)).toBe(true)
  })
})

describe("PUT and DELETE /api/v1/active-role", () => {
  beforeEach(() => {
    world.assignments = [makeAssignment({ role: "coordinador" }), makeAssignment({ id: OTHER_ROLE, role: "docente" })]
  })

  it("selects a role, audits it and regenerates the session without deleting the old row", async () => {
    withSession(loggedIn({ active_role_assignment_id: undefined }))
    const response = await selectActiveRole(call("/api/v1/active-role", "PUT", { role_assignment_id: OTHER_ROLE }), deps())
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()).active_role).toEqual({ id: OTHER_ROLE, code: "docente", career_id: "c-1", career_name: "Software" })
    const id = cookies(response)[golden.cookieName].value
    expect(id).not.toBe(golden.sessionId)
    expect(world.sessions.has(golden.sessionId)).toBe(true)
    expect(JSON.parse(storedJson(world, id) ?? "{}").active_role_assignment_id).toBe(OTHER_ROLE)
    expect(audits.map((event) => [event.action, event.roleAssignmentId, event.metadata])).toEqual([["rol_activo.seleccionado", OTHER_ROLE, { role: "docente" }]])
  })

  it("validates the role and answers 404 for a role that is not the user's", async () => {
    withSession(loggedIn())
    const empty = await selectActiveRole(call("/api/v1/active-role", "PUT", {}), deps())
    expect(await empty.text()).toBe('{"message":"Seleccione un rol.","errors":{"role_assignment_id":["Seleccione un rol."]}}')
    const malformed = await selectActiveRole(call("/api/v1/active-role", "PUT", { role_assignment_id: "x" }), deps())
    expect(JSON.parse(await malformed.text()).message).toBe("El rol seleccionado no es válido.")
    const missing = await selectActiveRole(call("/api/v1/active-role", "PUT", { role_assignment_id: "0193a3c2-9999-7000-8000-000000000009" }), deps())
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('{\n    "message": ""\n}')
    expect(audits).toEqual([])
  })

  it("sends a user with several roles back to choose again", async () => {
    withSession(loggedIn())
    const response = await leaveActiveRole(call("/api/v1/active-role", "DELETE"), deps())
    const body = JSON.parse(await response.text())
    expect(body.active_role).toBeNull()
    expect(body.available_roles).toHaveLength(2)
    expect(audits.map((event) => [event.action, event.resourceId])).toEqual([["rol_activo.cerrado", golden.roleId]])
    expect(JSON.parse(storedJson(world, cookies(response)[golden.cookieName].value) ?? "{}")).not.toHaveProperty("active_role_assignment_id")
  })

  it("re-selects the only role right away, like Laravel's session payload does", async () => {
    world.assignments = [makeAssignment()]
    withSession(loggedIn())
    const body = JSON.parse(await (await leaveActiveRole(call("/api/v1/active-role", "DELETE"), deps())).text())
    expect(body.active_role.id).toBe(golden.roleId)
    expect(audits).toHaveLength(1)
  })

  it("answers 403 to an unverified account", async () => {
    world.users = [makeUser({ passwordHash: HASH, emailVerifiedAt: null })]
    withSession(loggedIn())
    const response = await selectActiveRole(call("/api/v1/active-role", "PUT", { role_assignment_id: OTHER_ROLE }), deps())
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('{\n    "message": "Your email address is not verified."\n}')
  })
})

describe("PUT /api/v1/authentication/password", () => {
  const change = (body: unknown) => updatePassword(call("/api/v1/authentication/password", "PUT", body), deps())

  it("validates the current password, the length, the confirmation and that it changes", async () => {
    withSession(loggedIn())
    expect(JSON.parse(await (await change({ current_password: "mala", password: "corta", password_confirmation: "otra" })).text())).toEqual({
      message: "La contraseña es incorrecta. (y 2 errores más)",
      errors: {
        current_password: ["La contraseña es incorrecta."],
        password: ["El campo contraseña debe tener al menos 8 caracteres.", "La confirmación de contraseña no coincide."],
      },
    })
    expect(JSON.parse(await (await change({ current_password: PASSWORD, password: PASSWORD, password_confirmation: PASSWORD })).text()).errors).toEqual({
      password: ["La contraseña nueva debe ser distinta de la actual."],
    })
    expect(world.users[0].passwordHash).toBe(HASH)
  })

  it("changes the password, closes the other sessions and keeps the current one valid", async () => {
    withSession(loggedIn())
    withSession(loggedIn(), "Z".repeat(40))
    const response = await change({ current_password: PASSWORD, password: "Nueva-Clave-2026", password_confirmation: "Nueva-Clave-2026" })
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()).user.id).toBe(golden.userId)
    expect(world.users[0].passwordHash).toBe("hash:Nueva-Clave-2026")
    expect([...world.sessions.keys()]).toEqual([golden.sessionId])
    expect(cookies(response)[golden.cookieName].value).toBe(golden.sessionId)
    expect(JSON.parse(storedJson(world, golden.sessionId) ?? "{}").password_hash_web).toBe(hashPasswordForCookie("hash:Nueva-Clave-2026", golden.appKey))
    expect(remember.get(golden.userId)).toBe("A".repeat(60))
    expect(audits.map((event) => [event.action, event.roleAssignmentId])).toEqual([["usuario.contrasena_actualizada", golden.roleId]])
  })

  it("answers 401 to a guest and leaves production to Laravel's stronger password rule", async () => {
    withSession(anonymous())
    expect((await change({})).status).toBe(401)
    withSession(loggedIn())
    const response = await updatePassword(call("/api/v1/authentication/password", "PUT", {}), deps({ production: () => true }))
    expect(response.status).toBe(299)
  })
})

describe("email:filter", () => {
  const PHP_FILTER_VALIDATE_EMAIL: [string, boolean][] = [["docente@silabos.test", true], ["ana.perez@ueb.edu.ec", true], ["a+b_c%d-e@x-y.co", true], ["ana@localhost", false], ["ana@sub.123", false], ["ana@x.c0m", true], ["ana@xn--bcher-kva.ch", true], ["x@-a.com", false], ["x@a-.com", false], ["a..b@x.com", false], [".a@x.com", false], ["a@x..com", false], ["ñandú@x.com", false], ["ana@x.com ", false], ["no-es-correo", false], ["@x.com", false], ["a@", false], ["a@b@c.com", false], ["\"q\"@x.com", true], ["a@[127.0.0.1]", true], ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@x.com", true], ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@x.com", false], ["a@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.com", true], ["a@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.com", false], ["ANA@X.COM", true], ["a@x.museum", true], ["a@1x.com", true], ["a@x.1com", false]]

  it("decides every address exactly like PHP's FILTER_VALIDATE_EMAIL", () => {
    const cases = [...PHP_FILTER_VALIDATE_EMAIL, ...(filterEmailGolden as [string, boolean][])]
    expect(cases.map(([email]) => [email, filterEmailShape(email) === "valid"])).toEqual(cases)
    expect(cases.filter(([email]) => !["valid", "invalid"].includes(filterEmailShape(email)))).toEqual([])
  })

  it("rejects what is not a string and anything longer than 320 bytes", () => {
    expect(filterEmailShape(undefined)).toBe("invalid")
    expect(filterEmailShape(123)).toBe("invalid")
    expect(filterEmailShape(`${"a".repeat(60)}.${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}@${"e".repeat(60)}.${"f".repeat(19)}.ec`)).toBe("invalid")
  })
})
