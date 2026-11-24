import "server-only"
import { eligibleAssignments, isEligible } from "./activeRole"
import { isStateful, passesCsrf } from "./requireSession"
import {
  collectGarbage,
  encryptCookieValue,
  migrateSession,
  regenerateToken,
  saveSession,
  sessionCookie,
  setCookieHeader,
  startSession,
  xsrfCookie,
  type SessionState,
  type SessionWriterDeps,
} from "./sessionWriter"
import type { LaravelSession, RoleAssignmentRecord, SessionUser } from "./types"
import { parseCookieHeader } from "../laravel/cookies"
import { laravelRoot } from "../laravel/request"
import { laravelHttpError, laravelJson, unauthenticated } from "../laravel/responses"
import { hashPasswordForCookie, loginSessionKey, passwordHashSessionKey, recallerCookieName } from "../laravel/sessionGuard"
import { timingSafeEqual } from "node:crypto"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROLE_KEY = "active_role_assignment_id"
const REMEMBER_MINUTES = 576000

export const FORWARD = Symbol("forward")
export type Outcome = Response | typeof FORWARD

export type StatefulOptions = { group: "web" | "api"; routeName?: string; authenticates?: boolean }

const CONTROLLER_HEADERS = [...laravelJson(null).headers].filter(([name]) => !["content-type", "cache-control"].includes(name))

export function fromController(response: Response): Response {
  for (const [name, value] of CONTROLLER_HEADERS) response.headers.set(name, value)
  return response
}

export function controllerJson(payload: unknown, status = 200): Response {
  return fromController(laravelJson(payload, status))
}

export function emptyResponse(status = 204): Response {
  return fromController(new Response(null, { status, headers: { "Cache-Control": "no-cache, private" } }))
}

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

  rememberRole(assignment: RoleAssignmentRecord | null): void {
    this.cachedRole = assignment
  }

  async session(): Promise<LaravelSession | null> {
    if (this.user === null) return null
    const activeRole = await this.activeRole()
    return { user: this.user, activeRole, eligibleRoles: await this.eligibleRoles(), attributes: this.state.attributes }
  }
}

function previousUrl(request: Request): string {
  return `${laravelRoot(request)}${new URL(request.url).pathname.replace(/\/+$/, "")}`
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
  const original = request.clone()
  if (options.group === "api" && !isStateful(request, deps.config.statefulDomains)) return stateless()
  if (request.method === "GET" && new URL(request.url).search !== "") return deps.forward(original)
  const cookies = parseCookieHeader(request.headers.get("cookie"))
  const state = await startSession(cookies.get(deps.config.cookieName), deps)
  const loginId = state.attributes[loginSessionKey()]
  const user = typeof loginId === "string" && UUID.test(loginId) ? await deps.store.findUser(loginId) : null
  if (!passesCsrf(request, state.attributes, deps)) {
    await collectGarbage(deps)
    await saveSession(state, request, user?.id ?? null, deps)
    return withCookies(laravelHttpError(419, "CSRF token mismatch."), [sessionCookie(state, deps)])
  }
  if (user === null && cookies.has(recallerCookieName())) return deps.forward(original)
  if (user !== null) {
    const stored = state.attributes[passwordHashSessionKey]
    const validHash =
      options.group === "web" ||
      stored === undefined ||
      stored === null ||
      (typeof stored === "string" && (sameHash(hashPasswordForCookie(user.passwordHash, deps.config.appKey), stored) || sameHash(user.passwordHash, stored)))
    if (!validHash || !user.active) return deps.forward(original)
  }
  const context = new StatefulContext(request, state, deps, user)
  const outcome = await handler(context)
  if (outcome === FORWARD) return deps.forward(original)
  await collectGarbage(deps)
  if (options.group === "api" && context.user !== null) {
    state.attributes[passwordHashSessionKey] = hashPasswordForCookie(context.user.passwordHash, deps.config.appKey)
  }
  const xsrf = xsrfCookie(state, deps)
  if (options.routeName && storesCurrentUrl(request)) putPrevious(state.attributes, previousUrl(request), options.routeName)
  const guardId = options.authenticates && user !== null ? user.id : (context.user?.id ?? null)
  await saveSession(state, request, guardId, deps)
  return withCookies(outcome, [xsrf, sessionCookie(state, deps), ...context.queued])
}
