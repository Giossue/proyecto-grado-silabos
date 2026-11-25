import "server-only"
import type { Auth } from "./betterAuth"
import type { ResolvedSession, SessionGateway } from "./types"

export function requestSource(request: Request): string | null {
  return request.headers.get("origin") || request.headers.get("referer") || null
}

export function betterAuthSessions(auth: () => Auth): SessionGateway {
  return {
    async fromWebApp(request) {
      const source = requestSource(request)
      if (source === null) return false
      const context = await auth().$context
      return context.isTrustedOrigin(source, { allowRelativePaths: false })
    },
    async resolve(request) {
      const { headers, response } = await auth().api.getSession({ headers: request.headers, returnHeaders: true })
      if (!response) return null
      const { session } = response
      return {
        id: session.id,
        token: session.token,
        userId: session.userId,
        activeRoleAssignmentId: session.activeRoleAssignmentId ?? null,
        cookies: headers.getSetCookie(),
      } satisfies ResolvedSession
    },
    async find(token) {
      const context = await auth().$context
      const found = await context.internalAdapter.findSession(token)
      if (!found) return null
      const session = found.session as typeof found.session & { activeRoleAssignmentId?: string | null }
      return { id: session.id, token: session.token, userId: session.userId, activeRoleAssignmentId: session.activeRoleAssignmentId ?? null, cookies: [] }
    },
    async setActiveRole(session, assignmentId) {
      const context = await auth().$context
      await context.internalAdapter.updateSession(session.token, { activeRoleAssignmentId: assignmentId })
      session.activeRoleAssignmentId = assignmentId
    },
    async revokeUser(userId) {
      const context = await auth().$context
      await context.internalAdapter.deleteUserSessions(userId)
    },
  }
}
