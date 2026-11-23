export type SessionRecord = { payload: string; lastActivity: number }

export type SessionUser = {
  id: string
  passwordHash: string
  active: boolean
  emailVerifiedAt: string | null
  emailPreferences: unknown
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
  forward: (request: Request) => Promise<Response>
}

export type LaravelSession = {
  user: SessionUser
  activeRole: RoleAssignmentRecord | null
  eligibleRoles: RoleAssignmentRecord[]
  attributes: Record<string, unknown>
}

export type SessionRequirements = {
  verified?: boolean
  activeRole?: "required" | "optional"
}
