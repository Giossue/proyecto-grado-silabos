import "server-only"
import { createSessionStore } from "./store"
import { resolveActiveRole, eligibleAssignments } from "./activeRole"
import { sharedAuth, sessionLifetimeMinutes, INACTIVE_ACCOUNT } from "./betterAuth"
import { fromController } from "./controllerResponse"
import { queueResponseCookies } from "./cookieQueue"
import { betterAuthSessions } from "./sessionGateway"
import type { AppSession, BridgeConfig, BridgeDeps, ResolvedSession, SessionRequirements, SessionUser } from "./types"
import { appKey } from "../http/config"
import { parseAppKey } from "../http/encrypter"
import { expectsJson } from "../http/request"
import { jsonError, serverError, unauthenticated } from "../http/responses"

export const ROLE_REQUIRED = "Seleccione un rol vigente."

export async function authenticate(request: Request, requirements: SessionRequirements, deps: BridgeDeps): Promise<{ outcome: AppSession | Response; cookies: string[] }> {
  if (!(await deps.sessions.fromWebApp(request))) return { outcome: unauthenticated(), cookies: [] }
  const session = await deps.sessions.resolve(request)
  if (session === null) return { outcome: unauthenticated(), cookies: [] }
  const finish = (outcome: AppSession | Response) => ({ outcome, cookies: session.cookies })
  const user = await deps.store.findUser(session.userId)
  if (user === null) return finish(unauthenticated())

  const early = requirements.afterAuthentication ? await requirements.afterAuthentication(user) : null
  if (early) return finish(early)

  if (!user.active) {
    await deps.sessions.revokeUser(user.id)
    return { outcome: jsonError(403, INACTIVE_ACCOUNT), cookies: [] }
  }

  if (requirements.verified && user.emailVerifiedAt === null) {
    return finish(fromController(expectsJson(request) ? jsonError(403, "Your email address is not verified.") : serverError()))
  }

  if (!requirements.activeRole) return finish({ user, activeRole: null, eligibleRoles: [], session })
  const established = await establish(session, user, deps)
  if (requirements.activeRole === "required" && established.activeRole === null) return finish(fromController(jsonError(409, ROLE_REQUIRED)))
  return finish(established)
}

export async function establish(session: ResolvedSession, user: SessionUser, deps: BridgeDeps): Promise<AppSession> {
  const eligibleRoles = eligibleAssignments(await deps.store.effectiveRoleAssignments(user.id))
  const resolution = resolveActiveRole(session.activeRoleAssignmentId ?? undefined, eligibleRoles)
  if (resolution.writesSession) await deps.sessions.setActiveRole(session, resolution.assignment?.id ?? null)
  return { user, activeRole: resolution.assignment, eligibleRoles, session }
}

let cachedConfig: BridgeConfig | null = null

export function sessionConfig(): BridgeConfig {
  if (cachedConfig) return cachedConfig
  cachedConfig = { key: parseAppKey(appKey()), lifetimeMinutes: sessionLifetimeMinutes() }
  return cachedConfig
}

export function defaultBridgeDeps(): BridgeDeps {
  return {
    store: createSessionStore(),
    sessions: betterAuthSessions(sharedAuth),
    config: sessionConfig(),
    now: () => Math.floor(Date.now() / 1000),
  }
}

export async function requireSession(
  request: Request,
  requirements: SessionRequirements = {},
  deps: BridgeDeps = defaultBridgeDeps(),
): Promise<AppSession | Response> {
  const { outcome, cookies } = await authenticate(request, requirements, deps)
  await (deps.queueCookies ?? queueResponseCookies)(cookies)
  return outcome
}
