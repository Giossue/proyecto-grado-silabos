import { memoryAdapter } from "better-auth/adapters/memory"
import { Secret, TOTP } from "otpauth"
import { bcryptHash } from "./bcrypt"
import { createAuth, type Auth, type AuthSettings } from "./betterAuth"
import { betterAuthSessions } from "./sessionGateway"
import { testConfig } from "./testing"
import type { BridgeDeps, RoleAssignmentRecord, SessionStore } from "./types"

export const ORIGIN = "http://localhost:3000"
export const TEST_SECRET = "m5-test-secret-0123456789abcdefghijklmnopqrstuvwxyz"

export type MemoryUser = { id: string; name: string; email: string; emailVerified: boolean | null; twoFactorEnabled: boolean | null; active: boolean }

export type AuthWorld = {
  auth: Auth
  db: Record<string, Record<string, unknown>[]>
  assignments: RoleAssignmentRecord[]
  cookies: string[]
  deps: BridgeDeps
  addUser(user: Partial<MemoryUser> & { id: string; email: string }, password: string): Promise<void>
  user(id: string): MemoryUser | undefined
}

export function testSettings(overrides: Partial<AuthSettings> = {}): AuthSettings {
  return {
    appName: "Sílabos UEB",
    secret: TEST_SECRET,
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    lifetimeMinutes: 240,
    bcryptRounds: 4,
    cookiePrefix: "silabos-ueb",
    ...overrides,
  }
}

export function authWorld(overrides: Partial<AuthSettings> = {}): AuthWorld {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [], twoFactor: [] }
  const auth = createAuth(memoryAdapter(db), testSettings(overrides))
  const assignments: RoleAssignmentRecord[] = []
  const cookies: string[] = []
  const store: SessionStore = {
    async findUser(id) {
      const user = db.user.find((row) => row.id === id) as MemoryUser | undefined
      if (!user) return null
      const account = db.account.find((row) => row.userId === id && row.providerId === "credential")
      return {
        id: user.id,
        passwordHash: String(account?.password ?? ""),
        active: user.active,
        emailVerifiedAt: user.emailVerified ? "2026-01-01T00:00:00+00:00" : null,
        emailPreferences: null,
      }
    },
    effectiveRoleAssignments: async (userId) => assignments.filter((assignment) => assignment.userId === userId),
  }
  const deps: BridgeDeps = {
    store,
    sessions: betterAuthSessions(() => auth),
    config: { ...testConfig, lifetimeMinutes: overrides.lifetimeMinutes ?? 240 },
    now: () => Math.floor(Date.now() / 1000),
    queueCookies: async (setCookies) => void cookies.push(...setCookies),
  }
  return {
    auth,
    db,
    assignments,
    cookies,
    deps,
    async addUser(user, password) {
      const now = new Date()
      db.user.push({ name: "DOCENTE DEMO", emailVerified: true, twoFactorEnabled: false, active: true, createdAt: now, updatedAt: now, ...user })
      db.account.push({ id: `account-${user.id}`, accountId: user.id, providerId: "credential", userId: user.id, password: await bcryptHash(password, 4), createdAt: now, updatedAt: now })
    },
    user: (id) => db.user.find((row) => row.id === id) as MemoryUser | undefined,
  }
}

export function cookieHeaderFrom(setCookies: string[], previous = ""): string {
  const jar = new Map<string, string>()
  for (const part of previous.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name) jar.set(name, rest.join("="))
  }
  for (const header of setCookies) {
    const [pair, ...attributes] = header.split(";")
    const [name, ...rest] = pair.trim().split("=")
    const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))
    if (expired) jar.delete(name)
    else jar.set(name, rest.join("="))
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
}

export function browserRequest(path: string, init: { method?: string; cookie?: string; body?: unknown; origin?: string | null; headers?: Record<string, string> } = {}): Request {
  const origin = init.origin === undefined ? ORIGIN : init.origin
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(origin === null ? {} : { origin, referer: `${origin}/ingresar` }),
      ...(init.cookie ? { cookie: init.cookie } : {}),
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0",
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
}

export function secretFromUri(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret")
  if (!secret) throw new Error("The otpauth URI has no secret.")
  return secret
}

export function totpCode(base32Secret: string, offsetSteps = 0): string {
  return new TOTP({ secret: Secret.fromBase32(base32Secret), digits: 6, period: 30 }).generate({ timestamp: Date.now() + offsetSteps * 30_000 })
}
