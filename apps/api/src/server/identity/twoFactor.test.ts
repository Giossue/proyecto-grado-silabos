// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import { createMemoryAttemptLimiter } from "../auth/attemptLimiter"
import { authWorld, browserRequest, cookieHeaderFrom, secretFromUri, totpCode, type AuthWorld } from "../auth/betterAuthTesting"
import { bcryptVerify } from "../auth/bcrypt"
import { memoryReplayGuard } from "../auth/totp"
import { createRateLimiter } from "../http/throttle"
import { login, type AuthenticationDeps } from "./authentication"
import { confirmTwoFactor, disableTwoFactor, enableTwoFactor, regenerateRecoveryCodes, twoFactorChallenge, type TwoFactorAccount, type TwoFactorDeps } from "./twoFactor"

const USER = "0193a3c2-1111-7000-8000-000000000001"
const ROLE = "0193a3c2-2222-7000-8000-000000000001"
const PASSWORD = "Demo-2026!"
const EMAIL = "docente@silabos.test"
const INVALID = "El código de autenticación no es válido."
const MISSING = "Ingrese un código de autenticación o de recuperación."

let world: AuthWorld
let cleared: string[]

function account(): TwoFactorAccount {
  const row = world.db.twoFactor.find((candidate) => candidate.userId === USER)
  return { id: USER, email: EMAIL, pending: row !== undefined, confirmed: row !== undefined && world.user(USER)?.twoFactorEnabled === true }
}

function deps(overrides: Partial<TwoFactorDeps> = {}): TwoFactorDeps {
  return {
    bridge: world.deps,
    auth: () => world.auth,
    store: { account: async (id) => (id === USER ? account() : null), clearLegacy: async (id) => void cleared.push(id) },
    replay: memoryReplayGuard(),
    throttles: createRateLimiter(),
    attempts: createMemoryAttemptLimiter(() => Math.floor(Date.now() / 1000)),
    verifyPassword: bcryptVerify,
    ...overrides,
  }
}

function loginDeps(): AuthenticationDeps {
  return {
    bridge: world.deps,
    auth: () => world.auth,
    credentials: { findActiveUserByEmail: async (email) => (email === EMAIL && world.user(USER)?.active ? { id: USER } : null), mirrorPassword: async () => undefined },
    profiles: { find: async () => ({ name: "DOCENTE DEMO", email: EMAIL, formation: null, accessibility: null, twoFactorSecret: false, twoFactorConfirmed: false }) },
    today: () => "2026-10-21",
    timezone: () => "America/Guayaquil",
    throttles: createRateLimiter(),
    attempts: createMemoryAttemptLimiter(() => Math.floor(Date.now() / 1000)),
    verifyPassword: bcryptVerify,
    dummyHash: async () => "dummy",
    production: () => false,
  }
}

async function startLogin(): Promise<{ status: number; cookie: string }> {
  const response = await login(browserRequest("/api/v1/authentication/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } }), loginDeps())
  return { status: response.status, cookie: cookieHeaderFrom(response.headers.getSetCookie()) }
}

const json = async (response: Response) => (await response.json()) as { errors: Record<string, string[]>; [key: string]: unknown }
const send = (path: string, method: string, cookie: string, body?: unknown, origin?: string | null) => browserRequest(`/api/v1/authentication/${path}`, { method, cookie, body, origin })

let cookie: string

async function enabled(shared = deps()): Promise<{ secret: string; codes: string[]; cookie: string }> {
  const begin = await enableTwoFactor(send("two-factor", "POST", cookie, { current_password: PASSWORD }), shared)
  expect(begin.status).toBe(200)
  const secret = secretFromUri(await uriOf())
  const confirm = await confirmTwoFactor(send("two-factor/confirm", "POST", cookie, { code: totpCode(secret) }), shared)
  expect(confirm.status).toBe(200)
  cookie = cookieHeaderFrom(confirm.headers.getSetCookie(), cookie)
  return { secret, codes: (await json(confirm)).recovery_codes as string[], cookie }
}

async function uriOf(): Promise<string> {
  const { totpURI } = await world.auth.api.getTOTPURI({ body: { password: PASSWORD }, headers: new Headers({ cookie, origin: "http://localhost:3000" }) })
  return totpURI
}

beforeEach(async () => {
  world = authWorld()
  cleared = []
  await world.addUser({ id: USER, email: EMAIL }, PASSWORD)
  world.assignments.push({ id: ROLE, userId: USER, role: "docente", careerId: "c-1", careerLabel: "Software" })
  const first = await startLogin()
  expect(first.status).toBe(200)
  cookie = first.cookie
})

describe("two-factor setup", () => {
  it("requires the current password to begin", async () => {
    const missing = await enableTwoFactor(send("two-factor", "POST", cookie, {}), deps())
    expect(missing.status).toBe(422)
    expect(await missing.text()).toBe('{"message":"El campo contraseña actual es obligatorio.","errors":{"current_password":["El campo contraseña actual es obligatorio."]}}')
    const wrong = await enableTwoFactor(send("two-factor", "POST", cookie, { current_password: "otra" }), deps())
    expect(await wrong.text()).toBe('{"message":"La contraseña actual no es correcta.","errors":{"current_password":["La contraseña actual no es correcta."]}}')
    expect(world.db.twoFactor).toHaveLength(0)
  })

  it("begins with a QR code, keeps the pending secret when it begins again and cancels with the password alone", async () => {
    const begin = await enableTwoFactor(send("two-factor", "POST", cookie, { current_password: PASSWORD }), deps())
    const body = await json(begin)
    expect(body).toMatchObject({ enabled: false, confirmation_required: true })
    expect(String(body.qr_code_svg)).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" version="1.1" width="\d+" height="\d+"/)
    const firstSecret = world.db.twoFactor[0].secret
    expect(String(firstSecret)).not.toMatch(/^[A-Z2-7]+$/)
    const again = await enableTwoFactor(send("two-factor", "POST", cookie, { current_password: PASSWORD }), deps())
    expect((await json(again)).qr_code_svg).toBe(body.qr_code_svg)
    expect(world.db.twoFactor[0].secret).toBe(firstSecret)
    const cancel = await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: PASSWORD }), deps())
    expect(await cancel.text()).toBe('{"enabled":false,"confirmation_required":false}')
    expect(world.db.twoFactor).toHaveLength(0)
    expect(cleared).toEqual([USER])
  })

  it("confirms with an authenticator code, shows eight recovery codes and keeps the session's role", async () => {
    const { codes } = await enabled()
    expect(codes).toHaveLength(8)
    for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9]{10}-[A-Za-z0-9]{10}$/)
    expect(world.user(USER)?.twoFactorEnabled).toBe(true)
    expect(world.db.session).toHaveLength(1)
    expect(world.db.session[0].activeRoleAssignmentId).toBe(ROLE)
  })

  it("does not confirm with a wrong code or the same code twice", async () => {
    await enableTwoFactor(send("two-factor", "POST", cookie, { current_password: PASSWORD }), deps())
    const wrong = await confirmTwoFactor(send("two-factor/confirm", "POST", cookie, { code: "000000" }), deps())
    expect(wrong.status).toBe(422)
    expect((await json(wrong)).errors.code[0]).toBe(INVALID)
    expect(world.user(USER)?.twoFactorEnabled).toBe(false)
  })

  it("regenerates the recovery codes with the current password, and only once two-factor is active", async () => {
    await enableTwoFactor(send("two-factor", "POST", cookie, { current_password: PASSWORD }), deps())
    const pending = await regenerateRecoveryCodes(send("two-factor/recovery-codes", "POST", cookie, { current_password: PASSWORD }), deps())
    expect(await pending.text()).toBe('{"message":"Active primero la verificación en dos pasos."}')
    const cancel = await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: PASSWORD }), deps())
    cookie = cookieHeaderFrom(cancel.headers.getSetCookie(), cookie)
    const { codes } = await enabled()
    const fresh = await regenerateRecoveryCodes(send("two-factor/recovery-codes", "POST", cookie, { current_password: PASSWORD }), deps())
    const body = await json(fresh)
    expect(body).toMatchObject({ enabled: true, confirmation_required: false })
    expect(body.recovery_codes).toHaveLength(8)
    expect(body.recovery_codes).not.toEqual(codes)
  })
})

describe("POST authentication/two-factor/challenge", () => {
  let secret: string
  let codes: string[]
  let challenge: string

  beforeEach(async () => {
    ;({ secret, codes } = await enabled())
    const started = await startLogin()
    expect(started.status).toBe(202)
    challenge = started.cookie
  })

  it("answers 400 outside the web app", async () => {
    const response = await twoFactorChallenge(send("two-factor/challenge", "POST", challenge, { code: totpCode(secret) }, null), deps())
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('{"message":"Inicie sesión desde la aplicación web."}')
  })

  it("signs the user in with a valid authenticator code and refuses to reuse it", async () => {
    const code = totpCode(secret, 1)
    const shared = deps()
    const before = world.db.session.length
    const response = await twoFactorChallenge(send("two-factor/challenge", "POST", challenge, { code }), shared)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"message":"Segundo factor verificado."}')
    expect(response.headers.getSetCookie().some((header) => header.startsWith("silabos-ueb.session_token="))).toBe(true)
    expect(world.db.session).toHaveLength(before + 1)
    const again = await startLogin()
    const replay = await twoFactorChallenge(send("two-factor/challenge", "POST", again.cookie, { code }), shared)
    expect(replay.status).toBe(422)
    expect(world.db.session).toHaveLength(before + 1)
  })

  it("accepts a recovery code only once", async () => {
    const response = await twoFactorChallenge(send("two-factor/challenge", "POST", challenge, { recovery_code: codes[1] }), deps())
    expect(response.status).toBe(200)
    const again = await startLogin()
    const reused = await twoFactorChallenge(send("two-factor/challenge", "POST", again.cookie, { recovery_code: codes[1] }), deps())
    expect(reused.status).toBe(422)
    expect((await json(reused)).errors.code[0]).toBe(INVALID)
  })

  it("rejects an invalid code, asks for one and refuses a missing challenge", async () => {
    const before = world.db.session.length
    const wrong = await twoFactorChallenge(send("two-factor/challenge", "POST", challenge, { code: "000000" }), deps())
    expect(await wrong.text()).toBe(`{"message":"${INVALID}","errors":{"code":["${INVALID}"]}}`)
    const missing = await twoFactorChallenge(send("two-factor/challenge", "POST", challenge, {}), deps())
    expect((await json(missing)).errors).toEqual({ code: [MISSING] })
    const guest = await twoFactorChallenge(send("two-factor/challenge", "POST", "", { code: totpCode(secret) }), deps())
    expect(guest.status).toBe(422)
    expect(await guest.text()).toBe('{"message":"La sesión de verificación ya no es válida. Ingrese nuevamente."}')
    expect(world.db.session).toHaveLength(before)
  })

  it("limits wrong codes per challenge", async () => {
    const shared = deps()
    for (let attempt = 0; attempt < 5; attempt += 1) await twoFactorChallenge(send("two-factor/challenge", "POST", challenge, { code: "000000" }), shared)
    const locked = await twoFactorChallenge(send("two-factor/challenge", "POST", challenge, { code: totpCode(secret) }), shared)
    expect(locked.status).toBe(429)
    expect(await locked.text()).toBe('{"message":"Demasiados intentos. Intente nuevamente en unos minutos."}')
  })
})

describe("DELETE authentication/two-factor", () => {
  let secret: string
  let codes: string[]

  beforeEach(async () => {
    ;({ secret, codes } = await enabled())
  })

  it("refuses to disable with only the password, a wrong code or a wrong password", async () => {
    const onlyPassword = await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: PASSWORD }), deps())
    expect((await json(onlyPassword)).errors.code[0]).toBe(MISSING)
    const wrong = await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: PASSWORD, code: "000000" }), deps())
    expect((await json(wrong)).errors.code[0]).toBe(INVALID)
    const badPassword = await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: "otra", code: totpCode(secret) }), deps())
    expect(Object.keys((await json(badPassword)).errors)).toEqual(["current_password"])
    expect(world.user(USER)?.twoFactorEnabled).toBe(true)
  })

  it("disables with the password and a valid authenticator code", async () => {
    const response = await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: PASSWORD, code: totpCode(secret, -1) }), deps())
    expect(await response.text()).toBe('{"enabled":false,"confirmation_required":false}')
    expect(world.user(USER)?.twoFactorEnabled).toBe(false)
    expect(world.db.twoFactor).toHaveLength(0)
    expect(world.db.session).toHaveLength(1)
    expect(world.db.session[0].activeRoleAssignmentId).toBe(ROLE)
    expect(response.headers.getSetCookie().some((header) => header.startsWith("silabos-ueb.session_token="))).toBe(true)
  })

  it("disables with an unused recovery code", async () => {
    const response = await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: PASSWORD, recovery_code: codes[0] }), deps())
    expect((await json(response)).enabled).toBe(false)
  })

  it("throttles repeated wrong codes", async () => {
    const shared = deps()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: PASSWORD, code: "000000" }), shared)).status).toBe(422)
    }
    const response = await disableTwoFactor(send("two-factor", "DELETE", cookie, { current_password: PASSWORD, code: totpCode(secret) }), shared)
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"message":"Demasiados intentos. Intente nuevamente en unos minutos."}')
    expect(world.user(USER)?.twoFactorEnabled).toBe(true)
  })
})
