// @vitest-environment node
import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { fakeDeps, NOW, sessionCookie, sessionPayload, xsrfHeader, type FakeWorld } from "../auth/testing"
import type { SessionWriterDeps } from "../auth/sessionWriter"
import type { OutgoingCookie } from "../auth/types"
import { createRateLimiter } from "../http/throttle"
import type { QueuedMail } from "../mail/mailables"
import { activateAccount, resetPassword, sendResetLink, type Invitation, type RecoveryDeps, type RecoveryStore } from "./passwordRecovery"

const USER = golden.userId
const EMAIL = "docente@silabos.test"
const TOKEN = "token-de-restablecimiento"
const RESET_OK = '{"message":"Contraseña restablecida. Ya puede iniciar sesión."}'
const INVALID_LINK = "El enlace para restablecer la contraseña no es válido o ya venció."

type Account = { id: string; email: string; passwordHash: string; remember: string | null; active: boolean; verifiedAt: number | null }

let world: FakeWorld
let accounts: Account[]
let resets: Map<string, { token: string; createdAt: number | null }>
let invitations: Invitation[]
let sessions: { id: string; userId: string }[]
let queued: OutgoingCookie[]
let sequence: number
let mails: QueuedMail[]

function store(): RecoveryStore {
  const find = (id: string) => accounts.find((account) => account.id === id)
  return {
    userByEmail: async (email) => {
      const account = accounts.find((candidate) => candidate.email === email)
      return account ? { id: account.id, email: account.email } : null
    },
    resetToken: async (email) => resets.get(email) ?? null,
    deleteResetTokens: async (email) => void resets.delete(email),
    insertResetToken: async (email, token, at) => void resets.set(email, { token, createdAt: at }),
    setPassword: async (id, hash) => void Object.assign(find(id) ?? {}, { passwordHash: hash }),
    setRememberToken: async (id, token) => void Object.assign(find(id) ?? {}, { remember: token }),
    deleteSessions: async (userId) => {
      const before = sessions.length
      sessions = sessions.filter((session) => session.userId !== userId)
      return before - sessions.length
    },
    lockInvitation: async (hash) => invitations.find((invitation) => invitation.hash === hash) ?? null,
    lockUser: async (id) => {
      const account = find(id)
      return account ? { id: account.id, active: account.active, verified: account.verifiedAt !== null } : null
    },
    activate: async (id, hash, at) => void Object.assign(find(id) ?? {}, { passwordHash: hash, verifiedAt: at }),
    useInvitation: async (id, at) => void Object.assign(invitations.find((invitation) => invitation.id === id) ?? {}, { usedAt: at }),
    invalidateOtherInvitations: async (userId, exceptId, at) => {
      for (const invitation of invitations) {
        if (invitation.userId === userId && invitation.id !== exceptId && invitation.usedAt === null && invitation.invalidatedAt === null) invitation.invalidatedAt = at
      }
    },
  }
}

function deps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps {
  const writer: SessionWriterDeps = {
    ...fakeDeps(world),
    queueCookies: async (cookies) => void queued.push(...cookies),
    cookie: { path: "/", domain: null, secure: false, sameSite: "lax" },
    random: (length) => String.fromCharCode(65 + (sequence++ % 26)).repeat(length),
    lottery: () => false,
  }
  return {
    writer,
    store: { direct: (work) => work(store()), transaction: (work) => work(store()) },
    throttles: createRateLimiter(),
    verifyHash: async (plain, hash) => hash === `hash:${plain}`,
    hashPassword: async (plain) => `hash:${plain}`,
    timebox: (work) => work(() => undefined),
    production: () => false,
    sendMail: async (mail) => void mails.push(mail),
    ...overrides,
  }
}

function post(path: string, body: unknown, stateful = true, contentType = "application/json"): Request {
  return new Request(`http://localhost:3000/api/v1/authentication/${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": contentType,
      "x-forwarded-for": "203.0.113.5",
      ...(stateful
        ? {
            referer: "http://localhost:3000/restablecer-contrasena",
            cookie: `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`,
            "x-xsrf-token": xsrfHeader(golden.csrfToken),
          }
        : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const resetBody = (overrides: Record<string, unknown> = {}) => ({ email: EMAIL, token: TOKEN, password: "Josue123456*", password_confirmation: "Josue123456*", ...overrides })

beforeEach(() => {
  world = { sessions: new Map([[golden.sessionId, { payload: sessionPayload({ _token: golden.csrfToken }), lastActivity: NOW - 60 }]]), users: [], assignments: [] }
  accounts = [{ id: USER, email: EMAIL, passwordHash: "hash:vieja", remember: "recordarme-viejo", active: true, verifiedAt: NOW - 86400 }]
  resets = new Map([[EMAIL, { token: `hash:${TOKEN}`, createdAt: NOW - 600 }]])
  invitations = []
  sessions = [
    { id: "sesion-actual", userId: USER },
    { id: "otra-sesion", userId: USER },
    { id: "ajena", userId: "otro" },
  ]
  queued = []
  sequence = 0
  mails = []
})

describe("POST authentication/password-reset (PasswordResetTest)", () => {
  it("sets the new password, deletes the token, rotates the remember token and closes every session", async () => {
    const response = await resetPassword(post("password-reset", resetBody({ email: "Docente@Silabos.test" })), deps())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(RESET_OK)
    expect(accounts[0].passwordHash).toBe("hash:Josue123456*")
    expect(accounts[0].remember).toMatch(/^[A-Z]{60}$/)
    expect(accounts[0].remember).not.toBe("recordarme-viejo")
    expect(resets.has(EMAIL)).toBe(false)
    expect(sessions.map((session) => session.id)).toEqual(["ajena"])
    expect(response.headers.get("x-ratelimit-limit")).toBe("3")
    expect(response.headers.get("x-ratelimit-remaining")).toBe("2")
    expect(queued.map((cookie) => cookie.name)).toEqual([])
    expect(response.headers.getSetCookie().map((header) => header.slice(0, header.indexOf("=")))).toEqual(["XSRF-TOKEN", golden.cookieName])
  })

  it("answers the same 422 for an unknown account, a wrong token and an expired one", async () => {
    const expected = `{"message":"${INVALID_LINK}","errors":{"email":["${INVALID_LINK}"]}}`
    for (const body of [resetBody({ email: "nadie@silabos.test" }), resetBody({ token: "otro" })]) {
      const response = await resetPassword(post("password-reset", body), deps())
      expect(response.status).toBe(422)
      expect(await response.text()).toBe(expected)
    }
    resets.set(EMAIL, { token: `hash:${TOKEN}`, createdAt: NOW - 3601 })
    const expired = await resetPassword(post("password-reset", resetBody()), deps())
    expect(await expired.text()).toBe(expected)
    expect(accounts[0].passwordHash).toBe("hash:vieja")
    expect(sessions).toHaveLength(3)
  })

  it("validates like ResetForgottenPasswordRequest", async () => {
    const empty = await resetPassword(post("password-reset", {}), deps())
    expect(empty.status).toBe(422)
    expect(await empty.text()).toBe(
      '{"message":"El campo correo electrónico es obligatorio. (y 2 errores más)","errors":{"email":["El campo correo electrónico es obligatorio."],"token":["El campo enlace de activación es obligatorio."],"password":["El campo contraseña es obligatorio."]}}',
    )
    const weak = await resetPassword(post("password-reset", resetBody({ email: "no-es-correo", password: "corta", password_confirmation: "otra" })), deps())
    expect((await weak.json()).errors).toEqual({
      email: ["El campo correo electrónico debe ser un correo electrónico válido."],
      password: ["El campo contraseña debe tener al menos 8 caracteres.", "La confirmación de contraseña no coincide."],
    })
  })

  it("allows three attempts a minute per address and IP", async () => {
    const shared = deps()
    for (let attempt = 0; attempt < 3; attempt++) expect((await resetPassword(post("password-reset", resetBody({ token: "otro" })), shared)).status).toBe(422)
    const response = await resetPassword(post("password-reset", resetBody()), shared)
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('{"message":"Too Many Attempts."}')
  })

  it("serves a request from outside the SPA without session cookies", async () => {
    const response = await resetPassword(post("password-reset", resetBody(), false), deps())
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toEqual([])
  })
})

describe("POST authentication/account-activation (ManagedUserTest)", () => {
  const RAW = "a".repeat(64)
  const hashOf = (token: string) => createHash("sha256").update(token).digest("hex")
  const activation = (overrides: Record<string, unknown> = {}) => ({ token: RAW, password: "Nueva-clave-2026!", password_confirmation: "Nueva-clave-2026!", ...overrides })
  const invitation = (overrides: Partial<Invitation> = {}): Invitation => ({ id: "inv-1", userId: USER, hash: hashOf(RAW), expiresAt: NOW + 3600, usedAt: null, invalidatedAt: null, ...overrides })

  beforeEach(() => {
    accounts[0].verifiedAt = null
    invitations = [invitation(), invitation({ id: "inv-0", hash: hashOf("vieja") })]
  })

  it("sets the password, verifies the email, uses the invitation, closes sessions", async () => {
    const response = await activateAccount(post("account-activation", activation()), deps())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"message":"Cuenta activada. Ya puede iniciar sesión."}')
    expect(accounts[0]).toMatchObject({ passwordHash: "hash:Nueva-clave-2026!", verifiedAt: NOW })
    expect(accounts[0].remember).toMatch(/^[A-Z]{60}$/)
    expect(invitations).toMatchObject([{ id: "inv-1", usedAt: NOW, invalidatedAt: null }, { id: "inv-0", usedAt: null, invalidatedAt: NOW }])
    expect(sessions.map((session) => session.id)).toEqual(["ajena"])
  })

  it("refuses an expired, used or invalidated invitation", async () => {
    for (const changes of [{ expiresAt: NOW - 1 }, { usedAt: NOW - 60 }, { invalidatedAt: NOW - 60 }]) {
      invitations = [invitation(changes)]
      const response = await activateAccount(post("account-activation", activation()), deps())
      expect(response.status).toBe(422)
      expect(await response.text()).toBe('{"message":"El enlace de activación no es válido o ya venció.","errors":{"token":["El enlace de activación no es válido o ya venció."]}}')
    }
    expect(accounts[0].verifiedAt).toBeNull()
  })

  it("refuses an account already activated or deactivated", async () => {
    for (const changes of [{ verifiedAt: NOW - 60 }, { active: false }]) {
      Object.assign(accounts[0], { verifiedAt: null, active: true }, changes)
      const response = await activateAccount(post("account-activation", activation()), deps())
      expect(response.status).toBe(422)
      expect((await response.json()).errors.token).toEqual(["El enlace de activación no es válido o ya fue utilizado."])
    }
  })

  it("validates the token length and the confirmation", async () => {
    const response = await activateAccount(post("account-activation", activation({ token: "x".repeat(129), password_confirmation: "otra" })), deps())
    expect(response.status).toBe(422)
    expect((await response.json()).errors).toEqual({
      token: ["El campo enlace de activación no debe tener más de 128 caracteres."],
      password: ["La confirmación de contraseña no coincide."],
    })
  })
})

describe("POST authentication/password-recovery (PasswordRecoveryTest)", () => {
  const SENT = '{"message":"Si el correo pertenece a una cuenta activa, recibirá un enlace para restablecer su contraseña."}'

  it("replaces the token, stores its hash and sends the reset mail right away", async () => {
    resets.set(EMAIL, { token: "hash:viejo", createdAt: NOW - 61 })
    const response = await sendResetLink(post("password-recovery", { email: "  Docente@Silabos.TEST " }), deps())
    expect(response.status).toBe(202)
    expect(await response.text()).toBe(SENT)
    expect(response.headers.get("x-ratelimit-limit")).toBe("3")
    expect(response.headers.get("x-ratelimit-remaining")).toBe("2")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(mails).toHaveLength(1)
    const mail = mails[0]
    expect(mail.mailable).toBe("resetPassword")
    expect(mail.to).toBe(EMAIL)
    expect(mail.data).toEqual({ token: expect.stringMatching(/^[0-9a-f]{64}$/), email: EMAIL, expireMinutes: 60 })
    expect(resets.get(EMAIL)).toEqual({ token: `hash:${(mail.data as { token: string }).token}`, createdAt: NOW })
  })

  it("answers the same 202 without a mail for an unknown address or a token created less than a minute ago", async () => {
    for (const email of ["nadie@silabos.test", EMAIL]) {
      resets.set(EMAIL, { token: "hash:reciente", createdAt: NOW - 59 })
      const response = await sendResetLink(post("password-recovery", { email }), deps())
      expect(response.status).toBe(202)
      expect(await response.text()).toBe(SENT)
    }
    expect(mails).toEqual([])
    expect(resets.get(EMAIL)).toEqual({ token: "hash:reciente", createdAt: NOW - 59 })
  })

  it("validates like SendPasswordResetLinkRequest", async () => {
    const cases: [unknown, string][] = [
      [{}, '{"message":"El campo correo electrónico es obligatorio.","errors":{"email":["El campo correo electrónico es obligatorio."]}}'],
      [
        { email: 123 },
        '{"message":"El campo correo electrónico debe ser una cadena de texto. (y 1 error más)","errors":{"email":["El campo correo electrónico debe ser una cadena de texto.","El campo correo electrónico debe ser un correo electrónico válido."]}}',
      ],
      [{ email: "ana@localhost" }, '{"message":"El campo correo electrónico debe ser un correo electrónico válido.","errors":{"email":["El campo correo electrónico debe ser un correo electrónico válido."]}}'],
    ]
    for (const [body, expected] of cases) {
      const response = await sendResetLink(post("password-recovery", body), deps())
      expect(response.status).toBe(422)
      expect(await response.text()).toBe(expected)
    }
    expect(mails).toEqual([])
  })

  it("fails like Laravel's limiter when the address is an array", async () => {
    const response = await sendResetLink(post("password-recovery", { email: ["a@b.ec"] }), deps())
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('{"message":"Server Error"}')
    expect(response.headers.get("x-ratelimit-limit")).toBeNull()
  })

  it("reads a form body like PHP and the query string when the body is not a form", async () => {
    const form = await sendResetLink(post("password-recovery", "email=docente%40silabos.test", true, "application/x-www-form-urlencoded"), deps())
    expect(form.status).toBe(202)
    expect(mails.map((mail) => mail.to)).toEqual([EMAIL])
    const text = await sendResetLink(post("password-recovery", "email=x", true, "text/plain"), deps())
    expect(text.status).toBe(422)
  })

  it("allows three requests a minute per address and IP, and ten a day per address", async () => {
    const limiter = createRateLimiter()
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await sendResetLink(post("password-recovery", { email: "nadie@silabos.test" }), deps({ throttles: limiter }))).status).toBe(202)
    const limited = await sendResetLink(post("password-recovery", { email: "nadie@silabos.test" }), deps({ throttles: limiter }))
    expect(limited.status).toBe(429)
    expect(limited.headers.get("x-ratelimit-limit")).toBe("3")
    const daily = createRateLimiter()
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const request = post("password-recovery", { email: "nadie@silabos.test" })
      request.headers.set("x-forwarded-for", `203.0.113.${attempt + 10}`)
      const response = await sendResetLink(request, deps({ throttles: daily }))
      expect(response.status).toBe(202)
      if (attempt === 9) expect([response.headers.get("x-ratelimit-limit"), response.headers.get("x-ratelimit-remaining")]).toEqual(["10", "0"])
    }
    const blocked = post("password-recovery", { email: "nadie@silabos.test" })
    blocked.headers.set("x-forwarded-for", "203.0.113.99")
    const response = await sendResetLink(blocked, deps({ throttles: daily }))
    expect(response.status).toBe(429)
    expect(response.headers.get("x-ratelimit-limit")).toBe("10")
  })

  it("serves a request from outside the SPA without session cookies", async () => {
    const response = await sendResetLink(post("password-recovery", { email: EMAIL }, false), deps())
    expect(response.status).toBe(202)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(mails).toHaveLength(1)
  })
})
