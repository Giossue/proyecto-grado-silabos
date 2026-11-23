import "server-only"
import { requireSession, defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { laravelJson } from "../laravel/responses"
import { emailOptionsFor } from "./emailNoticeCatalog"

export type EmailPreferencesDeps = { bridge: BridgeDeps }

export async function showEmailPreferences(
  request: Request,
  deps: EmailPreferencesDeps = { bridge: defaultBridgeDeps() },
): Promise<Response> {
  const session = await requireSession(request, { verified: true }, deps.bridge)
  if (session instanceof Response) return session
  const roles = (await deps.bridge.store.effectiveRoleAssignments(session.user.id)).map((assignment) => assignment.role)
  return laravelJson({ options: emailOptionsFor(roles, session.user.emailPreferences) })
}
