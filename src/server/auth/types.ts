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
  findUser(id: string): Promise<SessionUser | null>
  effectiveRoleAssignments(userId: string): Promise<RoleAssignmentRecord[]>
}

export type ResolvedSession = {
  id: string
  token: string
  userId: string
  activeRoleAssignmentId: string | null
  cookies: string[]
}

export interface SessionGateway {
  fromWebApp(request: Request): Promise<boolean>
  resolve(request: Request): Promise<ResolvedSession | null>
  find(token: string): Promise<ResolvedSession | null>
  setActiveRole(session: ResolvedSession, assignmentId: string | null): Promise<void>
  revokeUser(userId: string): Promise<void>
}

export type BridgeConfig = {
  key: Buffer
  lifetimeMinutes: number
}

export type BridgeDeps = {
  store: SessionStore
  sessions: SessionGateway
  config: BridgeConfig
  now: () => number
  queueCookies?: (setCookies: string[]) => Promise<void>
}

export type AppSession = {
  user: SessionUser
  activeRole: RoleAssignmentRecord | null
  eligibleRoles: RoleAssignmentRecord[]
  session: ResolvedSession
}

export type SessionRequirements = {
  verified?: boolean
  activeRole?: "required" | "optional"
  afterAuthentication?: (user: SessionUser) => Promise<Response | null> | Response | null
}
