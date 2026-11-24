import golden from "../laravel/__fixtures__/laravel-golden.json"
import { cookiePrefix } from "../laravel/cookies"
import { decrypt, encrypt, parseAppKey } from "../laravel/encrypter"
import { hashPasswordForCookie, loginSessionKey } from "../laravel/sessionGuard"
import type { BridgeConfig, BridgeDeps, RoleAssignmentRecord, SessionRecord, SessionStore, SessionUser } from "./types"

export const testKey = parseAppKey(golden.appKey)
export const NOW = 1_800_000_000

export const testConfig: BridgeConfig = {
  key: testKey,
  appKey: golden.appKey,
  cookieName: golden.cookieName,
  lifetimeMinutes: 120,
  statefulDomains: ["localhost:3000"],
}

export function sessionCookie(sessionId: string): string {
  return encrypt(cookiePrefix(golden.cookieName, testKey) + sessionId, testKey, false)
}

export function xsrfHeader(token: string): string {
  return encrypt(cookiePrefix("XSRF-TOKEN", testKey) + token, testKey, false)
}

export function sessionPayload(attributes: Record<string, unknown>): string {
  return Buffer.from(encrypt(JSON.stringify(attributes), testKey, true)).toString("base64")
}

export function storedJson(world: FakeWorld, id: string): string | null {
  const row = world.sessions.get(id)
  return row ? decrypt(Buffer.from(row.payload, "base64").toString("utf8"), testKey, true) : null
}

export function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: golden.userId,
    passwordHash: golden.passwordHash,
    active: true,
    emailVerifiedAt: "2026-01-01T00:00:00+00:00",
    emailPreferences: null,
    ...overrides,
  }
}

export function makeAssignment(overrides: Partial<RoleAssignmentRecord> = {}): RoleAssignmentRecord {
  return { id: golden.roleId, userId: golden.userId, role: "docente", careerId: "c-1", careerLabel: "Software", ...overrides }
}

export function loggedInAttributes(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _token: golden.csrfToken,
    [loginSessionKey()]: golden.userId,
    password_hash_web: hashPasswordForCookie(golden.passwordHash, golden.appKey),
    active_role_assignment_id: golden.roleId,
    ...overrides,
  }
}

export type FakeWorld = {
  sessions: Map<string, SessionRecord>
  users: SessionUser[]
  assignments: RoleAssignmentRecord[]
}

export function fakeStore(world: FakeWorld): SessionStore {
  return {
    findSession: async (id) => world.sessions.get(id) ?? null,
    findUser: async (id) => world.users.find((user) => user.id === id) ?? null,
    effectiveRoleAssignments: async (userId) => world.assignments.filter((assignment) => assignment.userId === userId),
    touchSession: async (id, lastActivity) => {
      const row = world.sessions.get(id)
      if (row) world.sessions.set(id, { ...row, lastActivity })
    },
    insertSession: async (id, row) => {
      if (world.sessions.has(id)) return false
      world.sessions.set(id, { ...row })
      return true
    },
    updateSession: async (id, row) => {
      if (world.sessions.has(id)) world.sessions.set(id, { ...row })
    },
    destroySession: async (id) => {
      world.sessions.delete(id)
    },
    collectGarbage: async (threshold) => {
      for (const [id, row] of world.sessions) if (row.lastActivity <= threshold) world.sessions.delete(id)
    },
  }
}

export function fakeDeps(world: FakeWorld, forwarded: Request[] = []): BridgeDeps {
  return {
    store: fakeStore(world),
    config: testConfig,
    now: () => NOW,
    forward: async (request) => {
      forwarded.push(request)
      return new Response("from-laravel", { status: 299 })
    },
  }
}

export function apiRequest(
  path: string,
  { method = "GET", cookie, headers = {} }: { method?: string; cookie?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      accept: "application/json",
      referer: "http://localhost:3000/notificaciones",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
  })
}
