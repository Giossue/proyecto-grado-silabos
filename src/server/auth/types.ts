export type SessionRecord = { payload: string; lastActivity: number; userId?: string | null; ipAddress?: string | null; userAgent?: string | null }

export type StoredSession = { payload: string; lastActivity: number; userId: string | null; ipAddress: string | null; userAgent: string }

export type SessionUser = {
  id: string
  passwordHash: string
  active: boolean
  emailVerifiedAt: string | null
  emailPreferences: unknown
  rememberToken?: string | null
}

export type RoleAssignmentRecord = {
  id: string
  userId: string
  role: string
  careerId: string | null
  careerLabel: string | null
}

export interface SessionStore {
  findSession(id: string): Promise<SessionRecord | null>
  findUser(id: string): Promise<SessionUser | null>
  effectiveRoleAssignments(userId: string): Promise<RoleAssignmentRecord[]>
  touchSession(id: string, lastActivity: number): Promise<void>
  insertSession(id: string, row: StoredSession): Promise<boolean>
  updateSession(id: string, row: StoredSession): Promise<void>
  destroySession(id: string): Promise<void>
  collectGarbage(threshold: number): Promise<void>
  cycleRememberToken(userId: string, token: string): Promise<void>
}

export type OutgoingCookie = {
  name: string
  value: string
  expires: number
  maxAge: number
  path: string
  domain: string | null
  secure: boolean
  httpOnly: boolean
  sameSite: string
}

export type BridgeConfig = {
  key: Buffer
  appKey: string
  cookieName: string
  lifetimeMinutes: number
  statefulDomains: string[]
}

export type BridgeDeps = {
  store: SessionStore
  config: BridgeConfig
  now: () => number
  queueCookies?: (cookies: OutgoingCookie[]) => Promise<void>
}

export type AppSession = {
  user: SessionUser
  activeRole: RoleAssignmentRecord | null
  eligibleRoles: RoleAssignmentRecord[]
  attributes: Record<string, unknown>
}

export type SessionRequirements = {
  verified?: boolean
  activeRole?: "required" | "optional"
  afterAuthentication?: (user: SessionUser) => Promise<Response | null> | Response | null
}
