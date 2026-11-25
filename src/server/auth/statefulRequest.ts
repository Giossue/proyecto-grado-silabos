import "server-only"
import { eligibleAssignments, isEligible } from "./activeRole"
import { inputCsrfToken, isStateful, passesCsrf } from "./requireSession"
import {
  collectGarbage,
  encryptCookieValue,
  migrateSession,
  regenerateToken,
  saveSession,
  serializeCookie,
  sessionCookie,
  setCookieHeader,
  startSession,
  xsrfCookie,
  type SessionState,
  type SessionWriterDeps,
} from "./sessionWriter"
import type { AppSession, RoleAssignmentRecord, SessionUser } from "./types"
import { parseCookieHeader } from "../http/cookies"
import { requestFullUrl } from "../http/request"
import { jsonError, serverError, unauthenticated } from "../http/responses"
import { httpError } from "../http/router"
import { forgetRecallerCookie, recallUser } from "./recaller"
import { controllerJson, emptyResponse, fromController } from "./controllerResponse"
import { hashPasswordForCookie, loginSessionKey, passwordHashSessionKey, recallerCookieName } from "../http/sessionGuard"
import { timingSafeEqual } from "node:crypto"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROLE_KEY = "active_role_assignment_id"
const REMEMBER_MINUTES = 576000
const REMEMBER_TOKEN_LENGTH = 60

export type Outcome = Response

export type StatefulOptions = { group: "web" | "api"; routeName?: string; authenticates?: boolean }

export { controllerJson, emptyResponse, fromController }

function sameHash(known: string, given: string): boolean {
  const left = Buffer.from(known)
  const right = Buffer.from(given)
  return left.length === right.length && timingSafeEqual(left, right)
}

export class StatefulContext {
  user: SessionUser | null
  readonly queued: string[] = []
  private cachedRole: RoleAssignmentRecord | null = null

  constructor(
    readonly request: Request,
    readonly state: SessionState,
    readonly deps: SessionWriterDeps,
    user: SessionUser | null,
  ) {
    this.user = user
  }

  get attributes(): Record<string, unknown> {
    return this.state.attributes
  }

  async login(user: SessionUser): Promise<void> {
    this.state.attributes[loginSessionKey()] = user.id
    await migrateSession(this.state, true, this.deps)
    regenerateToken(this.state, this.deps)
    if (user.passwordHash !== "") this.state.attributes[passwordHashSessionKey] = hashPasswordForCookie(user.passwordHash, this.deps.config.appKey)
    this.user = user
    this.cachedRole = null
  }

  logout(): void {
    delete this.state.attributes[loginSessionKey()]
    this.user = null
    this.cachedRole = null
  }

  async eligibleRoles(): Promise<RoleAssignmentRecord[]> {
    if (this.user === null || !this.user.active) return []
    return eligibleAssignments(await this.deps.store.effectiveRoleAssignments(this.user.id))
  }

  async activeRole(): Promise<RoleAssignmentRecord | null> {
    if (this.cachedRole !== null) return this.cachedRole
    if (this.user === null || !this.user.active) return null
    const assignmentId = this.state.attributes[ROLE_KEY]
    if (typeof assignmentId === "string") {
      const current = (await this.deps.store.effectiveRoleAssignments(this.user.id)).find((assignment) => assignment.id === assignmentId)
      if (current && isEligible(current)) return (this.cachedRole = current)
      delete this.state.attributes[ROLE_KEY]
    }
    const eligible = await this.eligibleRoles()
    if (eligible.length !== 1) return null
    this.state.attributes[ROLE_KEY] = eligible[0].id
    return (this.cachedRole = eligible[0])
  }

  queueRecaller(user: SessionUser, token: string): void {
    const name = recallerCookieName()
    const now = this.deps.now()
    const value = encryptCookieValue(name, `${user.id}|${token}|${hashPasswordForCookie(user.passwordHash, this.deps.config.appKey)}`, this.deps)
    this.queued.push(setCookieHeader(name, value, this.deps.cookie, now + REMEMBER_MINUTES * 60, true, now))
  }

  forgetRecaller(): void {
    this.queued.push(...forgetRecaller(parseCookieHeader(this.request.headers.get("cookie")), this.deps))
  }

  rememberRole(assignment: RoleAssignmentRecord | null): void {
    this.cachedRole = assignment
  }

  async session(): Promise<AppSession | null> {
    if (this.user === null) return null
    const activeRole = await this.activeRole()
    return { user: this.user, activeRole, eligibleRoles: await this.eligibleRoles(), attributes: this.state.attributes }
  }
}

function storesCurrentUrl(request: Request): boolean {
  const prefetch = ["purpose", "sec-purpose", "x-moz"].some((name) => request.headers.get(name)?.toLowerCase() === "prefetch")
  return request.method === "GET" && request.headers.get("x-requested-with") !== "XMLHttpRequest" && !prefetch
}

function putPrevious(attributes: Record<string, unknown>, url: string, route: string): void {
  const previous = typeof attributes._previous === "object" && attributes._previous !== null && !Array.isArray(attributes._previous) ? (attributes._previous as Record<string, unknown>) : {}
  previous.url = url
  previous.route = route
  attributes._previous = previous
}

function withCookies(response: Response, cookies: string[]): Response {
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie)
  return response
}

export async function statefulRequest(
  request: Request,
  deps: SessionWriterDeps,
  options: StatefulOptions,
  handler: (context: StatefulContext) => Promise<Outcome>,
  stateless: () => Response | Promise<Response> = unauthenticated,
): Promise<Response> {
  if (options.group === "api" && !isStateful(request, deps.config.statefulDomains)) return stateless()
  const fullUrl = requestFullUrl(request)
  const cookies = parseCookieHeader(request.headers.get("cookie"))
  const state = await startSession(cookies.get(deps.config.cookieName), deps)
  const loginId = state.attributes[loginSessionKey()]
  let user = typeof loginId === "string" && UUID.test(loginId) ? await deps.store.findUser(loginId) : null
  if (!passesCsrf(request, state.attributes, deps, await inputCsrfToken(request))) {
    await collectGarbage(deps)
    await saveSession(state, request, user?.id ?? null, deps)
    return withCookies(jsonError(419, "CSRF token mismatch."), [sessionCookie(state, deps)])
  }
  const finish = async (outcome: Response, guardId: string | null, extra: string[] = []): Promise<Response> => {
    await collectGarbage(deps)
    const xsrf = xsrfCookie(state, deps)
    await saveSession(state, request, guardId, deps)
    return withCookies(outcome, [xsrf, sessionCookie(state, deps), ...extra])
  }
  if (user === null && cookies.has(recallerCookieName())) {
    const recalled = await recallUser(cookies, deps)
    if (recalled.kind === "invalid-id") return finish(options.group === "api" ? serverError() : httpError(request, 500), null)
    if (recalled.kind === "user") {
      user = recalled.user
      state.attributes[loginSessionKey()] = user.id
      await migrateSession(state, true, deps)
    }
  }
  if (user !== null && options.group === "api") {
    const stored = state.attributes[passwordHashSessionKey]
    const validHash =
      stored === undefined ||
      stored === null ||
      (typeof stored === "string" && (sameHash(hashPasswordForCookie(user.passwordHash, deps.config.appKey), stored) || sameHash(user.passwordHash, stored)))
    if (!validHash) {
      state.attributes = {}
      return finish(unauthenticated(), null, forgetRecaller(cookies, deps))
    }
  }
  if (user !== null && !user.active) {
    const extra = forgetRecaller(cookies, deps)
    delete state.attributes[loginSessionKey()]
    if (user.rememberToken !== undefined && user.rememberToken !== null && user.rememberToken !== "") await deps.store.cycleRememberToken(user.id, deps.random(REMEMBER_TOKEN_LENGTH))
    state.attributes = {}
    await migrateSession(state, true, deps)
    regenerateToken(state, deps)
    return finish(httpError(request, 403, "La cuenta está desactivada."), null, extra)
  }
  const context = new StatefulContext(request, state, deps, user)
  const outcome = await handler(context)
  if (options.group === "api" && context.user !== null) {
    state.attributes[passwordHashSessionKey] = hashPasswordForCookie(context.user.passwordHash, deps.config.appKey)
  }
  if (options.routeName && storesCurrentUrl(request)) putPrevious(state.attributes, fullUrl, options.routeName)
  const guardId = options.authenticates && user !== null ? user.id : (context.user?.id ?? null)
  return finish(outcome, guardId, context.queued)
}

function forgetRecaller(cookies: Map<string, string>, deps: SessionWriterDeps): string[] {
  if (!cookies.has(recallerCookieName())) return []
  return [serializeCookie(forgetRecallerCookie(deps.cookie, deps.now(), encryptCookieValue(recallerCookieName(), "", deps)))]
}
