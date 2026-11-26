// @vitest-environment node
import "reflect-metadata"
import { Global, Module, RequestMethod } from "@nestjs/common"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { Test } from "@nestjs/testing"
import * as client from "openid-client"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { configureApi } from "../../bootstrap"
import { API_PREFIX } from "../../config/api.config"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { createMemoryAttemptLimiter } from "../../server/auth/attemptLimiter"
import { authWorld, cookieHeaderFrom, ORIGIN, type AuthWorld } from "../../server/auth/betterAuthTesting"
import { bcryptVerify } from "../../server/auth/bcrypt"
import { createRateLimiter } from "../../server/http/throttle"
import type { AuthenticationDeps } from "../../server/identity/authentication"
import { AuthenticationController } from "../auth/authentication.controller"
import { IdentityDeps } from "../auth/identity.deps"
import { UNPREFIXED_PATHS } from "../../common/http/root-paths"
import { keycloakSettings } from "./keycloak.config"
import { KeycloakModule } from "./keycloak.module"
import type { KeycloakFlow } from "./keycloak.oidc"
import type { KeycloakStore } from "./keycloak.store"
import { KEYCLOAK_SETTINGS, KEYCLOAK_STORE } from "./keycloak.tokens"

const ISSUER = "https://auth.ueb.edu.ec/auth/realms/SAC"
const METADATA = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  userinfo_endpoint: `${ISSUER}/protocol/openid-connect/userinfo`,
  end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
  jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
}

vi.mock("openid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openid-client")>()
  return {
    ...actual,
    discovery: vi.fn(async (_issuer: URL, clientId: string, secret: string) => new actual.Configuration(METADATA, clientId, secret)),
    authorizationCodeGrant: vi.fn(),
    fetchUserInfo: vi.fn(),
  }
})

const USER = "0193a3c2-1111-7000-8000-000000000001"
const OTHER = "0193a3c2-1111-7000-8000-000000000002"
const INACTIVE = "0193a3c2-1111-7000-8000-000000000003"
const ROLE = "0193a3c2-2222-7000-8000-000000000001"
const EMAIL = "docente@ueb.edu.ec"
const PASSWORD = "Demo-2026!"
const FLOW_COOKIE = "silabos-ueb.keycloak_flow"
const SESSION_COOKIE = "silabos-ueb.session_token"

const ENABLED = {
  KEYCLOAK_ENABLED: "true",
  KEYCLOAK_ISSUER: ISSUER,
  KEYCLOAK_CLIENT_ID: "silabos",
  KEYCLOAK_CLIENT_SECRET: "test-secret",
  KEYCLOAK_REDIRECT_URI: "http://localhost:8000/auth/callback",
  FRONTEND_URL: ORIGIN,
}

type MemoryStore = KeycloakStore & { flows: Map<string, KeycloakFlow>; logouts: Map<string, string> }

function memoryStore(): MemoryStore {
  const flows = new Map<string, KeycloakFlow>()
  const logouts = new Map<string, string>()
  const take = <T>(map: Map<string, T>, key: string): T | null => {
    const value = map.get(key) ?? null
    map.delete(key)
    return value
  }
  return {
    flows,
    logouts,
    putFlow: async (id, flow) => void flows.set(id, flow),
    takeFlow: async (id) => take(flows, id),
    putLogout: async (sessionId, idToken) => void logouts.set(sessionId, idToken),
    takeLogout: async (sessionId) => take(logouts, sessionId),
  }
}

function authenticationOf(world: AuthWorld): AuthenticationDeps {
  return {
    bridge: world.deps,
    auth: () => world.auth,
    credentials: {
      findActiveUserByEmail: async (email) => {
        const row = world.db.user.find((candidate) => candidate.email === email && candidate.active === true)
        return row ? { id: String(row.id) } : null
      },
    },
    profiles: {
      async find(id) {
        const row = world.user(id)
        return row ? { name: row.name, email: row.email, accessibility: null } : null
      },
    },
    today: () => "2026-11-25",
    timezone: () => "America/Guayaquil",
    throttles: createRateLimiter(),
    attempts: createMemoryAttemptLimiter(() => Math.floor(Date.now() / 1000)),
    verifyPassword: bcryptVerify,
    dummyHash: async () => "$2y$04$abcdefghijklmnopqrstuuJ0b0qz6bV1qz6bV1qz6bV1qz6bV1qz6",
  }
}

type Harness = { app: NestExpressApplication; world: AuthWorld; store: MemoryStore }

async function harness(env: Record<string, string>): Promise<Harness> {
  const world = authWorld()
  await world.addUser({ id: USER, email: EMAIL }, PASSWORD)
  await world.addUser({ id: OTHER, email: "otro@ueb.edu.ec" }, PASSWORD)
  await world.addUser({ id: INACTIVE, email: "inactivo@ueb.edu.ec", active: false }, PASSWORD)
  world.assignments.push({ id: ROLE, userId: USER, role: "docente", careerId: "c-1", careerLabel: "Software" } as (typeof world.assignments)[number])
  const store = memoryStore()

  @Global()
  @Module({ providers: [{ provide: IdentityDeps, useValue: { set: { authentication: authenticationOf(world) } } }], exports: [IdentityDeps] })
  class FakeIdentityModule {}

  @Module({ controllers: [AuthenticationController] })
  class AuthenticationOnlyModule {}

  const moduleRef = await Test.createTestingModule({ imports: [FakeIdentityModule, KeycloakModule, AuthenticationOnlyModule] })
    .overrideProvider(KEYCLOAK_SETTINGS)
    .useValue(keycloakSettings(env))
    .overrideProvider(KEYCLOAK_STORE)
    .useValue(store)
    .compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false, logger: false })
  configureApi(app)
  app.setGlobalPrefix(API_PREFIX, { exclude: UNPREFIXED_PATHS.map((path) => ({ path, method: RequestMethod.ALL })) })
  await app.init()
  return { app, world, store }
}

const setCookies = (response: request.Response): string[] => {
  const value = response.headers["set-cookie"] as unknown
  return Array.isArray(value) ? (value as string[]) : value === undefined ? [] : [String(value)]
}

const cookieNamed = (response: request.Response, name: string): string | undefined => setCookies(response).find((cookie) => cookie.startsWith(`${name}=`))

function grantsIdentity(claims: Record<string, unknown>, idToken = "id-token-1") {
  vi.mocked(client.authorizationCodeGrant).mockResolvedValue({ id_token: idToken, access_token: "access-token", token_type: "bearer", claims: () => ({ sub: "kc-1", ...claims }) } as never)
}

async function begin(app: NestExpressApplication): Promise<{ flowCookie: string; state: string }> {
  const response = await request(app.getHttpServer()).get("/auth/keycloak")
  const location = new URL(String(response.headers.location))
  return { flowCookie: cookieHeaderFrom([cookieNamed(response, FLOW_COOKIE) ?? ""]), state: location.searchParams.get("state") ?? "" }
}

async function loginThroughKeycloak(app: NestExpressApplication): Promise<request.Response> {
  const { flowCookie, state } = await begin(app)
  return request(app.getHttpServer()).get(`/auth/callback?code=the-code&state=${state}&session_state=s`).set("cookie", flowCookie)
}

describe("Keycloak login", () => {
  let current: Harness | null = null

  beforeEach(() => {
    vi.mocked(client.authorizationCodeGrant).mockReset()
    vi.mocked(client.fetchUserInfo).mockReset()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await current?.app.close()
    current = null
    vi.restoreAllMocks()
  })

  it("redirects to Keycloak with PKCE S256, state and nonce kept server-side behind an httpOnly cookie", async () => {
    current = await harness(ENABLED)
    const response = await request(current.app.getHttpServer()).get("/auth/keycloak")

    expect(response.status).toBe(302)
    const location = new URL(String(response.headers.location))
    expect(`${location.origin}${location.pathname}`).toBe(METADATA.authorization_endpoint)
    const params = location.searchParams
    expect(params.get("response_type")).toBe("code")
    expect(params.get("client_id")).toBe("silabos")
    expect(params.get("redirect_uri")).toBe("http://localhost:8000/auth/callback")
    expect(params.get("scope")).toBe("openid email profile")
    expect(params.get("code_challenge_method")).toBe("S256")
    const [[id, flow]] = [...current.store.flows]
    expect(params.get("state")).toBe(flow.state)
    expect(params.get("nonce")).toBe(flow.nonce)
    expect(params.get("code_challenge")).toBe(await client.calculatePKCECodeChallenge(flow.verifier))
    expect(location.search).not.toContain(flow.verifier)
    expect(cookieNamed(response, FLOW_COOKIE)).toBe(`${FLOW_COOKIE}=${id}; Max-Age=600; Path=/auth; HttpOnly; SameSite=Lax`)
  })

  it("marks the transient cookie Secure in production", async () => {
    current = await harness({ ...ENABLED, APP_ENV: "production" })
    const response = await request(current.app.getHttpServer()).get("/auth/keycloak")

    expect(cookieNamed(response, FLOW_COOKIE)).toContain("; Secure")
  })

  it("links the Keycloak email to the active user and opens the same session as the password login", async () => {
    current = await harness(ENABLED)
    grantsIdentity({ email: "Docente@UEB.edu.ec", email_verified: true })
    const { flowCookie, state } = await begin(current.app)
    const [[, flow]] = [...current.store.flows]

    const response = await request(current.app.getHttpServer()).get(`/auth/callback?code=the-code&state=${state}`).set("cookie", flowCookie)

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(`${ORIGIN}/rol`)
    const [, callback, checks] = vi.mocked(client.authorizationCodeGrant).mock.calls[0]
    expect(String(callback)).toBe(`http://localhost:8000/auth/callback?code=the-code&state=${state}`)
    expect(checks).toEqual({ pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce, idTokenExpected: true })
    expect(cookieNamed(response, FLOW_COOKIE)).toContain("Max-Age=0")
    expect(current.store.flows.size).toBe(0)
    const sessionCookie = cookieNamed(response, SESSION_COOKIE) ?? ""
    expect(sessionCookie).toContain("HttpOnly")
    expect(sessionCookie).toContain("SameSite=Lax")
    const resolved = await current.world.deps.sessions.resolve(new Request(`${ORIGIN}/api/v1/session`, { headers: { cookie: cookieHeaderFrom([sessionCookie]) } }))
    expect(resolved?.userId).toBe(USER)
    expect(current.world.db.session).toHaveLength(1)
    expect(current.world.db.session[0].activeRoleAssignmentId).toBe(ROLE)
    expect(current.store.logouts.get(String(current.world.db.session[0].id))).toBe("id-token-1")
  })

  it("reads the email from userinfo when the ID token has none", async () => {
    current = await harness(ENABLED)
    grantsIdentity({})
    vi.mocked(client.fetchUserInfo).mockResolvedValue({ sub: "kc-1", email: EMAIL } as never)

    const response = await loginThroughKeycloak(current.app)

    expect(response.headers.location).toBe(`${ORIGIN}/rol`)
    expect(vi.mocked(client.fetchUserInfo).mock.calls[0].slice(1)).toEqual(["access-token", "kc-1"])
  })

  it.each([
    ["an unknown email", { email: "nadie@ueb.edu.ec", email_verified: true }],
    ["an inactive user", { email: "inactivo@ueb.edu.ec" }],
    ["an unverified email", { email: EMAIL, email_verified: false }],
  ])("sends %s back to the login page without creating a session or a user", async (_case, claims) => {
    current = await harness(ENABLED)
    grantsIdentity(claims)
    const users = current.world.db.user.length

    const response = await loginThroughKeycloak(current.app)

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(`${ORIGIN}/ingresar?error=keycloak_sin_cuenta`)
    expect(cookieNamed(response, SESSION_COOKIE)).toBeUndefined()
    expect(current.world.db.session).toHaveLength(0)
    expect(current.world.db.user).toHaveLength(users)
  })

  it("rejects a callback without the transient cookie or with a failed exchange", async () => {
    current = await harness(ENABLED)
    grantsIdentity({ email: EMAIL })

    const missing = await request(current.app.getHttpServer()).get("/auth/callback?code=the-code&state=forged")
    expect(missing.headers.location).toBe(`${ORIGIN}/ingresar?error=keycloak_error`)
    expect(client.authorizationCodeGrant).not.toHaveBeenCalled()

    vi.mocked(client.authorizationCodeGrant).mockRejectedValue(new Error("unexpected JWT \"nonce\" claim value"))
    const failed = await loginThroughKeycloak(current.app)
    expect(failed.headers.location).toBe(`${ORIGIN}/ingresar?error=keycloak_error`)
    expect(current.world.db.session).toHaveLength(0)
  })

  it("answers 404 and providers false when the flag is off", async () => {
    current = await harness({ ...ENABLED, KEYCLOAK_ENABLED: "false" })
    const server = current.app.getHttpServer()

    expect((await request(server).get("/auth/keycloak")).status).toBe(404)
    expect((await request(server).get("/auth/callback?code=x&state=y")).status).toBe(404)
    const providers = await request(server).get("/api/v1/authentication/providers")
    expect(providers.status).toBe(200)
    expect(providers.body).toEqual({ keycloak: false })
  })

  it("announces the provider when the flag is on", async () => {
    current = await harness(ENABLED)
    const providers = await request(current.app.getHttpServer()).get("/api/v1/authentication/providers")

    expect(providers.body).toEqual({ keycloak: true })
  })

  it("logs out of Keycloak too when the session came from Keycloak", async () => {
    current = await harness(ENABLED)
    grantsIdentity({ email: EMAIL })
    const login = await loginThroughKeycloak(current.app)
    const cookie = cookieHeaderFrom([cookieNamed(login, SESSION_COOKIE) ?? ""])

    const response = await request(current.app.getHttpServer()).post("/api/v1/authentication/logout").set("cookie", cookie).set("origin", ORIGIN).set("accept", "application/json")

    expect(response.status).toBe(200)
    const url = new URL(response.body.logout_url as string)
    expect(`${url.origin}${url.pathname}`).toBe(METADATA.end_session_endpoint)
    expect(url.searchParams.get("id_token_hint")).toBe("id-token-1")
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(`${ORIGIN}/ingresar`)
    expect(url.searchParams.get("client_id")).toBe("silabos")
    expect(current.world.db.session).toHaveLength(0)
    expect(current.store.logouts.size).toBe(0)
    expect(cookieNamed(response, SESSION_COOKIE)).toContain("Max-Age=0")
  })

  it("keeps the 204 logout for password sessions", async () => {
    current = await harness(ENABLED)
    const signedIn = await current.world.auth.api.signInEmail({ body: { email: "otro@ueb.edu.ec", password: PASSWORD }, headers: new Headers({ origin: ORIGIN }), returnHeaders: true })
    const cookie = cookieHeaderFrom(signedIn.headers.getSetCookie())

    const response = await request(current.app.getHttpServer()).post("/api/v1/authentication/logout").set("cookie", cookie).set("origin", ORIGIN).set("accept", "application/json")

    expect(response.status).toBe(204)
    expect(current.world.db.session).toHaveLength(0)
  })
})

describe("keycloakSettings", () => {
  it("is disabled by default", () => {
    expect(keycloakSettings({})).toEqual({ enabled: false })
  })

  it("names the invalid variables without echoing secrets", () => {
    expect(() => keycloakSettings({ KEYCLOAK_ENABLED: "true", KEYCLOAK_ISSUER: "no-es-url", KEYCLOAK_CLIENT_SECRET: "super-secret" })).toThrow("Invalid Keycloak configuration: KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID.")
  })

  it("rejects an unknown flag value", () => {
    expect(() => keycloakSettings({ KEYCLOAK_ENABLED: "quizas" })).toThrow("KEYCLOAK_ENABLED must be true or false.")
  })

  it("defaults the redirect and post-logout targets from config only", () => {
    const settings = keycloakSettings({ ...ENABLED, KEYCLOAK_REDIRECT_URI: "" })
    expect(settings).toMatchObject({ redirectUri: "http://localhost:8000/auth/callback", postLogoutRedirectUri: `${ORIGIN}/ingresar`, homeUrl: `${ORIGIN}/rol` })
  })
})
