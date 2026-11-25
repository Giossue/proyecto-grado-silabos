// @vitest-environment node
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { makeUser } from "../../server/auth/testing"
import { xlsx } from "../../server/excel/testing"
import { unmatchedRoute } from "../../server/http/router"
import { destroyManagedUser, removeManagedUserRole, resendManagedUserActivation, storeManagedUser, updateManagedUser } from "../../server/identity/accountWrites"
import { importUsers, userImportTemplate, type IdentityImportDeps, type IdentityImportStore } from "../../server/identity/imports"
import { managedUsers, type ManagedUserRepository } from "../../server/identity/managedUsers"
import { destroyOtherSessions, destroySession, resendOwnActivation, updateAccessibility, updateFormation, updateProfile } from "../../server/identity/selfService"
import { account, ACTOR, CAREER, COOKIE, grant, harness, NOW, OTHER_CAREER, SESSION_ID, type Harness } from "../../server/identity/testing"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { contentHeaders, live, nestRaw, rawOf, served, webRequest, type Call, type Raw } from "../auth/identity-equivalence.testing"
import { IDENTITY_RUNTIME, type IdentityRuntime } from "../auth/identity.runtime"
import { ACCOUNT_REPOSITORY, ACTIVE_SESSION_STORE, CREDENTIAL_STORE, PROFILE_REPOSITORY, RECOVERY_REPOSITORY, TWO_FACTOR_STORE } from "../auth/identity.tokens"
import { FallbackModule } from "../fallback/fallback.module"
import { UsersModule } from "./users.module"
import { IDENTITY_IMPORT_STORE, MANAGED_USER_REPOSITORY } from "./users.deps"

const PENDING = "01a1c5bc-79ca-7331-8f0f-000000000001"
const TEACHER = "01a1c5bc-79ca-7331-8f0f-000000000002"
const TEACHER_GRANT = "01a1c5bc-79ca-7331-8f0f-000000000003"
const MISSING = "01a1c5bc-79ca-7331-8f0f-000000000009"
const OTHER_SESSION = "OtraSesionOtraSesionOtraSesionOtraSesion"
const USERS = ["Nombres", "Apellidos", "Correo", "Rol", "Carrera"]

type State = Harness & { runtime: IdentityRuntime; users: ManagedUserRepository; store: IdentityImportStore }

type Answer = Raw & { writes: unknown }

function freshState(test: Harness): State {
  test.identity.accounts.push(
    account({ id: PENDING, name: "PENDIENTE DEMO", email: "pendiente@silabos.test", verified: false }),
    account({ id: TEACHER, name: "DOCENTE DEMO", email: "docente@silabos.test" }),
  )
  test.identity.grants.push(grant({ id: TEACHER_GRANT, userId: TEACHER, role: "docente", careerId: CAREER }))
  test.identity.invitations.push({ userId: PENDING, hash: "h", expiresAt: NOW - 10, issuerId: ACTOR, createdAt: NOW - 100, usedAt: null, invalidatedAt: null })
  test.identity.sessions.push({ id: OTHER_SESSION, userId: ACTOR })
  const { identity, deps } = test
  const users: ManagedUserRepository = {
    async page(_filters, page, perPage) {
      const rows = identity.accounts.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        active: row.active,
        verified: row.verified,
        twoFactor: false,
        invitationActive: identity.invitations.some((invitation) => invitation.userId === row.id && invitation.expiresAt > NOW),
        assignments: identity.grants.filter((item) => item.userId === row.id).map((item) => ({ id: item.id, role: item.role, careerLabel: item.careerId, active: item.active })),
      }))
      return { total: rows.length, items: rows.slice((page - 1) * perPage, page * perPage) }
    },
    careers: async () => identity.careers.filter((career) => career.active).map((career) => ({ id: career.id, nombre: career.label })),
  }
  const store: IdentityImportStore = {
    activeCareers: async () => identity.careers.filter((career) => career.active).map((career) => ({ id: career.id, name: career.label, code: career.label.slice(0, 3).toUpperCase(), label: career.label })),
    templateCareerLabels: async () => identity.careers.filter((career) => career.active).map((career) => career.label).sort(),
  }
  const unused = async () => {
    throw new Error("not used")
  }
  const runtime: IdentityRuntime = {
    auth: unused as never,
    attempts: {} as never,
    replay: {} as never,
    verifyPassword: deps.verifyPassword,
    hashPassword: unused,
    dummyHash: unused,
    production: () => false,
    today: deps.session.today,
    timezone: deps.session.timezone,
    timebox: (work) => work(() => undefined),
    sendMail: unused,
    services: deps.services,
    now: () => NOW,
  }
  return { ...test, runtime, users, store }
}

const importDeps = (state: State): IdentityImportDeps => ({ ...state.deps, store: state.store, now: () => NOW })

const ROUTES: [string, RegExp, (web: Request, state: State, params: string[]) => Promise<Response>][] = [
  ["PUT", /^\/api\/v1\/authentication\/profile$/, (web, state) => updateProfile(web, state.deps)],
  ["PUT", /^\/api\/v1\/authentication\/formation$/, (web, state) => updateFormation(web, state.deps)],
  ["PUT", /^\/api\/v1\/authentication\/accessibility$/, (web, state) => updateAccessibility(web, state.deps)],
  ["POST", /^\/api\/v1\/authentication\/account-activation\/resend$/, (web, state) => resendOwnActivation(web, state.deps)],
  ["DELETE", /^\/api\/v1\/authentication\/sessions\/others$/, (web, state) => destroyOtherSessions(web, state.deps)],
  ["DELETE", /^\/api\/v1\/authentication\/sessions\/([^/]+)$/, (web, state, [id]) => destroySession(web, id, state.deps)],
  ["GET", /^\/api\/v1\/admin\/users$/, (web, state) => managedUsers(web, { bridge: state.deps.bridge, users: state.users })],
  ["POST", /^\/api\/v1\/admin\/users$/, (web, state) => storeManagedUser(web, state.deps)],
  ["POST", /^\/api\/v1\/admin\/users\/import$/, (web, state) => importUsers(web, importDeps(state))],
  ["GET", /^\/api\/v1\/admin\/users\/import-template$/, (web, state) => userImportTemplate(web, importDeps(state))],
  ["PATCH", /^\/api\/v1\/admin\/users\/([^/]+)$/, (web, state, [user]) => updateManagedUser(web, user, state.deps)],
  ["DELETE", /^\/api\/v1\/admin\/users\/([^/]+)$/, (web, state, [user]) => destroyManagedUser(web, user, state.deps)],
  ["POST", /^\/api\/v1\/admin\/users\/([^/]+)\/resend-activation$/, (web, state, [user]) => resendManagedUserActivation(web, user, state.deps)],
  ["DELETE", /^\/api\/v1\/admin\/users\/([^/]+)\/roles\/([^/]+)$/, (web, state, [user, assignment]) => removeManagedUserRole(web, user, assignment, state.deps)],
]

function legacy(state: State, call: Call, headers: Record<string, string>): Promise<Response> {
  const web = webRequest(call, headers)
  const path = new URL(web.url).pathname
  for (const [method, pattern, handler] of ROUTES) {
    const match = pattern.exec(path)
    if (method === call.method && match) return served(() => handler(web, state, match.slice(1).map(decodeURIComponent)))
  }
  return served(() => unmatchedRoute(web))
}

let state: State
let app: NestExpressApplication

function headersOf(call: Call): Record<string, string> {
  return {
    accept: "application/json",
    referer: "http://localhost:3000/usuarios",
    "sec-fetch-site": "same-origin",
    "x-forwarded-for": "203.0.113.5",
    cookie: COOKIE,
    ...contentHeaders(call),
    ...call.headers,
  }
}

function writesOf(current: State) {
  const { identity, bridge } = current
  return { identity: structuredClone(identity), sessions: [...bridge.sessions.entries()].map(([id, record]) => [id, record.payload]) }
}

async function expectSame(setup: (test: Harness) => void, ...calls: Call[]): Promise<Answer[]> {
  const run = async (send: (call: Call) => Promise<Raw>) => {
    const test = harness()
    setup(test)
    state = freshState(test)
    const answers: Answer[] = []
    for (const call of calls) answers.push({ ...(await send(call)), writes: writesOf(state) })
    return answers
  }
  const before = await run(async (call) => rawOf(await legacy(state, call, headersOf(call))))
  const after = await run((call) => nestRaw(app, call, headersOf(call)))
  expect(after).toEqual(before)
  return after
}

const asAdmin = () => undefined

function asRole(role: string, careerId: string | null) {
  return (test: Harness) => {
    test.bridge.assignments[0] = { ...test.bridge.assignments[0], role, careerId }
    test.identity.grants[0] = { ...test.identity.grants[0], role, careerId }
  }
}

function withoutRole(test: Harness) {
  test.bridge.assignments = []
  test.identity.grants = []
}

function unverified(test: Harness) {
  test.bridge.users = [makeUser({ emailVerifiedAt: null })]
  test.identity.accounts[0] = { ...test.identity.accounts[0], verified: false }
}

function inactive(test: Harness) {
  test.bridge.users = [makeUser({ active: false })]
}

async function multipart(path: string, file: Buffer, fields: Record<string, string> = {}): Promise<Call> {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(file)], "datos.xlsx"))
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  const encoded = new Request("http://localhost:3000", { method: "POST", body: form })
  return { method: "POST", path, raw: { contentType: encoded.headers.get("content-type") ?? "", data: Buffer.from(await encoded.arrayBuffer()) } }
}

beforeAll(async () => {
  state = freshState(harness())
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, UsersModule, FallbackModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(AUTH_BRIDGE)
    .useValue(live(() => state.deps.bridge))
    .overrideProvider(RATE_LIMITER)
    .useValue(live(() => state.deps.limiter))
    .overrideProvider(IDENTITY_RUNTIME)
    .useValue(live(() => state.runtime))
    .overrideProvider(PROFILE_REPOSITORY)
    .useValue(live(() => state.deps.session.profiles))
    .overrideProvider(ACCOUNT_REPOSITORY)
    .useValue(live(() => state.deps.accounts))
    .overrideProvider(MANAGED_USER_REPOSITORY)
    .useValue(live(() => state.users))
    .overrideProvider(IDENTITY_IMPORT_STORE)
    .useValue(live(() => state.store))
    .overrideProvider(ACTIVE_SESSION_STORE)
    .useValue({})
    .overrideProvider(CREDENTIAL_STORE)
    .useValue({})
    .overrideProvider(RECOVERY_REPOSITORY)
    .useValue({})
    .overrideProvider(TWO_FACTOR_STORE)
    .useValue({})
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
})

afterAll(async () => {
  await app?.close()
})

const sessionIdPath = (id: string) => `/api/v1/authentication/sessions/${encodeURIComponent(id)}`

describe("account self-service served by Nest answers exactly like the route handlers it replaces", () => {
  it("updates the profile, the formation and the accessibility with the same session answers", async () => {
    const answers = await expectSame(
      asAdmin,
      { method: "PUT", path: "/api/v1/authentication/profile", body: { nombre: "Ana Luz Pérez", correo_electronico: "admin@silabos.test" } },
      { method: "PUT", path: "/api/v1/authentication/profile", body: { nombre: "", correo_electronico: "docente@silabos.test" } },
      { method: "PUT", path: "/api/v1/authentication/formation", body: { formacion_experiencia: "Magíster en Software." } },
      { method: "PUT", path: "/api/v1/authentication/formation", body: { formacion_experiencia: ["x"] } },
      { method: "PUT", path: "/api/v1/authentication/accessibility", body: { high_contrast: true, text_size: "130", no_motion: "1", dyslexia: false } },
      { method: "PUT", path: "/api/v1/authentication/accessibility", body: { text_size: "999" } },
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 422, 200, 422, 200, 422])
  })

  it("forbids the profile without the administrator role and asks for a role when none is active", async () => {
    const teacher = await expectSame(asRole("docente", CAREER), { method: "PUT", path: "/api/v1/authentication/profile", body: { nombre: "Ana", correo_electronico: "ana@silabos.test" } })
    expect(teacher[0].status).toBe(403)
    const roleless = await expectSame(
      withoutRole,
      { method: "PUT", path: "/api/v1/authentication/profile", body: { nombre: "Ana", correo_electronico: "ana@silabos.test" } },
      { method: "PUT", path: "/api/v1/authentication/formation", body: { formacion_experiencia: "x" } },
      { method: "PUT", path: "/api/v1/authentication/accessibility", body: { high_contrast: true, text_size: "100", no_motion: false, dyslexia: false } },
    )
    expect(roleless.map((answer) => answer.status)).toEqual([409, 409, 200])
  })

  it("answers a guest, an unverified and an inactive account the same way", async () => {
    const guest = await expectSame(asAdmin, { method: "PUT", path: "/api/v1/authentication/profile", body: {}, headers: { cookie: "" } }, { method: "GET", path: "/api/v1/admin/users", headers: { cookie: "" } })
    expect(guest.map((answer) => answer.status)).toEqual([401, 401])
    const pending = await expectSame(
      unverified,
      { method: "PUT", path: "/api/v1/authentication/formation", body: { formacion_experiencia: "x" } },
      { method: "GET", path: "/api/v1/admin/users" },
      { method: "POST", path: "/api/v1/authentication/account-activation/resend" },
      { method: "POST", path: "/api/v1/authentication/account-activation/resend" },
      { method: "POST", path: "/api/v1/authentication/account-activation/resend" },
      { method: "POST", path: "/api/v1/authentication/account-activation/resend" },
    )
    expect(pending.map((answer) => answer.status)).toEqual([403, 403, 202, 202, 202, 429])
    const disabled = await expectSame(inactive, { method: "GET", path: "/api/v1/admin/users" }, { method: "DELETE", path: sessionIdPath(OTHER_SESSION) })
    expect(disabled.map((answer) => answer.status)).toEqual([403, 401])
  })

  it("closes one session, refuses the current one and closes the others after the password", async () => {
    const answers = await expectSame(
      asAdmin,
      { method: "DELETE", path: sessionIdPath(SESSION_ID) },
      { method: "DELETE", path: sessionIdPath(OTHER_SESSION) },
      { method: "DELETE", path: "/api/v1/authentication/sessions/others", body: { current_password: "otra" } },
      { method: "DELETE", path: "/api/v1/authentication/sessions/others", body: {} },
      { method: "DELETE", path: "/api/v1/authentication/sessions/others", body: { current_password: ["secreto-actual"] } },
      { method: "DELETE", path: "/api/v1/authentication/sessions/others", body: { current_password: "secreto-actual" } },
    )
    expect(answers.map((answer) => answer.status)).toEqual([422, 200, 422, 422, 500, 200])
  })
})

describe("account management served by Nest answers exactly like the route handlers it replaces", () => {
  it("lists the accounts with the same paginator, filters and careers", async () => {
    const answers = await expectSame(
      asAdmin,
      { method: "GET", path: "/api/v1/admin/users" },
      { method: "GET", path: "/api/v1/admin/users?q=%20Ana%20&status=pending&role=docente&career=" + CAREER + "&sort=status&dir=desc&page=1" },
      { method: "GET", path: "/api/v1/admin/users?status=otro&role[]=x" },
      { method: "GET", path: "/api/v1/admin/users?page=abc&sort=nombre" },
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 422, 422])
  })

  it("creates, updates, resends, removes a role and deletes accounts with the same writes", async () => {
    const answers = await expectSame(
      asAdmin,
      { method: "POST", path: "/api/v1/admin/users", body: { nombres: "Luis", apellidos: "Mora", correo_electronico: "luis@silabos.test", role_code: "docente", career_id: CAREER } },
      { method: "POST", path: "/api/v1/admin/users", body: { nombres: "", apellidos: "", correo_electronico: "docente@silabos.test", role_code: "otro" } },
      { method: "POST", path: "/api/v1/admin/users", body: { nombres: "Eva", apellidos: "Ruiz", correo_electronico: "eva@silabos.test", role_code: "bibliotecario", career_id: OTHER_CAREER } },
      { method: "PATCH", path: `/api/v1/admin/users/${TEACHER}`, body: { nombre: "DOCENTE CAMBIADO", correo_electronico: "docente@silabos.test", role_code: "coordinador", career_id: OTHER_CAREER } },
      { method: "PATCH", path: `/api/v1/admin/users/${TEACHER}`, body: { nombre: "DOCENTE CAMBIADO", correo_electronico: "docente@silabos.test", active: false } },
      { method: "PATCH", path: `/api/v1/admin/users/${ACTOR}`, body: { nombre: "ADMIN", correo_electronico: "admin@silabos.test", active: false } },
      { method: "PATCH", path: `/api/v1/admin/users/${MISSING}`, body: {} },
      { method: "PATCH", path: "/api/v1/admin/users/no-es-uuid", body: {} },
      { method: "PATCH", path: "/api/v1/admin/users/import", body: {} },
      { method: "PATCH", path: "/api/v1/admin/users/import-template", body: {} },
      { method: "POST", path: `/api/v1/admin/users/${PENDING}/resend-activation` },
      { method: "POST", path: `/api/v1/admin/users/${TEACHER}/resend-activation` },
      { method: "DELETE", path: `/api/v1/admin/users/${TEACHER}/roles/${MISSING}` },
      { method: "DELETE", path: `/api/v1/admin/users/${PENDING}/roles/${TEACHER_GRANT}` },
      { method: "DELETE", path: `/api/v1/admin/users/${TEACHER}/roles/${TEACHER_GRANT}` },
      { method: "DELETE", path: `/api/v1/admin/users/${TEACHER}` },
      { method: "DELETE", path: `/api/v1/admin/users/${PENDING}` },
      { method: "DELETE", path: "/api/v1/admin/users/import" },
      { method: "DELETE", path: "/api/v1/admin/users/import-template" },
    )
    expect(answers.map((answer) => answer.status)).toEqual([201, 422, 201, 200, 200, 403, 404, 404, 404, 404, 200, 403, 404, 404, 422, 403, 200, 404, 404])
  })

  it("throttles the activation resend with the same headers", async () => {
    const calls = Array.from({ length: 5 }, () => ({ method: "POST", path: `/api/v1/admin/users/${PENDING}/resend-activation`, body: { email: "pendiente@silabos.test" } }))
    const answers = await expectSame(asAdmin, ...calls)
    expect(answers.at(-1)?.headers["x-ratelimit-limit"]).toBe("3")
    expect(answers.at(-1)?.status).toBe(429)
  })

  it("forbids account management to other roles and asks for a role when none is active", async () => {
    const calls: Call[] = [
      { method: "GET", path: "/api/v1/admin/users" },
      { method: "POST", path: "/api/v1/admin/users", body: {} },
      { method: "PATCH", path: `/api/v1/admin/users/${TEACHER}`, body: { nombre: "X" } },
      { method: "DELETE", path: `/api/v1/admin/users/${PENDING}` },
      { method: "POST", path: `/api/v1/admin/users/${PENDING}/resend-activation` },
      { method: "DELETE", path: `/api/v1/admin/users/${TEACHER}/roles/${TEACHER_GRANT}` },
      { method: "GET", path: "/api/v1/admin/users/import-template" },
    ]
    const teacher = await expectSame(asRole("docente", CAREER), ...calls)
    expect(teacher.map((answer) => answer.status)).toEqual([403, 403, 403, 403, 403, 403, 403])
    const roleless = await expectSame(withoutRole, ...calls)
    expect(roleless.map((answer) => answer.status)).toEqual([409, 409, 409, 409, 409, 409, 409])
  })

  it("downloads the template and previews, refuses and imports a spreadsheet the same way", async () => {
    const good = await xlsx([USERS, ["Ana Luz", "Uno Cinco", "Ana.Uno@silabos.test", "Docente", "software"], ["Luis Pedro", "Dos Tres", "luis.dos@silabos.test", "bibliotecario", ""]])
    const bad = await xlsx([USERS, ["Ana", "Uno", "ana.uno@silabos.test", "Docente", "Carrera inexistente"]])
    const answers = await expectSame(
      asAdmin,
      { method: "GET", path: "/api/v1/admin/users/import-template" },
      await multipart("/api/v1/admin/users/import", good),
      await multipart("/api/v1/admin/users/import", bad, { confirm: "1" }),
      await multipart("/api/v1/admin/users/import", good, { confirm: "1" }),
      await multipart("/api/v1/admin/users/import", Buffer.from("no es una hoja")),
      { method: "POST", path: "/api/v1/admin/users/import", body: {} },
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200, 422, 422])
    expect(answers[0].headers["content-type"]).toContain("spreadsheetml")
  })

  it.each([
    ["GET", "/api/v1/admin/users/import"],
    ["POST", "/api/v1/admin/users/import-template"],
    ["GET", `/api/v1/admin/users/${TEACHER}`],
    ["PUT", "/api/v1/admin/users"],
    ["GET", `/api/v1/admin/users/${TEACHER}/resend-activation`],
    ["PATCH", `/api/v1/admin/users/${TEACHER}/roles/${TEACHER_GRANT}`],
    ["GET", "/api/v1/authentication/profile"],
    ["POST", "/api/v1/authentication/sessions/others"],
    ["OPTIONS", "/api/v1/admin/users"],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame(asAdmin, { method, path })
  })
})
