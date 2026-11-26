import { requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession, RoleAssignmentRecord } from "../auth/types"
import { apiJson, unauthenticated } from "../http/responses"

export type UserProfile = {
  name: string
  email: string
}

export interface ProfileRepository {
  find(userId: string): Promise<UserProfile | null>
}

export type SessionDeps = {
  bridge: BridgeDeps
  profiles: ProfileRepository
  today: () => string
  timezone: () => string
}


function rolePayload(assignment: RoleAssignmentRecord) {
  return { id: assignment.id, code: assignment.role, career_id: assignment.careerId, career_name: assignment.careerLabel }
}

export function sessionPayload(session: AppSession, profile: UserProfile, deps: Pick<SessionDeps, "today" | "timezone">) {
  return {
    user: {
      id: session.user.id,
      name: profile.name,
      email: profile.email,
      email_verified: session.user.emailVerifiedAt !== null,
      can_edit_identity: session.activeRole?.role === "administrador",
    },
    active_role: session.activeRole === null ? null : rolePayload(session.activeRole),
    available_roles: session.eligibleRoles.map(rolePayload),
    institution: { today: deps.today(), timezone: deps.timezone() },
  }
}

export async function showSession(request: Request, deps: SessionDeps): Promise<Response> {
  const session = await requireSession(request, { activeRole: "optional" }, deps.bridge)
  if (session instanceof Response) return session
  const profile = await deps.profiles.find(session.user.id)
  if (profile === null) return unauthenticated()
  return apiJson(sessionPayload(session, profile, deps))
}
