// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { createMemoryAttemptLimiter } from "../auth/attemptLimiter"
import { fakeDeps, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, storedJson, testKey, xsrfHeader, type FakeWorld } from "../auth/testing"
import type { SessionWriterDeps } from "../auth/sessionWriter"
import { totpCode, totpCounter, type TotpReplayCache } from "../auth/totp"
import type { OutgoingCookie } from "../auth/types"
import { decrypt, encrypt } from "../http/encrypter"
import { hashPasswordForCookie, loginSessionKey } from "../http/sessionGuard"
import { createRateLimiter } from "../http/throttle"
import {
  confirmTwoFactor,
  disableTwoFactor,
  enableTwoFactor,
  regenerateRecoveryCodes,
  twoFactorChallenge,
  type TwoFactorAccount,
  type TwoFactorDeps,
} from "./twoFactor"

const PASSWORD = "password"
const HASH = `hash:${PASSWORD}`
const SECRET = "JBSWY3DPEHPK3PXP"
const LOGIN_KEY = loginSessionKey()
const TOKEN = golden.csrfToken
const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const INVALID = "El código de autenticación no es válido."
const MISSING = "Ingrese un código de autenticación o de recuperación."

let world: FakeWorld
let accounts: Map<string, TwoFactorAccount>
let replay: Map<string, number>
let queued: OutgoingCookie[]
let sequence: number

const sealed = (value: string) => encrypt(value, testKey, true)
const opened = (value: string | null) => (value === null ? null : decrypt(value, testKey, true))

function account(overrides: Partial<TwoFactorAccount> = {}): TwoFactorAccount {
  return { id: golden.userId, email: "docente@silabos.test", secret: null, recoveryCodes: null, confirmed: false, ...overrides }
}

function enabledAccount(codes: string[] = ["recovery-code-1", "recovery-code-2"]): TwoFactorAccount {
  return account({ secret: sealed(SECRET), recoveryCodes: sealed(JSON.stringify(codes)), confirmed: true })
}

function deps(): TwoFactorDeps {
  const writer: SessionWriterDeps = {
    ...fakeDeps(world),
    queueCookies: async (cookies) => void queued.push(...cookies),
    cookie: { path: "/", domain: null, secure: false, sameSite: "lax" },
    random: (length) => String.fromCharCode(65 + (sequence++ % 26)).repeat(length),
    lottery: () => false,
  }
  const cache: TotpReplayCache = {
    get: async (key) => replay.get(key) ?? null,
    put: async (key, value) => void replay.set(key, value),
  }
  return {
    writer,
    store: {
      account: async (id, activeOnly) => {
        const found = accounts.get(id)
        const user = world.users.find((candidate) => candidate.id === id)
        return found && (!activeOnly || user?.active) ? { ...found } : null
      },
      update: async (id, changes) => {
        const current = accounts.get(id)
        if (!current) return
        accounts.set(id, {
          ...current,
          ...(changes.secret === undefined ? {} : { secret: changes.secret }),
          ...(changes.recoveryCodes === undefined ? {} : { recoveryCodes: changes.recoveryCodes }),
          ...(changes.confirmedAt === undefined ? {} : { confirmed: changes.confirmedAt !== null }),
        })
      },
    },
    replay: cache,
    throttles: createRateLimiter(),
    attempts: createMemoryAttemptLimiter(() => NOW),
    verifyPassword: async (plain, hash) => hash === `hash:${plain}`,
    appName: () => "Sílabos UEB",
    production: () => false,
  }
}

function call(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000/api/v1/authentication/${path}`, {
    method,
    headers: {
      accept: "application/json",
      referer: "http://localhost:3000/perfil/seguridad",
      cookie: COOKIE,
      "x-xsrf-token": xsrfHeader(TOKEN),
      "x-forwarded-for": "203.0.113.5",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function withSession(attributes: Record<string, unknown>): void {
  world.sessions.set(golden.sessionId, { payload: sessionPayload(attributes), lastActivity: NOW - 60, userId: (attributes[LOGIN_KEY] as string) ?? null })
}

const loggedIn = () => ({ _token: TOKEN, [LOGIN_KEY]: golden.userId, active_role_assignment_id: golden.roleId, password_hash_web: hashPasswordForCookie(HASH, golden.appKey) })
const pendingChallenge = (at: number = NOW - 30) => ({ _token: TOKEN, login: { id: golden.userId, at } })
const current = () => totpCode(SECRET, totpCounter(NOW))
const json = async (response: Response) => JSON.parse(await response.text())
const enabled = () => {
  const stored = accounts.get(golden.userId)!
  return stored.secret !== null && stored.confirmed
}

beforeEach(() => {
  world = { sessions: new Map(), users: [makeUser({ passwordHash: HASH })], assignments: [makeAssignment()] }
  accounts = new Map([[golden.userId, account()]])
  replay = new Map()
  queued = []
  sequence = 0
})

describe("DELETE authentication/two-factor (DisableTwoFactorTest)", () => {
  beforeEach(() => {
    accounts.set(golden.userId, enabledAccount())
    withSession(loggedIn())
  })

  it("refuses to disable an active two-factor with only the password", async () => {
    const response = await disableTwoFactor(call("two-factor", "DELETE", { current_password: PASSWORD }), deps())
    expect(response.status).toBe(422)
    expect((await json(response)).errors.code[0]).toBe(MISSING)
    expect(enabled()).toBe(true)
  })

  it("refuses a wrong authenticator or recovery code", async () => {
    for (const body of [{ code: "000000" }, { recovery_code: "no-existe" }]) {
      const response = await disableTwoFactor(call("two-factor", "DELETE", { current_password: PASSWORD, ...body }), deps())
      expect(response.status).toBe(422)
      expect((await json(response)).errors.code[0]).toBe(INVALID)
    }
    expect(enabled()).toBe(true)
  })

  it("refuses a valid code with a wrong password", async () => {
    const response = await disableTwoFactor(call("two-factor", "DELETE", { current_password: "incorrecta", code: current() }), deps())
    expect(response.status).toBe(422)
    expect(Object.keys((await json(response)).errors)).toEqual(["current_password"])
    expect(enabled()).toBe(true)
  })

  it("disables two-factor with the password and a valid authenticator code", async () => {
    const response = await disableTwoFactor(call("two-factor", "DELETE", { current_password: PASSWORD, code: current() }), deps())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"enabled":false,"confirmation_required":false}')
    expect(accounts.get(golden.userId)).toMatchObject({ secret: null, recoveryCodes: null, confirmed: false })
  })

  it("disables two-factor with an unused recovery code", async () => {
    const response = await disableTwoFactor(call("two-factor", "DELETE", { current_password: PASSWORD, recovery_code: "recovery-code-1" }), deps())
    expect(response.status).toBe(200)
    expect((await json(response)).enabled).toBe(false)
    expect(accounts.get(golden.userId)?.recoveryCodes).toBeNull()
  })

  it("throttles repeated wrong codes", async () => {
    const shared = deps()
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await disableTwoFactor(call("two-factor", "DELETE", { current_password: PASSWORD, code: "000000" }), shared)).status).toBe(422)
    }
    const response = await disableTwoFactor(call("two-factor", "DELETE", { current_password: PASSWORD, code: current() }), shared)
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"message":"Demasiados intentos. Intente nuevamente en unos minutos."}')
    expect(enabled()).toBe(true)
  })
})

describe("two-factor setup (ApiSessionTest, SecurityHardeningTest)", () => {
  beforeEach(() => withSession(loggedIn()))

  it("requires the current password to begin and to remove the setup", async () => {
    const missing = await enableTwoFactor(call("two-factor", "POST", {}), deps())
    expect(missing.status).toBe(422)
    expect(await missing.text()).toBe('{"message":"El campo contrase\\u00f1a actual es obligatorio.","errors":{"current_password":["El campo contrase\\u00f1a actual es obligatorio."]}}')
    const wrong = await disableTwoFactor(call("two-factor", "DELETE", { current_password: "incorrecta" }), deps())
    expect(wrong.status).toBe(422)
    expect(await wrong.text()).toBe('{"message":"La contrase\\u00f1a actual no es correcta.","errors":{"current_password":["La contrase\\u00f1a actual no es correcta."]}}')
  })

  it("begins the setup with a QR code and cancels it with the password alone", async () => {
    const response = await enableTwoFactor(call("two-factor", "POST", { current_password: PASSWORD }), deps())
    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body).toMatchObject({ enabled: false, confirmation_required: true })
    expect(body.qr_code_svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" version="1.1" width="192" height="192"/)
    const stored = accounts.get(golden.userId)!
    expect(opened(stored.secret)).toMatch(/^[A-Z2-7]{16}$/)
    expect(JSON.parse(opened(stored.recoveryCodes) ?? "[]")).toHaveLength(8)
    for (const code of JSON.parse(opened(stored.recoveryCodes) ?? "[]")) expect(code).toMatch(/^[A-Za-z0-9]{10}-[A-Za-z0-9]{10}$/)
    const cancel = await disableTwoFactor(call("two-factor", "DELETE", { current_password: PASSWORD }), deps())
    expect(cancel.status).toBe(200)
    expect(await cancel.text()).toBe('{"enabled":false,"confirmation_required":false}')
    expect(accounts.get(golden.userId)).toMatchObject({ secret: null, recoveryCodes: null, confirmed: false })
  })

  it("keeps a pending secret when the setup begins again", async () => {
    accounts.set(golden.userId, account({ secret: sealed(SECRET), recoveryCodes: sealed('["a-b"]') }))
    const response = await enableTwoFactor(call("two-factor", "POST", { current_password: PASSWORD }), deps())
    expect(opened(accounts.get(golden.userId)!.secret)).toBe(SECRET)
    expect((await json(response)).qr_code_svg).toBe((await import("./twoFactorQr")).twoFactorQrCodeSvg("Sílabos UEB", "docente@silabos.test", SECRET))
  })

  it("confirms the setup with a code from the authenticator and shows the recovery codes", async () => {
    accounts.set(golden.userId, account({ secret: sealed(SECRET), recoveryCodes: sealed(JSON.stringify(["c-1", "c-2"])) }))
    const response = await confirmTwoFactor(call("two-factor/confirm", "POST", { code: current() }), deps())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"enabled":true,"confirmation_required":false,"recovery_codes":["c-1","c-2"]}')
    expect(enabled()).toBe(true)
  })

  it("does not confirm the setup with a wrong code", async () => {
    accounts.set(golden.userId, account({ secret: sealed(SECRET), recoveryCodes: sealed("[]") }))
    for (const code of ["000000", "0"]) {
      const response = await confirmTwoFactor(call("two-factor/confirm", "POST", { code }), deps())
      expect(response.status).toBe(422)
      expect((await json(response)).errors.code[0]).toBe(INVALID)
    }
    expect(enabled()).toBe(false)
  })

  it("regenerates the recovery codes with the current password, and only once two-factor is active", async () => {
    accounts.set(golden.userId, account({ secret: sealed(SECRET), recoveryCodes: sealed('["a-b"]') }))
    const pending = await regenerateRecoveryCodes(call("two-factor/recovery-codes", "POST", { current_password: PASSWORD }), deps())
    expect(pending.status).toBe(422)
    expect(await pending.text()).toBe('{\n    "message": "Active primero la verificaci\\u00f3n en dos pasos."\n}')
    accounts.set(golden.userId, enabledAccount())
    const response = await regenerateRecoveryCodes(call("two-factor/recovery-codes", "POST", { current_password: PASSWORD }), deps())
    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body.recovery_codes).toHaveLength(8)
    expect(body.recovery_codes).toEqual(JSON.parse(opened(accounts.get(golden.userId)!.recoveryCodes) ?? "[]"))
    expect(body.recovery_codes).not.toContain("recovery-code-1")
  })

  it("refreshes the session cookies like every authenticated answer", async () => {
    await enableTwoFactor(call("two-factor", "POST", {}), deps())
    expect(queued.map((cookie) => cookie.name)).toEqual(["XSRF-TOKEN", golden.cookieName])
  })
})

describe("POST authentication/two-factor/challenge (ApiSessionTest)", () => {
  beforeEach(() => {
    accounts.set(golden.userId, enabledAccount())
    withSession(pendingChallenge())
  })

  it("answers 400 outside the web app", async () => {
    const response = await twoFactorChallenge(new Request("http://localhost:3000/api/v1/authentication/two-factor/challenge", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    }), deps())
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('{"message":"Inicie sesi\\u00f3n desde la aplicaci\\u00f3n web."}')
  })

  it("logs the user in with a valid authenticator code", async () => {
    const response = await twoFactorChallenge(call("two-factor/challenge", "POST", { code: current() }), deps())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"message":"Segundo factor verificado."}')
    const [id] = [...world.sessions.keys()].filter((key) => key !== golden.sessionId)
    expect(world.sessions.has(golden.sessionId)).toBe(false)
    const stored = JSON.parse(storedJson(world, id) ?? "{}")
    expect(stored[LOGIN_KEY]).toBe(golden.userId)
    expect(stored.login).toEqual([])
  })

  it("accepts a recovery code only once and replaces it", async () => {
    const response = await twoFactorChallenge(call("two-factor/challenge", "POST", { recovery_code: "recovery-code-1" }), deps())
    expect(response.status).toBe(200)
    const codes = JSON.parse(opened(accounts.get(golden.userId)!.recoveryCodes) ?? "[]")
    expect(codes).not.toContain("recovery-code-1")
    expect(codes[1]).toBe("recovery-code-2")
    expect(codes[0]).toMatch(/^[A-Za-z0-9]{10}-[A-Za-z0-9]{10}$/)
  })

  it("rejects an invalid code and keeps the user as a guest", async () => {
    const response = await twoFactorChallenge(call("two-factor/challenge", "POST", { code: "000000" }), deps())
    expect(response.status).toBe(422)
    expect(await response.text()).toBe(`{"message":"El c\\u00f3digo de autenticaci\\u00f3n no es v\\u00e1lido.","errors":{"code":["El c\\u00f3digo de autenticaci\\u00f3n no es v\\u00e1lido."]}}`)
    expect(JSON.parse(storedJson(world, golden.sessionId) ?? "{}")).not.toHaveProperty(LOGIN_KEY)
  })

  it("asks for a code or a recovery code", async () => {
    const response = await twoFactorChallenge(call("two-factor/challenge", "POST", {}), deps())
    expect(response.status).toBe(422)
    expect((await json(response)).errors).toEqual({ code: [MISSING] })
  })

  it("forgets a verification older than ten minutes", async () => {
    withSession(pendingChallenge(NOW - 601))
    const response = await twoFactorChallenge(call("two-factor/challenge", "POST", { code: current() }), deps())
    expect(response.status).toBe(422)
    expect(await response.text()).toBe('{"message":"La sesi\\u00f3n de verificaci\\u00f3n ya no es v\\u00e1lida. Ingrese nuevamente."}')
    expect(JSON.parse(storedJson(world, golden.sessionId) ?? "{}").login).toEqual([])
  })

  it("limits five wrong codes per account", async () => {
    const shared = deps()
    for (let attempt = 0; attempt < 5; attempt++) expect((await twoFactorChallenge(call("two-factor/challenge", "POST", { code: "000000" }), shared)).status).toBe(422)
    const response = await twoFactorChallenge(call("two-factor/challenge", "POST", { code: current() }), shared)
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"message":"Demasiados intentos. Intente nuevamente en unos minutos."}')
  })
})
