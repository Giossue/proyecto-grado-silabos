import "server-only"
import { createSessionStore } from "./store"
import { resolveActiveRole, eligibleAssignments, type ActiveRoleResolution } from "./activeRole"
import { saveSession } from "./sessionWriter"
import type { BridgeDeps, LaravelSession, SessionRequirements, SessionStore, SessionUser } from "./types"
import { laravelBridgeConfig } from "../laravel/config"
import { parseCookieHeader, removeCookiePrefix, stripValidCookiePrefix } from "../laravel/cookies"
import { DecryptError, decrypt } from "../laravel/encrypter"
import { proxyToLaravel } from "../laravel/proxy"
import { expectsJson } from "../laravel/request"
import { laravelHttpError, unauthenticated } from "../laravel/responses"
import { hashPasswordForCookie, loginSessionKey, passwordHashSessionKey, recallerCookieName } from "../laravel/sessionGuard"
import { timingSafeEqual } from "node:crypto"

const SESSION_ID = /^[A-Za-z0-9]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const READING_METHODS = ["GET", "HEAD", "OPTIONS"]

type Deferred = { deferred: true }
const DEFER: Deferred = { deferred: true }

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

function decryptCookie(name: string, value: string | undefined, deps: BridgeDeps): string | null {
  if (value === undefined) return null
  try {
    return stripValidCookiePrefix(name, decrypt(value, deps.config.key, false), deps.config.key)
  } catch (error) {
    if (error instanceof DecryptError) return null
    throw error
  }
}

type SessionRead = { attributes: Record<string, unknown>; liveId: string | null }

async function readSession(sessionId: string | null, store: SessionStore, deps: BridgeDeps): Promise<SessionRead> {
  const none: SessionRead = { attributes: {}, liveId: null }
  if (sessionId === null || !SESSION_ID.test(sessionId)) return none
  const row = await store.findSession(sessionId)
  if (!row || row.lastActivity < deps.now() - deps.config.lifetimeMinutes * 60) return none
  let json: string
  try {
    json = decrypt(Buffer.from(row.payload, "base64").toString("utf8"), deps.config.key, true)
  } catch (error) {
    if (error instanceof DecryptError) return none
    throw error
  }
  try {
    const data: unknown = JSON.parse(json)
    if (typeof data !== "object" || data === null || Array.isArray(data)) return none
    return { attributes: data as Record<string, unknown>, liveId: sessionId }
  } catch {
    return none
  }
}

function requestCsrfToken(request: Request, deps: BridgeDeps): string | null {
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

export function passesCsrf(request: Request, attributes: Record<string, unknown>, deps: BridgeDeps): boolean {
  if (READING_METHODS.includes(request.method)) return true
  if (request.headers.get("sec-fetch-site") === "same-origin") return true
  const sessionToken = attributes._token
  const token = requestCsrfToken(request, deps)
  return typeof sessionToken === "string" && typeof token === "string" && hashEquals(sessionToken, token)
}

type Pending = { user: SessionUser | null; attributes: Record<string, unknown>; storesHash: boolean; dirty: boolean }

export type Authentication = { outcome: LaravelSession | Response | Deferred; touch: string | null; pending: Pending | null }

export async function authenticateAndTrack(request: Request, requirements: SessionRequirements, deps: BridgeDeps): Promise<Authentication> {
  if (!isStateful(request, deps.config.statefulDomains)) return { outcome: unauthenticated(), touch: null, pending: null }
  const cookies = parseCookieHeader(request.headers.get("cookie"))
  const sessionId = decryptCookie(deps.config.cookieName, cookies.get(deps.config.cookieName), deps)
  const { attributes, liveId } = await readSession(sessionId, deps.store, deps)
  if (!passesCsrf(request, attributes, deps)) return { outcome: laravelHttpError(419, "CSRF token mismatch."), touch: null, pending: null }
  const pending: Pending = { user: null, attributes, storesHash: false, dirty: false }
  const outcome = await resolveUser(request, requirements, deps, cookies, pending)
  if ("deferred" in outcome || pending.user === null || !pending.storesHash) return { outcome, touch: liveId, pending: pending.dirty ? pending : null }
  const hash = hashPasswordForCookie(pending.user.passwordHash, deps.config.appKey)
  if (attributes[passwordHashSessionKey] !== hash) {
    attributes[passwordHashSessionKey] = hash
    pending.dirty = true
  }
  return { outcome, touch: liveId, pending: pending.dirty ? pending : null }
}

function applyRoleResolution(attributes: Record<string, unknown>, resolution: ActiveRoleResolution): void {
  if (typeof attributes.active_role_assignment_id === "string") delete attributes.active_role_assignment_id
  if (resolution.assignment !== null) attributes.active_role_assignment_id = resolution.assignment.id
}

async function resolveUser(
  request: Request,
  requirements: SessionRequirements,
  deps: BridgeDeps,
  cookies: Map<string, string>,
  pending: Pending,
): Promise<LaravelSession | Response | Deferred> {
  const { attributes } = pending
  const userId = attributes[loginSessionKey()]
  const user = typeof userId === "string" && UUID.test(userId) ? await deps.store.findUser(userId) : null
  if (!user) return cookies.has(recallerCookieName()) ? DEFER : unauthenticated()

  const storedHash = attributes[passwordHashSessionKey]
  const validHash =
    storedHash === undefined ||
    storedHash === null ||
    (typeof storedHash === "string" &&
      (hashEquals(hashPasswordForCookie(user.passwordHash, deps.config.appKey), storedHash) || hashEquals(user.passwordHash, storedHash)))
  if (!validHash) return unauthenticated()
  pending.user = user
  pending.storesHash = true

  const early = requirements.afterAuthentication ? await requirements.afterAuthentication(user) : null
  if (early) return early

  if (!user.active) {
    pending.storesHash = false
    return laravelHttpError(403, "La cuenta está desactivada.")
  }

  if (requirements.verified && user.emailVerifiedAt === null) {
    return expectsJson(request) ? laravelHttpError(403, "Your email address is not verified.") : DEFER
  }

  if (!requirements.activeRole) return { user, activeRole: null, eligibleRoles: [], attributes }
  const eligibleRoles = eligibleAssignments(await deps.store.effectiveRoleAssignments(user.id))
  const resolution = resolveActiveRole(attributes.active_role_assignment_id, eligibleRoles)
  if (resolution.writesSession) {
    applyRoleResolution(attributes, resolution)
    pending.dirty = true
  }
  if (requirements.activeRole === "required" && resolution.assignment === null) {
    return laravelHttpError(409, "Seleccione un rol vigente.")
  }
  return { user, activeRole: resolution.assignment, eligibleRoles, attributes }
}

export async function commitTracking(authentication: Authentication, request: Request, deps: BridgeDeps): Promise<void> {
  const { touch, pending } = authentication
  if (touch === null) return
  if (pending === null) return deps.store.touchSession(touch, deps.now())
  await saveSession({ id: touch, attributes: pending.attributes, exists: true }, request, pending.user?.id ?? null, deps)
}

export async function authenticate(
  request: Request,
  requirements: SessionRequirements,
  deps: BridgeDeps,
): Promise<LaravelSession | Response | Deferred> {
  return (await authenticateAndTrack(request, requirements, deps)).outcome
}

export function defaultBridgeDeps(): BridgeDeps {
  return {
    store: createSessionStore(),
    config: laravelBridgeConfig(),
    now: () => Math.floor(Date.now() / 1000),
    forward: proxyToLaravel,
  }
}

export async function requireSession(
  request: Request,
  requirements: SessionRequirements = {},
  deps: BridgeDeps = defaultBridgeDeps(),
): Promise<LaravelSession | Response> {
  const authentication = await authenticateAndTrack(request, requirements, deps)
  if ("deferred" in authentication.outcome) return deps.forward(request)
  await commitTracking(authentication, request, deps)
  return authentication.outcome
}
