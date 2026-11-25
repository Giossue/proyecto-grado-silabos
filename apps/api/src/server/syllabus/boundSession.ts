import { requireSession } from "../auth/requireSession"
import type { AppSession, BridgeDeps, SessionRequirements, SessionUser } from "../auth/types"

export const BOUND_SESSION: SessionRequirements = { verified: true, activeRole: "required" }

export type Binder<T> = (user: SessionUser) => Promise<T | Response>

export type Bound<T> = { session: AppSession; bound: T }

export async function requireBound<T>(request: Request, binder: Binder<T>, bridge: BridgeDeps): Promise<Bound<T> | Response> {
  const holder: { bound?: T } = {}
  const session = await requireSession(
    request,
    {
      ...BOUND_SESSION,
      afterAuthentication: async (user) => {
        const outcome = await binder(user)
        if (outcome instanceof Response) return outcome
        holder.bound = outcome
        return null
      },
    },
    bridge,
  )
  if (session instanceof Response) return session
  return { session, bound: holder.bound as T }
}
