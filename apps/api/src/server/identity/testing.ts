import golden from "../http/__fixtures__/laravel-golden.json"
import { createRateLimiter } from "../http/throttle"
import type { QueuedMail } from "../mail/mailables"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import type { Accessibility, Account, AccountRepository, AccountTx, RoleGrant } from "./accounts"
import type { IdentityWriteDeps } from "./accountWrites"

export const ACTOR = golden.userId
export const ACTOR_ROLE = golden.roleId
export const SESSION_ID = golden.sessionId
export const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
export const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
export const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c6aa"
export const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'

export type FakeAccount = Account & { formation: string | null; accessibility: unknown; passwordHash: string }
export type FakeInvitation = { userId: string; hash: string; expiresAt: number; issuerId: string; createdAt: number; usedAt: number | null; invalidatedAt: number | null }

export type FakeIdentity = {
  accounts: FakeAccount[]
  grants: RoleGrant[]
  careers: { id: string; label: string; active: boolean; locked: boolean; reviewed: boolean }[]
  invitations: FakeInvitation[]
  sessions: { id: string; userId: string }[]
  parallels: { id: string; grantId: string; active: boolean }[]
  inProgress: Record<string, { careerLabel: string; total: number }[]>
  activity: string[]
  notifications: { userId: string }[]
  mails: QueuedMail[]
  returnedApprovals?: string[]
  sequence: number
}

export function account(overrides: Partial<FakeAccount> & { id: string }): FakeAccount {
  return {
    name: "DOCENTE DEMO",
    email: `${overrides.id.slice(0, 8)}@silabos.test`,
    active: true,
    verified: true,
    formation: null,
    accessibility: null,
    passwordHash: golden.passwordHash,
    ...overrides,
  }
}

export function grant(overrides: Partial<RoleGrant> & { id: string; userId: string }): RoleGrant {
  return { role: "docente", careerId: CAREER, active: true, ...overrides }
}

export function emptyIdentity(): FakeIdentity {
  return {
    accounts: [account({ id: ACTOR, name: "ADMINISTRACION DEMO", email: "admin@silabos.test" })],
    grants: [grant({ id: ACTOR_ROLE, userId: ACTOR, role: "administrador", careerId: null })],
    careers: [
      { id: CAREER, label: "Software", active: true, locked: false, reviewed: false },
      { id: OTHER_CAREER, label: "Derecho", active: true, locked: false, reviewed: false },
    ],
    invitations: [],
    sessions: [{ id: SESSION_ID, userId: ACTOR }],
    parallels: [],
    inProgress: {},
    activity: [],
    notifications: [],
    mails: [],
    sequence: 0,
  }
}

function nextId(world: FakeIdentity): string {
  world.sequence += 1
  return `01a1c5bc-0000-7000-8000-${String(world.sequence).padStart(12, "0")}`
}

const label = (world: FakeIdentity, careerId: string | null) => world.careers.find((career) => career.id === careerId)?.label ?? null
const view = (row: FakeAccount): Account => ({ id: row.id, name: row.name, email: row.email, active: row.active, verified: row.verified })
const activeInvitation = (world: FakeIdentity, userId: string, now: number) =>
  world.invitations.some((invitation) => invitation.userId === userId && invitation.usedAt === null && invitation.invalidatedAt === null && invitation.expiresAt > now)

function fakeTx(world: FakeIdentity): AccountTx {
  const find = (id: string) => world.accounts.find((row) => row.id === id)
  const effective = (userId: string) => world.grants.filter((row) => row.userId === userId && row.active)
  return {
    nested: (work) => work(),
    lockAccount: async (id) => {
      const row = find(id)
      return row ? view(row) : null
    },
    lockAccountByEmail: async (email) => {
      const row = world.accounts.find((candidate) => candidate.email.toLowerCase() === email)
      return row ? view(row) : null
    },
    async insertAccount(data) {
      if (world.accounts.some((row) => row.email === data.email)) throw Object.assign(new Error("duplicate"), { code: "23505" })
      const row = account({ id: nextId(world), name: data.name, email: data.email, verified: false, passwordHash: data.passwordHash })
      world.accounts.push(row)
      return view(row)
    },
    async updateIdentity(id, name, email) {
      Object.assign(find(id) as FakeAccount, { name, email })
    },
    async setActive(id, active) {
      Object.assign(find(id) as FakeAccount, { active })
    },
    lockFormation: async (id) => {
      const row = find(id)
      return row ? { formation: row.formation } : null
    },
    async setFormation(id, formation) {
      Object.assign(find(id) as FakeAccount, { formation })
    },
    async setAccessibility(id, preferences: Accessibility) {
      Object.assign(find(id) as FakeAccount, { accessibility: preferences })
    },
    effectiveRoles: async (userId) => effective(userId).map((row) => row.role),
    lockEffectiveGrants: async (userId) => effective(userId).map((row) => ({ ...row })),
    async lockCurrentCoordinator(careerId, exceptUserId) {
      const row = world.grants.find(
        (candidate) => candidate.active && candidate.careerId === careerId && candidate.userId !== exceptUserId && candidate.role === "coordinador" && find(candidate.userId)?.active,
      )
      return row ? { grantId: row.id, userId: row.userId, userName: (find(row.userId) as FakeAccount).name } : null
    },
    guardHandover: async () => undefined,
    returnApprovals: async (careerId) => {
      world.returnedApprovals = [...(world.returnedApprovals ?? []), careerId]
      return []
    },
    async findGrant(userId, role, careerId, activeFirst) {
      const matches = world.grants.filter((row) => row.userId === userId && row.role === role && row.careerId === careerId)
      if (activeFirst) matches.sort((left, right) => Number(right.active) - Number(left.active))
      return matches[0] ? { ...matches[0] } : null
    },
    lockActiveGrant: async (userId, role, careerId) => {
      const row = world.grants.find((candidate) => candidate.userId === userId && candidate.role === role && candidate.careerId === careerId && candidate.active)
      return row ? { ...row } : null
    },
    async insertGrant(userId, role, careerId) {
      const row = { id: nextId(world), userId, role, careerId, active: true }
      world.grants.push(row)
      return { ...row }
    },
    async setGrantActive(id, active) {
      Object.assign(world.grants.find((row) => row.id === id) as RoleGrant, { active })
    },
    async invitationRole(userId) {
      const row = effective(userId)[0]
      return row ? { role: row.role, careerLabel: label(world, row.careerId) } : null
    },
    lockActiveParallelAssignments: async (grantId) => world.parallels.filter((row) => row.grantId === grantId && row.active).map((row) => row.id),
    async deleteParallelAssignment(id) {
      world.parallels = world.parallels.filter((row) => row.id !== id)
    },
    async closeParallelAssignments(userId) {
      const grants = world.grants.filter((row) => row.userId === userId).map((row) => row.id)
      const closing = world.parallels.filter((row) => grants.includes(row.grantId) && row.active)
      for (const row of closing) row.active = false
      return closing.length
    },
    lockEffectiveCoordinations: async (userId) =>
      effective(userId)
        .filter((row) => row.role === "coordinador")
        .map((row) => ({ id: row.id, label: label(world, row.careerId) ?? String(row.careerId) })),
    isEffectiveAdministrator: async (userId) => effective(userId).some((row) => row.role === "administrador"),
    otherActiveAdministratorExists: async (userId) =>
      world.grants.some((row) => row.active && row.userId !== userId && row.role === "administrador" && find(row.userId)?.active),
    syllabiInProgress: async (userId) => world.inProgress[userId] ?? [],
    hasActiveInvitation: async (userId, now) => activeInvitation(world, userId, now),
    async invalidateInvitations(userId, now) {
      for (const row of world.invitations) if (row.userId === userId && row.usedAt === null && row.invalidatedAt === null) row.invalidatedAt = now
    },
    async insertInvitation(invitation) {
      world.invitations.push({ ...invitation, usedAt: null, invalidatedAt: null })
    },
    async latestInvitationIssuer(userId) {
      const latest = [...world.invitations].filter((row) => row.userId === userId).sort((left, right) => right.createdAt - left.createdAt)[0]
      const issuer = latest ? find(latest.issuerId) : undefined
      return issuer ? view(issuer) : null
    },
    async deleteSessions(userId, exceptId) {
      const before = world.sessions.length
      world.sessions = world.sessions.filter((row) => row.userId !== userId || row.id === exceptId)
      return before - world.sessions.length
    },
    async deleteSession(id, userId) {
      world.sessions = world.sessions.filter((row) => !(row.id === id && row.userId === userId))
    },
    hasActivity: async (userId) => world.activity.includes(userId),
    async purgeAccount(userId) {
      world.notifications = world.notifications.filter((row) => row.userId !== userId)
      world.sessions = world.sessions.filter((row) => row.userId !== userId)
      world.grants = world.grants.filter((row) => row.userId !== userId)
      world.accounts = world.accounts.filter((row) => row.id !== userId)
    },
    careerLocked: async (careerId) => world.careers.some((career) => career.id === careerId && career.locked),
  }
}

export function fakeAccounts(world: FakeIdentity): AccountRepository {
  return {
    findAccount: async (id) => {
      const row = world.accounts.find((candidate) => candidate.id === id)
      return row ? view(row) : null
    },
    findGrant: async (id) => {
      const row = world.grants.find((candidate) => candidate.id === id)
      return row ? { ...row } : null
    },
    emailTaken: async (email, ignore) => world.accounts.some((row) => row.email === email && row.id !== ignore),
    activeCareer: async (id) => world.careers.some((career) => career.id === id && career.active),
    hasEffectiveRole: async (userId, role, careerId) => world.grants.some((row) => row.userId === userId && row.active && row.role === role && row.careerId === careerId),
    direct: (work) => work(fakeTx(world)),
    async transaction(work) {
      const snapshot = structuredClone({ ...world, mails: [] })
      try {
        return await work(fakeTx(world))
      } catch (error) {
        Object.assign(world, { ...snapshot, mails: world.mails })
        throw error
      }
    },
  }
}

export type Harness = { bridge: FakeWorld; identity: FakeIdentity; deps: IdentityWriteDeps }

export function harness(role: { id?: string; role: string; careerId: string | null } = { role: "administrador", careerId: null }, attributes: Record<string, unknown> = {}): Harness {
  const identity = emptyIdentity()
  const roleId = role.id ?? ACTOR_ROLE
  identity.grants = [grant({ id: roleId, userId: ACTOR, role: role.role, careerId: role.careerId })]
  const bridge: FakeWorld = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: roleId, ...attributes })), lastActivity: NOW - 10 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ id: roleId, role: role.role, careerId: role.careerId, careerLabel: label(identity, role.careerId) })],
  }
  const deps: IdentityWriteDeps = {
    bridge: fakeDeps(bridge),
    accounts: fakeAccounts(identity),
    services: {
      random: (length) => "a".repeat(length),
      hashPassword: async (plain) => `hashed:${plain.length}`,
      frontendUrl: () => "http://localhost:3000/",
      queueMail: async (mail) => void identity.mails.push(mail),
    },
    limiter: createRateLimiter(),
    verifyPassword: async (plain) => plain === "secreto-actual",
    session: {
      profiles: {
        find: async (userId) => {
          const row = identity.accounts.find((candidate) => candidate.id === userId)
          return row
            ? { name: row.name, email: row.email, formation: row.formation, accessibility: row.accessibility, twoFactorSecret: false, twoFactorConfirmed: false }
            : null
        },
      },
      today: () => "2027-01-15",
      timezone: () => "America/Guayaquil",
    },
  }
  return { bridge, identity, deps }
}

export function jsonRequest(path: string, method: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      referer: "http://localhost:3000/usuarios",
      "sec-fetch-site": "same-origin",
      cookie: COOKIE,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export { NOW }
