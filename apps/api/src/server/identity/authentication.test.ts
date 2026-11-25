// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import filterEmailGolden from "./__fixtures__/filter-email-golden.json"
import { createMemoryAttemptLimiter } from "../auth/attemptLimiter"
import { authWorld, browserRequest, cookieHeaderFrom, type AuthWorld } from "../auth/betterAuthTesting"
import { bcryptVerify } from "../auth/bcrypt"
import { createRateLimiter } from "../http/throttle"
import { filterEmailShape, leaveActiveRole, login, logout, selectActiveRole, updatePassword, type AuthenticationDeps } from "./authentication"
import type { UserProfile } from "./session"

const USER = "0193a3c2-1111-7000-8000-000000000001"
const ROLE = "0193a3c2-2222-7000-8000-000000000001"
const OTHER_ROLE = "0193a3c2-3333-7000-8000-000000000003"
const PASSWORD = "Demo-2026!"
const EMAIL = "docente@silabos.test"

let world: AuthWorld
let mirrored: string[]

const profile: UserProfile = { name: "DOCENTE DEMO", email: EMAIL, formation: null, accessibility: null, twoFactorSecret: false, twoFactorConfirmed: false }

function deps(overrides: Partial<AuthenticationDeps> = {}): AuthenticationDeps {
  return {
    bridge: world.deps,
    auth: () => world.auth,
    credentials: {
      findActiveUserByEmail: async (email) => {
        const user = world.db.user.find((row) => row.email === email && row.active === true)
        return user ? { id: String(user.id) } : null
      },
      mirrorPassword: async (id) => void mirrored.push(id),
    },
    profiles: { find: async (id) => (id === USER ? profile : null) },
    today: () => "2026-10-21",
    timezone: () => "America/Guayaquil",
    throttles: createRateLimiter(),
    attempts: createMemoryAttemptLimiter(() => Math.floor(Date.now() / 1000)),
    verifyPassword: bcryptVerify,
    dummyHash: async () => "$2y$04$abcdefghijklmnopqrstuuJ0b0qz6bV1qz6bV1qz6bV1qz6bV1qz6",
    production: () => false,
    ...overrides,
  }
}

const post = (path: string, body: unknown, cookie?: string, origin?: string | null) => browserRequest(path, { method: "POST", body, cookie, origin })

async function signedIn(shared = deps()): Promise<string> {
  const response = await login(post("/api/v1/authentication/login", { email: EMAIL, password: PASSWORD }), shared)
  expect(response.status).toBe(200)
  return cookieHeaderFrom(response.headers.getSetCookie())
}

beforeEach(async () => {
  world = authWorld()
  mirrored = []
  await world.addUser({ id: USER, email: EMAIL }, PASSWORD)
  world.assignments.push({ id: ROLE, userId: USER, role: "docente", careerId: "c-1", careerLabel: "Software" })
})

describe("POST /api/v1/authentication/login", () => {
  it("answers 400 outside the web app without a session or a password check", async () => {
    const response = await login(post("/api/v1/authentication/login", { email: EMAIL, password: PASSWORD }, undefined, null), deps())
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "Inicie sesión desde la aplicación web." })
    expect(response.headers.getSetCookie()).toEqual([])
    const foreign = await login(post("/api/v1/authentication/login", { email: EMAIL, password: PASSWORD }, undefined, "https://evil.example"), deps())
    expect(foreign.status).toBe(400)
    expect(world.db.session).toHaveLength(0)
  })

  it("logs in with the stored bcrypt hash, sets the Better Auth cookie, picks the sole role and never remembers the user", async () => {
    const response = await login(post("/api/v1/authentication/login", { email: EMAIL, password: PASSWORD }), deps())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: { id: USER, name: "DOCENTE DEMO", email: EMAIL, email_verified: true, can_edit_identity: false, formation: null, accessibility: null },
      active_role: { id: ROLE, code: "docente", career_id: "c-1", career_name: "Software" },
      available_roles: [{ id: ROLE, code: "docente", career_id: "c-1", career_name: "Software" }],
      institution: { today: "2026-10-21", timezone: "America/Guayaquil" },
    })
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatch(/^silabos-ueb\.session_token=[^;]+; Max-Age=14400; Path=\/; HttpOnly; SameSite=Lax$/)
    expect(cookies.join("\n")).not.toMatch(/remember|dont_remember|XSRF/i)
    expect(world.db.session).toHaveLength(1)
    expect(world.db.session[0]).toMatchObject({ userId: USER, activeRoleAssignmentId: ROLE, userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0" })
  })

  it("rejects wrong credentials and inactive accounts with the generic message", async () => {
    const wrong = await login(post("/api/v1/authentication/login", { email: EMAIL, password: "otra" }), deps())
    expect(wrong.status).toBe(422)
    expect(await wrong.text()).toBe('{"message":"Las credenciales proporcionadas no son válidas."}')
    world.user(USER)!.active = false
    const inactive = await login(post("/api/v1/authentication/login", { email: EMAIL, password: PASSWORD }), deps())
    expect(inactive.status).toBe(422)
    expect(await inactive.json()).toEqual({ message: "Las credenciales proporcionadas no son válidas." })
    expect(world.db.session).toHaveLength(0)
  })

  it("validates with the Spanish messages of the login request", async () => {
    const response = await login(post("/api/v1/authentication/login", { email: "no-es-correo", password: "" }), deps())
    expect(response.status).toBe(422)
    expect(await response.text()).toBe(
      '{"message":"Ingrese un correo electrónico válido. (y 1 error más)","errors":{"email":["Ingrese un correo electrónico válido."],"password":["Ingrese su contraseña."]}}',
    )
    const missing = await login(post("/api/v1/authentication/login", {}), deps())
    expect(JSON.parse(await missing.text()).errors).toEqual({ email: ["Ingrese su correo electrónico."], password: ["Ingrese su contraseña."] })
  })

  it("scopes the throttle by email, so six people behind one IP can all try", async () => {
    const shared = deps()
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await login(post("/api/v1/authentication/login", { email: `persona${attempt}@silabos.test`, password: "incorrecta" }), shared)
      expect(response.status).toBe(422)
    }
  })

  it("stops the sixth attempt of one email in a minute with the Redis-style throttle", async () => {
    const shared = deps()
    for (let attempt = 1; attempt <= 5; attempt += 1) await login(post("/api/v1/authentication/login", { email: EMAIL, password: "incorrecta" }), shared)
    const response = await login(post("/api/v1/authentication/login", { email: EMAIL, password: PASSWORD }), shared)
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"message":"Too Many Attempts."}')
    expect(world.db.session).toHaveLength(0)
  })

  it("locks an account after twenty failures from any IP, with Retry-After", async () => {
    const shared = deps()
    for (let attempt = 0; attempt < 20; attempt += 1) await shared.attempts.hit(`login-account:${EMAIL}`, 3600)
    const response = await login(post("/api/v1/authentication/login", { email: EMAIL, password: PASSWORD }), shared)
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"message":"Demasiados intentos. Intente nuevamente en unos minutos."}')
    expect(response.headers.get("retry-after")).toBe("3600")
  })

  it("hands off to the second factor without keeping a session", async () => {
    world.user(USER)!.twoFactorEnabled = true
    world.db.twoFactor.push({ id: "tf-1", userId: USER, secret: "x", backupCodes: "x", verified: true, failedVerificationCount: 0, lockedUntil: null })
    const response = await login(post("/api/v1/authentication/login", { email: EMAIL, password: PASSWORD }), deps())
    expect(response.status).toBe(202)
    expect(await response.text()).toBe('{"two_factor_required":true,"message":"Ingrese el código de su aplicación de autenticación."}')
    expect(world.db.session).toHaveLength(0)
    expect(response.headers.getSetCookie().some((header) => header.startsWith("silabos-ueb.two_factor="))).toBe(true)
  })

  it("rejects itself the emails PHP's filter rejects", async () => {
    const response = await login(post("/api/v1/authentication/login", { email: "ana@localhost", password: PASSWORD }), deps())
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ message: "Ingrese un correo electrónico válido.", errors: { email: ["Ingrese un correo electrónico válido."] } })
  })
})

describe("POST /api/v1/authentication/logout", () => {
  it("deletes the session and expires the cookie", async () => {
    const cookie = await signedIn()
    const response = await logout(post("/api/v1/authentication/logout", undefined, cookie), deps())
    expect(response.status).toBe(204)
    expect(world.db.session).toHaveLength(0)
    expect(response.headers.getSetCookie().some((header) => header.startsWith("silabos-ueb.session_token=;") && /Max-Age=0/.test(header))).toBe(true)
  })

  it("answers 401 to a guest", async () => {
    expect((await logout(post("/api/v1/authentication/logout", undefined), deps())).status).toBe(401)
  })
})

describe("PUT and DELETE /api/v1/active-role", () => {
  beforeEach(() => {
    world.assignments.push({ id: OTHER_ROLE, userId: USER, role: "coordinador", careerId: "c-2", careerLabel: "Redes" })
  })

  it("stores the selected role on this session only", async () => {
    const shared = deps()
    const cookie = await signedIn(shared)
    const other = await signedIn(shared)
    const response = await selectActiveRole(browserRequest("/api/v1/active-role", { method: "PUT", cookie, body: { role_assignment_id: OTHER_ROLE } }), shared)
    expect(response.status).toBe(200)
    expect((await response.json()).active_role.id).toBe(OTHER_ROLE)
    expect(world.db.session.map((row) => row.activeRoleAssignmentId ?? null).sort()).toEqual([OTHER_ROLE, null].sort())
    expect(other).not.toBe(cookie)
  })

  it("validates the role and answers 404 for a role that is not the user's", async () => {
    const cookie = await signedIn()
    const invalid = await selectActiveRole(browserRequest("/api/v1/active-role", { method: "PUT", cookie, body: {} }), deps())
    expect(invalid.status).toBe(422)
    const missing = await selectActiveRole(browserRequest("/api/v1/active-role", { method: "PUT", cookie, body: { role_assignment_id: "0193a3c2-9999-7000-8000-000000000009" } }), deps())
    expect(missing.status).toBe(404)
  })

  it("sends a user with several roles back to choose again", async () => {
    const cookie = await signedIn()
    await selectActiveRole(browserRequest("/api/v1/active-role", { method: "PUT", cookie, body: { role_assignment_id: OTHER_ROLE } }), deps())
    const response = await leaveActiveRole(browserRequest("/api/v1/active-role", { method: "DELETE", cookie }), deps())
    expect(response.status).toBe(200)
    expect((await response.json()).active_role).toBeNull()
    expect(world.db.session[0].activeRoleAssignmentId ?? null).toBeNull()
  })

  it("answers 403 to an unverified account", async () => {
    world.user(USER)!.emailVerified = false
    const cookie = await signedIn()
    const response = await selectActiveRole(browserRequest("/api/v1/active-role", { method: "PUT", cookie, body: { role_assignment_id: OTHER_ROLE } }), deps())
    expect(response.status).toBe(403)
  })
})

describe("PUT /api/v1/authentication/password", () => {
  const change = (cookie: string | undefined, body: unknown, shared = deps()) => updatePassword(browserRequest("/api/v1/authentication/password", { method: "PUT", cookie, body }), shared)

  it("validates the current password, the length, the confirmation and that it changes", async () => {
    const cookie = await signedIn()
    expect(JSON.parse(await (await change(cookie, { current_password: "mala", password: "corta", password_confirmation: "otra" })).text())).toEqual({
      message: "La contraseña es incorrecta. (y 2 errores más)",
      errors: {
        current_password: ["La contraseña es incorrecta."],
        password: ["El campo contraseña debe tener al menos 8 caracteres.", "La confirmación de contraseña no coincide."],
      },
    })
    expect(JSON.parse(await (await change(cookie, { current_password: PASSWORD, password: PASSWORD, password_confirmation: PASSWORD })).text()).errors).toEqual({
      password: ["La contraseña nueva debe ser distinta de la actual."],
    })
    expect(await bcryptVerify(PASSWORD, String(world.db.account[0].password))).toBe(true)
  })

  it("changes the password, revokes the other sessions and keeps this browser signed in with its role", async () => {
    world.assignments.push({ id: OTHER_ROLE, userId: USER, role: "coordinador", careerId: "c-2", careerLabel: "Redes" })
    const shared = deps()
    const cookie = await signedIn(shared)
    const other = await signedIn(shared)
    await selectActiveRole(browserRequest("/api/v1/active-role", { method: "PUT", cookie, body: { role_assignment_id: OTHER_ROLE } }), shared)
    const response = await change(cookie, { current_password: PASSWORD, password: "Nueva-Clave-2026", password_confirmation: "Nueva-Clave-2026" }, shared)
    expect(response.status).toBe(200)
    expect((await response.json()).active_role.id).toBe(OTHER_ROLE)
    const stored = String(world.db.account[0].password)
    expect(stored.startsWith("$2y$04$")).toBe(true)
    expect(await bcryptVerify("Nueva-Clave-2026", stored)).toBe(true)
    expect(mirrored).toEqual([USER])
    expect(world.db.session).toHaveLength(1)
    expect(world.db.session[0].activeRoleAssignmentId).toBe(OTHER_ROLE)
    const renewed = cookieHeaderFrom(response.headers.getSetCookie(), cookie)
    expect((await leaveActiveRole(browserRequest("/api/v1/active-role", { method: "DELETE", cookie: renewed }), shared)).status).toBe(200)
    expect((await leaveActiveRole(browserRequest("/api/v1/active-role", { method: "DELETE", cookie: other }), shared)).status).toBe(401)
    expect((await leaveActiveRole(browserRequest("/api/v1/active-role", { method: "DELETE", cookie }), shared)).status).toBe(401)
  })

  it("answers 401 to a guest and applies the production password rule", async () => {
    expect((await change(undefined, {})).status).toBe(401)
    const cookie = await signedIn()
    const response = await change(cookie, { current_password: "secreto", password: "corta", password_confirmation: "corta" }, deps({ production: () => true }))
    expect(response.status).toBe(422)
    expect((JSON.parse(await response.text()) as { errors: Record<string, string[]> }).errors.password).toEqual([
      "El campo contraseña debe tener al menos 12 caracteres.",
      "El campo contraseña debe contener al menos una letra mayúscula y una minúscula",
      "El campo contraseña debe contener al menos un símbolo",
      "El campo contraseña debe contener al menos un número",
    ])
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
