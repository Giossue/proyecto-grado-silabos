import "server-only"
import { createSessionStore } from "./store"
import { resolveActiveRole, eligibleAssignments, type ActiveRoleResolution } from "./activeRole"
import { fromController } from "./controllerResponse"
import { queueResponseCookies } from "./cookieQueue"
import {
  collectGarbage,
  encryptCookieValue,
  invalidateSession,
  migrateSession,
  openSession,
  regenerateSession,
  regenerateToken,
  saveSession,
  sessionCookieOf,
  withWriter,
  writerDepsOf,
  xsrfCookieOf,
  type SessionState,
  type SessionWriterDeps,
} from "./sessionWriter"
import type { BridgeDeps, AppSession, OutgoingCookie, SessionRequirements, SessionUser } from "./types"
import { forgetRecallerCookie, recallUser } from "./recaller"
import { sessionConfig } from "../http/config"
import { parseCookieHeader, removeCookiePrefix } from "../http/cookies"
import { DecryptError, decrypt } from "../http/encrypter"
import { expectsJson } from "../http/request"
import { isPhpArray, requestInput, type PhpValue } from "../http/input"
import { jsonError, serverError, unauthenticated } from "../http/responses"
import { hashPasswordForCookie, loginSessionKey, passwordHashSessionKey, recallerCookieName } from "../http/sessionGuard"
import { timingSafeEqual } from "node:crypto"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const READING_METHODS = ["GET", "HEAD", "OPTIONS"]
const REMEMBER_TOKEN_LENGTH = 60

function hashEquals(known: string, given: string): boolean {
  const left = Buffer.from(known)
  const right = Buffer.from(given)
  return left.length === right.length && timingSafeEqual(left, right)
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/\\\*/g, ".*")
  return new RegExp(`^${escaped}$`, "u")
}

export function isStateful(request: Request, domains: string[]): boolean {
  const source = request.headers.get("referer") || request.headers.get("origin")
  if (!source) return false
  let domain = source.replace("https://", "").replace("http://", "")
  if (!domain.endsWith("/")) domain += "/"
  return domains.some((uri) => globToRegExp(`${uri.trim()}/*`).test(domain))
}

function phpTruthy(value: PhpValue | undefined): boolean {
  if (value === undefined || value === null || value === false || value === "" || value === "0" || value === 0) return false
  return !(isPhpArray(value) && Object.keys(value).length === 0)
}

export async function inputCsrfToken(request: Request): Promise<PhpValue | undefined> {
  if (READING_METHODS.includes(request.method)) return undefined
  return (await requestInput(request.clone()))._token
}

function requestCsrfToken(request: Request, deps: BridgeDeps, inputToken: PhpValue | undefined): PhpValue | null {
  if (phpTruthy(inputToken)) return inputToken as PhpValue
  const plain = request.headers.get("x-csrf-token")
  if (plain) return plain
  const encrypted = request.headers.get("x-xsrf-token")
  if (!encrypted) return null
  try {
    return removeCookiePrefix(decrypt(encrypted, deps.config.key, false))
  } catch (error) {
    if (error instanceof DecryptError) return ""
    throw error
  }
}

export function passesCsrf(request: Request, attributes: Record<string, unknown>, deps: BridgeDeps, inputToken?: PhpValue): boolean {
  if (READING_METHODS.includes(request.method)) return true
  if (request.headers.get("sec-fetch-site") === "same-origin") return true
  const sessionToken = attributes._token
  const token = requestCsrfToken(request, deps, inputToken)
  return typeof sessionToken === "string" && typeof token === "string" && hashEquals(sessionToken, token)
}

type Tracking = {
  state: SessionState
  live: boolean
  dirty: boolean
  guardId: string | null
  user: SessionUser | null
  storesHash: boolean
  csrfFailed: boolean
  writer: SessionWriterDeps
  extraCookies: OutgoingCookie[]
}

export type Authentication = { outcome: AppSession | Response; touch: string | null; tracking: Tracking | null }

export async function authenticateAndTrack(request: Request, requirements: SessionRequirements, deps: BridgeDeps): Promise<Authentication> {
  if (!isStateful(request, deps.config.statefulDomains)) return { outcome: unauthenticated(), touch: null, tracking: null }
  const writer = writerDepsOf(deps)
  const cookies = parseCookieHeader(request.headers.get("cookie"))
  const { state, live, regenerated } = await openSession(cookies.get(deps.config.cookieName), writer)
  const login = state.attributes[loginSessionKey()]
  const tracking: Tracking = {
    state,
    live,
    dirty: !live || regenerated,
    guardId: typeof login === "string" ? login : null,
    user: null,
    storesHash: false,
    csrfFailed: false,
    writer,
    extraCookies: [],
  }
  if (!passesCsrf(request, state.attributes, deps, await inputCsrfToken(request))) {
    tracking.csrfFailed = true
    return { outcome: jsonError(419, "CSRF token mismatch."), touch: null, tracking }
  }
  const outcome = await resolveUser(request, requirements, deps, cookies, tracking)
  if (tracking.user !== null && tracking.storesHash) {
    const hash = hashPasswordForCookie(tracking.user.passwordHash, deps.config.appKey)
    if (tracking.state.attributes[passwordHashSessionKey] !== hash) {
      tracking.state.attributes[passwordHashSessionKey] = hash
      tracking.dirty = true
    }
  }
  return { outcome, touch: tracking.live ? tracking.state.id : null, tracking }
}

function applyRoleResolution(attributes: Record<string, unknown>, resolution: ActiveRoleResolution): void {
  if (typeof attributes.active_role_assignment_id === "string") delete attributes.active_role_assignment_id
  if (resolution.assignment !== null) attributes.active_role_assignment_id = resolution.assignment.id
}

async function logoutInactive(user: SessionUser, tracking: Tracking, deps: BridgeDeps, cookies: Map<string, string>): Promise<void> {
  if (cookies.has(recallerCookieName())) {
    tracking.extraCookies.push(forgetRecallerCookie(tracking.writer.cookie, deps.now(), encryptCookieValue(recallerCookieName(), "", deps)))
  }
  await deps.store.cycleRememberToken(user.id, tracking.writer.random(REMEMBER_TOKEN_LENGTH))
  await invalidateSession(tracking.state, tracking.writer)
  regenerateToken(tracking.state, tracking.writer)
  tracking.live = false
  tracking.dirty = true
}

async function resolveUser(
  request: Request,
  requirements: SessionRequirements,
  deps: BridgeDeps,
  cookies: Map<string, string>,
  tracking: Tracking,
): Promise<AppSession | Response> {
  const userId = tracking.state.attributes[loginSessionKey()]
  let user = typeof userId === "string" && UUID.test(userId) ? await deps.store.findUser(userId) : null
  if (!user && cookies.has(recallerCookieName())) {
    const recalled = await recallUser(cookies, deps)
    if (recalled.kind === "invalid-id") return serverError()
    if (recalled.kind === "user") {
      user = recalled.user
      tracking.state.attributes[loginSessionKey()] = user.id
      await migrateSession(tracking.state, true, tracking.writer)
      tracking.dirty = true
    }
  }
  if (!user) {
    tracking.guardId = null
    return unauthenticated()
  }
  const { attributes } = tracking.state

  const storedHash = attributes[passwordHashSessionKey]
  const validHash =
    storedHash === undefined ||
    storedHash === null ||
    (typeof storedHash === "string" &&
      (hashEquals(hashPasswordForCookie(user.passwordHash, deps.config.appKey), storedHash) || hashEquals(user.passwordHash, storedHash)))
  if (!validHash) {
    tracking.state.attributes = {}
    tracking.dirty = true
    tracking.guardId = null
    return unauthenticated()
  }
  tracking.user = user
  tracking.guardId = user.id
  tracking.storesHash = true

  const early = requirements.afterAuthentication ? await requirements.afterAuthentication(user) : null
  if (early) return early

  if (!user.active) {
    tracking.storesHash = false
    await logoutInactive(user, tracking, deps, cookies)
    return jsonError(403, "La cuenta está desactivada.")
  }

  if (requirements.verified && user.emailVerifiedAt === null) {
    return fromController(expectsJson(request) ? jsonError(403, "Your email address is not verified.") : serverError())
  }

  if (!requirements.activeRole) return { user, activeRole: null, eligibleRoles: [], attributes }
  const eligibleRoles = eligibleAssignments(await deps.store.effectiveRoleAssignments(user.id))
  const resolution = resolveActiveRole(attributes.active_role_assignment_id, eligibleRoles)
  if (resolution.writesSession) {
    applyRoleResolution(attributes, resolution)
    tracking.dirty = true
  }
  if (requirements.activeRole === "required" && resolution.assignment === null) {
    return fromController(jsonError(409, "Seleccione un rol vigente."))
  }
  return { user, activeRole: resolution.assignment, eligibleRoles, attributes }
}

export async function commitTracking(authentication: Authentication, request: Request, deps: BridgeDeps): Promise<void> {
  const { tracking } = authentication
  if (tracking === null) return
  const { state, writer } = tracking
  await collectGarbage(writer)
  if (tracking.dirty) await saveSession(state, request, tracking.guardId, deps)
  else await deps.store.touchSession(state.id, deps.now())
  const cookies = tracking.csrfFailed ? [sessionCookieOf(state, writer)] : [xsrfCookieOf(state, writer), sessionCookieOf(state, writer), ...tracking.extraCookies]
  await (deps.queueCookies ?? queueResponseCookies)(cookies)
}

export async function authenticate(
  request: Request,
  requirements: SessionRequirements,
  deps: BridgeDeps,
): Promise<AppSession | Response> {
  return (await authenticateAndTrack(request, requirements, deps)).outcome
}

export function defaultBridgeDeps(): BridgeDeps {
  return withWriter({
    store: createSessionStore(),
    config: sessionConfig(),
    now: () => Math.floor(Date.now() / 1000),
  })
}

export async function requireSession(
  request: Request,
  requirements: SessionRequirements = {},
  deps: BridgeDeps = defaultBridgeDeps(),
): Promise<AppSession | Response> {
  const authentication = await authenticateAndTrack(request, requirements, deps)
  await commitTracking(authentication, request, deps)
  return authentication.outcome
}

export type SessionMutation = {
  put(key: string, value: unknown): void
  regenerate(): Promise<void>
}

export async function requireSessionWith(
  request: Request,
  requirements: SessionRequirements,
  deps: BridgeDeps,
  work: (session: AppSession, mutation: SessionMutation) => Promise<Response>,
): Promise<Response> {
  const authentication = await authenticateAndTrack(request, requirements, deps)
  const { outcome, tracking } = authentication
  if (outcome instanceof Response || tracking === null) {
    await commitTracking(authentication, request, deps)
    return outcome instanceof Response ? outcome : work(outcome, { put: () => undefined, regenerate: async () => undefined })
  }
  const mutation: SessionMutation = {
    put(key, value) {
      tracking.state.attributes[key] = value
      tracking.dirty = true
    },
    async regenerate() {
      await regenerateSession(tracking.state, tracking.writer)
      tracking.dirty = true
    },
  }
  const response = await work(outcome, mutation)
  await commitTracking(authentication, request, deps)
  return response
}
