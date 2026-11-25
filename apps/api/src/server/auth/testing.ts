import golden from "../http/__fixtures__/laravel-golden.json"
import { parseAppKey } from "../http/encrypter"
import type { BridgeConfig, BridgeDeps, ResolvedSession, RoleAssignmentRecord, SessionGateway, SessionStore, SessionUser } from "./types"

export const testKey = parseAppKey(golden.appKey)
export const NOW = 1_800_000_000
export const USER_KEY = "user_id"
export const TRUSTED_HOSTS = ["localhost:3000"]

export const testConfig: BridgeConfig = {
  key: testKey,
  lifetimeMinutes: 120,
}

export type SessionRecord = { payload: string; lastActivity: number }

export function sessionCookie(sessionId: string): string {
  return sessionId
}

export function sessionPayload(attributes: Record<string, unknown>): string {
  return JSON.stringify(attributes)
}

export function storedJson(world: FakeWorld, id: string): string | null {
  return world.sessions.get(id)?.payload ?? null
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
  return { [USER_KEY]: golden.userId, active_role_assignment_id: golden.roleId, ...overrides }
}

export type FakeWorld = {
  sessions: Map<string, SessionRecord>
  users: SessionUser[]
  assignments: RoleAssignmentRecord[]
}

export function fakeStore(world: FakeWorld): SessionStore {
  return {
    findUser: async (id) => world.users.find((user) => user.id === id) ?? null,
    effectiveRoleAssignments: async (userId) => world.assignments.filter((assignment) => assignment.userId === userId),
  }
}

function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return decodeURIComponent(rest.join("="))
  }
  return null
}

function attributesOf(record: SessionRecord): Record<string, unknown> {
  const parsed: unknown = JSON.parse(record.payload)
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

export function fakeSessions(world: FakeWorld, config: BridgeConfig = testConfig, now: () => number = () => NOW): SessionGateway {
  return {
    async fromWebApp(request) {
      const source = request.headers.get("origin") || request.headers.get("referer")
      if (!source) return false
      try {
        return TRUSTED_HOSTS.includes(new URL(source).host)
      } catch {
        return false
      }
    },
    async resolve(request) {
      const id = cookieValue(request.headers.get("cookie"), golden.cookieName)
      const record = id === null ? undefined : world.sessions.get(id)
      if (id === null || record === undefined) return null
      if (record.lastActivity < now() - config.lifetimeMinutes * 60) {
        world.sessions.delete(id)
        return null
      }
      const attributes = attributesOf(record)
      const userId = attributes[USER_KEY]
      if (typeof userId !== "string") return null
      world.sessions.set(id, { ...record, lastActivity: now() })
      const role = attributes.active_role_assignment_id
      return { id, token: id, userId, activeRoleAssignmentId: typeof role === "string" ? role : null, cookies: [] } satisfies ResolvedSession
    },
    async find(token) {
      const record = world.sessions.get(token)
      const userId = record === undefined ? undefined : attributesOf(record)[USER_KEY]
      if (record === undefined || typeof userId !== "string") return null
      const role = attributesOf(record).active_role_assignment_id
      return { id: token, token, userId, activeRoleAssignmentId: typeof role === "string" ? role : null, cookies: [] }
    },
    async setActiveRole(session, assignmentId) {
      const record = world.sessions.get(session.id)
      if (record === undefined) return
      const attributes = attributesOf(record)
      if (assignmentId === null) delete attributes.active_role_assignment_id
      else attributes.active_role_assignment_id = assignmentId
      world.sessions.set(session.id, { ...record, payload: sessionPayload(attributes) })
      session.activeRoleAssignmentId = assignmentId
    },
    async revokeUser(userId) {
      for (const [id, record] of world.sessions) if (attributesOf(record)[USER_KEY] === userId) world.sessions.delete(id)
    },
  }
}

export function fakeDeps(world: FakeWorld): BridgeDeps {
  return {
    store: fakeStore(world),
    sessions: fakeSessions(world),
    config: testConfig,
    now: () => NOW,
    queueCookies: async () => undefined,
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
