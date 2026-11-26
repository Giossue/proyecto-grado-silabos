// @vitest-environment node
import { createHash } from "node:crypto"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { createMemoryAttemptLimiter, type AttemptLimiter } from "../../server/auth/attemptLimiter"
import { authWorld, type AuthWorld } from "../../server/auth/betterAuthTesting"
import { bcryptHash, bcryptVerify } from "../../server/auth/bcrypt"
import { runtimeOf } from "../../server/auth/runtime"
import { NOW } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { unmatchedRoute } from "../../server/http/router"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { leaveActiveRole, login, logout, selectActiveRole, type AuthenticationDeps, type CredentialStore } from "../../server/identity/authentication"
import { activateAccount, resetPassword, sendResetLink, type Invitation, type RecoveryDeps, type RecoveryRepository, type RecoveryStore } from "../../server/identity/passwordRecovery"
import { showSession, type ProfileRepository, type SessionDeps } from "../../server/identity/session"
import type { QueuedMail } from "../../server/mail/mailables"
import { FallbackModule } from "../fallback/fallback.module"
import { AuthModule } from "./auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "./auth.tokens"
import { contentHeaders, cookieHeader, jarWith, live, nestRaw, normalizedCookie, rawOf, served, webRequest, type Call, type Raw } from "./identity-equivalence.testing"
import { IDENTITY_RUNTIME, type IdentityRuntime } from "./identity.runtime"
import { ACCOUNT_REPOSITORY, CREDENTIAL_STORE, PROFILE_REPOSITORY, RECOVERY_REPOSITORY } from "./identity.tokens"

const USER = "0193a3c2-1111-7000-8000-000000000001"
const UNVERIFIED = "0193a3c2-1111-7000-8000-000000000002"
const INACTIVE = "0193a3c2-1111-7000-8000-000000000003"
const ROLE = "0193a3c2-2222-7000-8000-000000000001"
const OTHER_ROLE = "0193a3c2-2222-7000-8000-000000000002"
const UNVERIFIED_ROLE = "0193a3c2-2222-7000-8000-000000000003"
const PASSWORD = "Demo-2026!"
const NEW_PASSWORD = "Otra-clave-2027!"
const EMAIL = "docente@silabos.test"
const UNVERIFIED_EMAIL = "pendiente@silabos.test"
const INACTIVE_EMAIL = "inactivo@silabos.test"
const ACTIVATION_TOKEN = "token-de-activacion"
const IP = "203.0.113.5"
const ORIGIN = "http://localhost:3000"

type State = {
  world: AuthWorld
  bridge: BridgeDeps
  limiter: RateLimiter
  attempts: AttemptLimiter
  runtime: IdentityRuntime
  profiles: ProfileRepository
  credentials: CredentialStore
  recovery: RecoveryRepository
  passwords: Record<string, string>
  resets: Map<string, { token: string; createdAt: number | null }>
  invitations: Invitation[]
  mails: QueuedMail[]
}

type Step = Call & { origin?: string | null }

type Answer = { status: number; body: string; headers: Record<string, string | null>; cookies: string[]; writes: unknown }

async function freshState(): Promise<State> {
  const world = authWorld()
  await world.addUser({ id: USER, email: EMAIL }, PASSWORD)
  await world.addUser({ id: UNVERIFIED, email: UNVERIFIED_EMAIL, emailVerified: false }, PASSWORD)
  await world.addUser({ id: INACTIVE, email: INACTIVE_EMAIL, active: false }, PASSWORD)
  world.assignments.push(
    { id: ROLE, userId: USER, role: "docente", careerId: "c-1", careerLabel: "Software" },
    { id: OTHER_ROLE, userId: USER, role: "coordinador", careerId: "c-2", careerLabel: "Derecho" },
    { id: UNVERIFIED_ROLE, userId: UNVERIFIED, role: "docente", careerId: "c-1", careerLabel: "Software" },
  )
  const state = {
    world,
    bridge: { store: world.deps.store, sessions: world.deps.sessions, config: world.deps.config, now: () => NOW },
    limiter: createRateLimiter(),
    attempts: createMemoryAttemptLimiter(() => NOW),
    passwords: {},
    resets: new Map(),
    invitations: [{ id: "inv-1", userId: UNVERIFIED, hash: createHash("sha256").update(ACTIVATION_TOKEN).digest("hex"), expiresAt: NOW + 3600, usedAt: null, invalidatedAt: null }],
    mails: [],
  } as unknown as State
  const user = (id: string) => world.db.user.find((row) => row.id === id)
  state.profiles = {
    async find(id) {
      const row = user(id)
      if (!row) return null
      return { name: String(row.name), email: String(row.email) }
    },
  }
  state.credentials = {
    findActiveUserByEmail: async (email) => {
      const row = world.db.user.find((candidate) => candidate.email === email && candidate.active === true)
      return row ? { id: String(row.id) } : null
    },
  }
  const store: RecoveryStore = {
    userByEmail: async (email) => {
      const row = world.db.user.find((candidate) => candidate.email === email)
      return row ? { id: String(row.id), email: String(row.email) } : null
    },
    resetToken: async (email) => state.resets.get(email) ?? null,
    deleteResetTokens: async (email) => void state.resets.delete(email),
    insertResetToken: async (email, token, at) => void state.resets.set(email, { token, createdAt: at }),
    setPassword: async (id, hash) => void (state.passwords[id] = hash),
    deleteSessions: async (id) => {
      const before = world.db.session.length
      world.db.session = world.db.session.filter((row) => row.userId !== id)
      return before - world.db.session.length
    },
    lockInvitation: async (hash) => state.invitations.find((invitation) => invitation.hash === hash) ?? null,
    lockUser: async (id) => {
      const row = user(id)
      return row ? { id, active: row.active === true, verified: row.emailVerified === true } : null
    },
    activate: async (id, hash) => {
      state.passwords[id] = hash
      Object.assign(user(id) ?? {}, { emailVerified: true })
    },
    useInvitation: async (id, at) => void Object.assign(state.invitations.find((invitation) => invitation.id === id) ?? {}, { usedAt: at }),
    invalidateOtherInvitations: async (id, exceptId, at) => {
      for (const invitation of state.invitations) if (invitation.userId === id && invitation.id !== exceptId && invitation.usedAt === null) invitation.invalidatedAt = at
    },
  }
  state.recovery = { direct: (work) => work(store), transaction: (work) => work(store) }
  state.runtime = {
    auth: () => world.auth,
    attempts: state.attempts,
    verifyPassword: bcryptVerify,
    hashPassword: (plain) => bcryptHash(plain, 4),
    dummyHash: async () => "$2y$04$abcdefghijklmnopqrstuuJ0b0qz6bV1qz6bV1qz6bV1qz6bV1qz6",
    production: () => false,
    today: () => "2026-10-21",
    timezone: () => "America/Guayaquil",
    timebox: (work) => work(() => undefined),
    sendMail: async (mail) => void state.mails.push(mail),
    services: { random: (length) => "a".repeat(length), hashPassword: async (plain) => `hashed:${plain}`, frontendUrl: () => `${ORIGIN}/`, queueMail: async (mail) => void state.mails.push(mail) },
    now: () => NOW,
  }
  return state
}

function legacyDeps(state: State) {
  const { bridge, runtime } = state
  const authentication: AuthenticationDeps = {
    bridge,
    auth: runtime.auth,
    credentials: state.credentials,
    profiles: state.profiles,
    today: runtime.today,
    timezone: runtime.timezone,
    throttles: state.limiter,
    attempts: state.attempts,
    verifyPassword: bcryptVerify,
    dummyHash: runtime.dummyHash,
  }
  const session: SessionDeps = { bridge, profiles: state.profiles, today: runtime.today, timezone: runtime.timezone }
  const recovery: RecoveryDeps = {
    runtime: runtimeOf(bridge),
    store: state.recovery,
    throttles: state.limiter,
    verifyHash: bcryptVerify,
    hashPassword: runtime.hashPassword,
    timebox: runtime.timebox,
    production: runtime.production,
    sendMail: runtime.sendMail,
  }
  return { authentication, session, recovery }
}

const ROUTES: [string, string, (web: Request, deps: ReturnType<typeof legacyDeps>) => Promise<Response>][] = [
  ["POST", "/api/v1/authentication/login", (web, deps) => login(web, deps.authentication)],
  ["POST", "/api/v1/authentication/logout", (web, deps) => logout(web, deps.authentication)],
  ["POST", "/api/v1/authentication/account-activation", (web, deps) => activateAccount(web, deps.recovery)],
  ["POST", "/api/v1/authentication/password-recovery", (web, deps) => sendResetLink(web, deps.recovery)],
  ["POST", "/api/v1/authentication/password-reset", (web, deps) => resetPassword(web, deps.recovery)],
  ["GET", "/api/v1/session", (web, deps) => showSession(web, deps.session)],
  ["PUT", "/api/v1/active-role", (web, deps) => selectActiveRole(web, deps.authentication)],
  ["DELETE", "/api/v1/active-role", (web, deps) => leaveActiveRole(web, deps.authentication)],
]

function legacy(state: State, call: Call, headers: Record<string, string>): Promise<Response> {
  const web = webRequest(call, headers)
  const route = ROUTES.find(([method, path]) => method === call.method && path === new URL(web.url).pathname)
  return served(() => (route ? route[2](web, legacyDeps(state)) : unmatchedRoute(web)))
}

let state: State
let app: NestExpressApplication

const nest = (_state: State, call: Call, headers: Record<string, string>) => nestRaw(app, call, headers)

type Send = (state: State, call: Call, headers: Record<string, string>) => Promise<Raw | Response>

class Client {
  readonly answers: Answer[] = []
  readonly jar = new Map<string, string>()
  private readonly ids = new Map<string, string>()

  constructor(
    readonly state: State,
    private readonly transport: Send,
  ) {}

  headersFor(step: Step): Record<string, string> {
    const origin = step.origin === undefined ? ORIGIN : step.origin
    return {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0",
      "x-forwarded-for": IP,
      ...(origin === null ? {} : { origin, referer: `${origin}/ingresar` }),
      ...(this.jar.size > 0 ? { cookie: cookieHeader(this.jar) } : {}),
      ...contentHeaders(step),
      ...step.headers,
    }
  }

  async send(step: Step): Promise<Answer> {
    const sent = await this.transport(this.state, step, this.headersFor(step))
    const raw = sent instanceof Response ? await rawOf(sent) : sent
    jarWith(this.jar, raw.cookies)
    for (const row of this.state.world.db.session) {
      for (const value of [String(row.id), String(row.token)]) if (!this.ids.has(value)) this.ids.set(value, `<session-${this.ids.size}>`)
    }
    let body = raw.body
    for (const [value, placeholder] of this.ids) body = body.split(value).join(placeholder)
    body = body
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, "<time>")
    const answer: Answer = {
      status: raw.status,
      body,
      headers: raw.headers,
      cookies: raw.cookies.map(normalizedCookie),
      writes: {
        sessions: this.state.world.db.session.length,
        users: this.state.world.db.user.map((row) => [row.id, row.emailVerified, row.active]),
        passwords: Object.keys(this.state.passwords),
        resets: [...this.state.resets.keys()],
        invitations: this.state.invitations.map((invitation) => [invitation.id, invitation.usedAt, invitation.invalidatedAt]),
        mails: this.state.mails.map((mail) => ({ ...mail, data: { ...(mail.data as object), token: "<token>" } })),
      },
    }
    this.answers.push(answer)
    return answer
  }

  mailedToken(): string {
    return String((this.state.mails.at(-1)?.data as { token?: string } | undefined)?.token ?? "")
  }
}

type Script = (client: Client) => Promise<unknown>

async function expectSame(script: Script): Promise<Answer[]> {
  const run = async (transport: Send) => {
    state = await freshState()
    const client = new Client(state, transport)
    await script(client)
    return client.answers
  }
  const before = await run(legacy)
  const after = await run(nest)
  expect(after).toEqual(before)
  return after
}

const signIn = (email = EMAIL, password = PASSWORD): Step => ({ method: "POST", path: "/api/v1/authentication/login", body: { email, password } })

beforeAll(async () => {
  state = await freshState()
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, FallbackModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(AUTH_BRIDGE)
    .useValue(live(() => state.bridge))
    .overrideProvider(RATE_LIMITER)
    .useValue(live(() => state.limiter))
    .overrideProvider(IDENTITY_RUNTIME)
    .useValue(live(() => state.runtime))
    .overrideProvider(PROFILE_REPOSITORY)
    .useValue(live(() => state.profiles))
    .overrideProvider(CREDENTIAL_STORE)
    .useValue(live(() => state.credentials))
    .overrideProvider(RECOVERY_REPOSITORY)
    .useValue(live(() => state.recovery))
    .overrideProvider(ACCOUNT_REPOSITORY)
    .useValue({})
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
})

afterAll(async () => {
  await app?.close()
})

describe("identity routes served by Nest answer exactly like the route handlers they replace", () => {
  it("signs in, shows the session, switches and leaves the role and signs out", async () => {
    const answers = await expectSame(async (client) => {
      await client.send(signIn())
      await client.send({ method: "GET", path: "/api/v1/session" })
      await client.send({ method: "PUT", path: "/api/v1/active-role", body: { role_assignment_id: OTHER_ROLE } })
      await client.send({ method: "PUT", path: "/api/v1/active-role", body: { role_assignment_id: "0193a3c2-9999-7000-8000-000000000009" } })
      await client.send({ method: "PUT", path: "/api/v1/active-role", body: {} })
      await client.send({ method: "DELETE", path: "/api/v1/active-role" })
      await client.send({ method: "POST", path: "/api/v1/authentication/logout" })
      await client.send({ method: "GET", path: "/api/v1/session" })
      await client.send({ method: "POST", path: "/api/v1/authentication/logout" })
    })
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 404, 422, 200, 204, 401, 401])
    expect(answers[0].cookies.some((cookie) => cookie.startsWith("silabos-ueb.session_token=<value>"))).toBe(true)
  })

  it("refuses sign-ins outside the web app, with bad credentials, bad fields and inactive accounts the same way", async () => {
    const answers = await expectSame(async (client) => {
      await client.send({ ...signIn(), origin: null })
      await client.send({ ...signIn(), origin: "https://evil.example" })
      await client.send(signIn(EMAIL, "incorrecta"))
      await client.send(signIn("nadie@silabos.test", PASSWORD))
      await client.send({ method: "POST", path: "/api/v1/authentication/login", body: {} })
      await client.send({ method: "POST", path: "/api/v1/authentication/login", body: { email: "no-es-correo", password: PASSWORD } })
      await client.send({ method: "POST", path: "/api/v1/authentication/login", body: { email: [EMAIL], password: PASSWORD } })
      await client.send(signIn(INACTIVE_EMAIL, PASSWORD))
    })
    expect(answers.map((answer) => answer.status)).toEqual([400, 400, 422, 422, 422, 422, 500, 422])
  })

  it("throttles sign-in after five attempts with the same headers", async () => {
    const answers = await expectSame(async (client) => {
      for (let attempt = 0; attempt < 7; attempt += 1) await client.send(signIn(EMAIL, "incorrecta"))
    })
    expect(answers.at(-1)?.status).toBe(429)
    expect(answers.at(-1)?.headers["x-ratelimit-limit"]).toBe("5")
    expect(answers.at(-1)?.headers["retry-after"]).not.toBeNull()
  })

  it("answers an unverified account and a guest the same way", async () => {
    const answers = await expectSame(async (client) => {
      await client.send({ method: "GET", path: "/api/v1/session" })
      await client.send({ method: "PUT", path: "/api/v1/active-role", body: { role_assignment_id: ROLE } })
      await client.send(signIn(UNVERIFIED_EMAIL))
      await client.send({ method: "GET", path: "/api/v1/session" })
      await client.send({ method: "PUT", path: "/api/v1/active-role", body: { role_assignment_id: UNVERIFIED_ROLE } })
      await client.send({ method: "DELETE", path: "/api/v1/active-role" })
      await client.send({ method: "GET", path: "/api/v1/session", origin: null })
    })
    expect(answers.map((answer) => answer.status)).toEqual([401, 401, 200, 200, 403, 403, 401])
  })

  it("signs in a user who had confirmed two-factor authentication in one step, the same way", async () => {
    const answers = await expectSame(async (client) => {
      Object.assign(client.state.world.user(USER)!, { twoFactorEnabled: true })
      await client.send(signIn())
      await client.send({ method: "GET", path: "/api/v1/session" })
    })
    expect(answers.map((answer) => answer.status)).toEqual([200, 200])
    expect(answers[0].cookies.some((cookie) => cookie.includes("two_factor"))).toBe(false)
  })

  it.each([
    ["PUT", "/api/v1/authentication/password"],
    ["GET", "/api/v1/authentication/two-factor"],
    ["POST", "/api/v1/authentication/two-factor"],
    ["DELETE", "/api/v1/authentication/two-factor"],
    ["POST", "/api/v1/authentication/two-factor/confirm"],
    ["POST", "/api/v1/authentication/two-factor/recovery-codes"],
    ["POST", "/api/v1/authentication/two-factor/challenge"],
    ["GET", "/api/v1/authentication/sessions"],
    ["DELETE", "/api/v1/authentication/sessions/others"],
    ["DELETE", "/api/v1/authentication/sessions/abc"],
    ["PUT", "/api/v1/authentication/accessibility"],
  ])("answers the removed %s %s with 404 like any unknown route", async (method, path) => {
    const answers = await expectSame(async (client) => {
      await client.send(signIn())
      await client.send({ method, path, ...(method === "GET" ? {} : { body: { current_password: PASSWORD, password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD, code: "123456" } }) })
    })
    expect(answers.map((answer) => answer.status)).toEqual([200, 404])
  })

  it("sends the reset link, resets the password, activates the account and throttles the same way", async () => {
    const answers = await expectSame(async (client) => {
      await client.send({ method: "POST", path: "/api/v1/authentication/password-recovery", body: { email: EMAIL } })
      await client.send({ method: "POST", path: "/api/v1/authentication/password-reset", body: { email: EMAIL, token: "otro", password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD } })
      await client.send(signIn())
      await client.send({ method: "POST", path: "/api/v1/authentication/password-reset", body: { email: EMAIL, token: client.mailedToken(), password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD } })
      await client.send({ method: "GET", path: "/api/v1/session" })
      await client.send({ method: "POST", path: "/api/v1/authentication/account-activation", body: { token: "otro", password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD } })
      await client.send({ method: "POST", path: "/api/v1/authentication/account-activation", body: { token: ACTIVATION_TOKEN, password: NEW_PASSWORD, password_confirmation: "distinta" } })
      await client.send({ method: "POST", path: "/api/v1/authentication/account-activation", body: { token: ACTIVATION_TOKEN, password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD } })
      await client.send({ method: "POST", path: "/api/v1/authentication/account-activation", body: { token: ACTIVATION_TOKEN, password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD } })
      for (let attempt = 0; attempt < 4; attempt += 1) await client.send({ method: "POST", path: "/api/v1/authentication/password-recovery", body: { email: "nadie@silabos.test" } })
      await client.send({ method: "POST", path: "/api/v1/authentication/password-recovery", body: { email: "no-es-correo" } })
    })
    expect(answers.map((answer) => answer.status)).toEqual([202, 422, 200, 200, 401, 422, 422, 200, 429, 202, 202, 202, 429, 422])
  })

  it.each([
    ["GET", "/api/v1/authentication/login"],
    ["PUT", "/api/v1/authentication/logout"],
    ["GET", "/api/v1/authentication/password-recovery"],
    ["PATCH", "/api/v1/authentication/password"],
    ["POST", "/api/v1/authentication/sessions"],
    ["PUT", "/api/v1/authentication/two-factor"],
    ["GET", "/api/v1/authentication/two-factor/challenge"],
    ["POST", "/api/v1/session"],
    ["GET", "/api/v1/active-role"],
    ["OPTIONS", "/api/v1/session"],
    ["GET", "/api/v1/authentication/otra-cosa"],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame(async (client) => client.send({ method, path }))
  })
})
