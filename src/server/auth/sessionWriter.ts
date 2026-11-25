import "server-only"
import { randomBytes, randomInt } from "node:crypto"
import { cookiePrefix } from "../http/cookies"
import { decrypt, DecryptError, encrypt } from "../http/encrypter"
import type { BridgeDeps, OutgoingCookie, StoredSession } from "./types"

export const SESSION_ID_LENGTH = 40
const SESSION_ID = /^[A-Za-z0-9]{40}$/
const XSRF_COOKIE = "XSRF-TOKEN"
const LOTTERY = [2, 100] as const

export type CookieOptions = { path: string; domain: string | null; secure: boolean; sameSite: string }

export type SessionWriterDeps = BridgeDeps & {
  cookie: CookieOptions
  random: (length: number) => string
  lottery: () => boolean
}

export type SessionState = { id: string; attributes: Record<string, unknown>; exists: boolean }

export function sessionRandom(length: number): string {
  let result = ""
  while (result.length < length) {
    const size = length - result.length
    result += randomBytes(Math.ceil(size / 3) * 3)
      .toString("base64")
      .replace(/[/+=]/g, "")
      .slice(0, size)
  }
  return result
}

export function sessionCookieOptions(env: NodeJS.ProcessEnv = process.env): CookieOptions {
  const secure = env.SESSION_SECURE_COOKIE
  return {
    path: env.SESSION_PATH || "/",
    domain: env.SESSION_DOMAIN && env.SESSION_DOMAIN !== "null" ? env.SESSION_DOMAIN : null,
    secure: secure === undefined || secure === "" ? env.APP_ENV === "production" : ["true", "1", "(true)"].includes(secure.toLowerCase()),
    sameSite: "lax",
  }
}

export function withWriter(bridge: BridgeDeps): SessionWriterDeps {
  return {
    ...bridge,
    cookie: sessionCookieOptions(),
    random: sessionRandom,
    lottery: () => randomInt(1, LOTTERY[1] + 1) <= LOTTERY[0],
  }
}

export function phpArrayCast(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(phpArrayCast)
  if (typeof value !== "object" || value === null) return value
  const entries = Object.entries(value)
  if (entries.every(([key], index) => key === String(index))) return entries.map(([, item]) => phpArrayCast(item))
  return Object.fromEntries(entries.map(([key, item]) => [key, phpArrayCast(item)]))
}

export function sessionIdFromCookie(value: string | undefined, deps: Pick<BridgeDeps, "config">): string | null {
  if (value === undefined) return null
  try {
    const plain = decrypt(value, deps.config.key, false)
    const prefix = cookiePrefix(deps.config.cookieName, deps.config.key)
    return plain.startsWith(prefix) ? plain.slice(prefix.length) : null
  } catch (error) {
    if (error instanceof DecryptError) return null
    throw error
  }
}

function decodePayload(payload: string, deps: Pick<BridgeDeps, "config">): Record<string, unknown> {
  try {
    const data: unknown = JSON.parse(decrypt(Buffer.from(payload, "base64").toString("utf8"), deps.config.key, true))
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  } catch (error) {
    if (error instanceof DecryptError || error instanceof SyntaxError) return {}
    throw error
  }
}

export function encodePayload(json: string, deps: Pick<BridgeDeps, "config">): string {
  return Buffer.from(encrypt(json, deps.config.key, true)).toString("base64")
}

export type OpenedSession = { state: SessionState; live: boolean; regenerated: boolean }

export async function openSession(cookieValue: string | undefined, deps: SessionWriterDeps): Promise<OpenedSession> {
  const candidate = sessionIdFromCookie(cookieValue, deps)
  const id = candidate !== null && SESSION_ID.test(candidate) ? candidate : deps.random(SESSION_ID_LENGTH)
  const row = await deps.store.findSession(id)
  const state: SessionState = { id, attributes: {}, exists: row !== null }
  const live = row !== null && row.lastActivity >= deps.now() - deps.config.lifetimeMinutes * 60
  if (live) state.attributes = decodePayload(row.payload, deps)
  const regenerated = state.attributes._token === undefined || state.attributes._token === null
  if (regenerated) regenerateToken(state, deps)
  return { state, live, regenerated }
}

export async function startSession(cookieValue: string | undefined, deps: SessionWriterDeps): Promise<SessionState> {
  return (await openSession(cookieValue, deps)).state
}

export function regenerateToken(state: SessionState, deps: Pick<SessionWriterDeps, "random">): void {
  state.attributes._token = deps.random(SESSION_ID_LENGTH)
}

export async function migrateSession(state: SessionState, destroy: boolean, deps: SessionWriterDeps): Promise<void> {
  if (destroy) await deps.store.destroySession(state.id)
  state.exists = false
  state.id = deps.random(SESSION_ID_LENGTH)
}

export async function regenerateSession(state: SessionState, deps: SessionWriterDeps): Promise<void> {
  await migrateSession(state, false, deps)
  regenerateToken(state, deps)
}

export async function invalidateSession(state: SessionState, deps: SessionWriterDeps): Promise<void> {
  state.attributes = {}
  await migrateSession(state, true, deps)
}

function ageFlashData(attributes: Record<string, unknown>): void {
  const flash = typeof attributes._flash === "object" && attributes._flash !== null ? (attributes._flash as Record<string, unknown>) : null
  const old = flash?.old
  for (const key of Array.isArray(old) ? old : old && typeof old === "object" ? Object.values(old) : []) {
    if (typeof key === "string") delete attributes[key]
  }
  const fresh = flash?.new ?? []
  const next = flash ?? {}
  next.old = fresh
  next.new = []
  attributes._flash = next
}

export function sessionJson(attributes: Record<string, unknown>): string {
  ageFlashData(attributes)
  return JSON.stringify(phpArrayCast(attributes))
}

const DEFAULT_TRUSTED_PROXIES = "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

function ipv4Number(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null
  return parts.reduce((total, part) => total * 256 + Number(part), 0)
}

function matchesProxy(ip: string, proxy: string): boolean {
  const [network, bits] = proxy.split("/")
  if (bits === undefined) return ip === network
  const address = ipv4Number(ip)
  const base = ipv4Number(network)
  const size = Number(bits)
  if (address === null || base === null || !Number.isInteger(size) || size < 0 || size > 32) return false
  const block = 2 ** (32 - size)
  return Math.floor(address / block) === Math.floor(base / block)
}

export function clientIp(request: Request, trusted: string = process.env.TRUSTED_PROXIES ?? DEFAULT_TRUSTED_PROXIES): string | null {
  const proxies = trusted.split(",").map((proxy) => proxy.trim()).filter((proxy) => proxy !== "")
  const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",").map((ip) => ip.trim()).filter((ip) => ip !== "")
  const untrusted = forwarded.filter((ip) => !proxies.some((proxy) => matchesProxy(ip, proxy)))
  return untrusted.at(-1) ?? forwarded[0] ?? null
}

export function userAgentOf(request: Request): string {
  return Array.from(request.headers.get("user-agent") ?? "")
    .slice(0, 500)
    .join("")
}

export async function saveSession(state: SessionState, request: Request, userId: string | null, deps: BridgeDeps): Promise<void> {
  const row: StoredSession = {
    payload: encodePayload(sessionJson(state.attributes), deps),
    lastActivity: deps.now(),
    userId,
    ipAddress: clientIp(request),
    userAgent: userAgentOf(request),
  }
  if (!state.exists) state.exists = (await deps.store.findSession(state.id)) !== null
  if (state.exists || !(await deps.store.insertSession(state.id, row))) await deps.store.updateSession(state.id, row)
  state.exists = true
}

export async function collectGarbage(deps: SessionWriterDeps): Promise<void> {
  if (deps.lottery()) await deps.store.collectGarbage(deps.now() - deps.config.lifetimeMinutes * 60)
}

export function encryptCookieValue(name: string, value: string, deps: Pick<BridgeDeps, "config">): string {
  return encrypt(cookiePrefix(name, deps.config.key) + value, deps.config.key, false)
}

export function writerDepsOf(deps: BridgeDeps): SessionWriterDeps {
  if ("lottery" in deps && "random" in deps && "cookie" in deps) return deps as SessionWriterDeps
  return { ...deps, cookie: sessionCookieOptions(), random: sessionRandom, lottery: () => false }
}

export function setCookieHeader(name: string, encrypted: string, options: CookieOptions, expires: number, httpOnly: boolean, now: number): string {
  const parts = [`${name}=${encodeURIComponent(encrypted)}`, `expires=${new Date(expires * 1000).toUTCString()}`, `Max-Age=${expires - now}`]
  if (options.path) parts.push(`path=${options.path}`)
  if (options.domain) parts.push(`domain=${options.domain}`)
  if (options.secure) parts.push("secure")
  if (httpOnly) parts.push("httponly")
  parts.push(`samesite=${options.sameSite}`)
  return parts.join("; ")
}

function lifetimeCookie(name: string, plain: string, httpOnly: boolean, deps: SessionWriterDeps): OutgoingCookie {
  const now = deps.now()
  const expires = now + deps.config.lifetimeMinutes * 60
  const { path, domain, secure, sameSite } = deps.cookie
  return { name, value: encryptCookieValue(name, plain, deps), expires, maxAge: expires - now, path, domain, secure, httpOnly, sameSite }
}

export function serializeCookie(cookie: OutgoingCookie): string {
  const { path, domain, secure, sameSite } = cookie
  return setCookieHeader(cookie.name, cookie.value, { path, domain, secure, sameSite }, cookie.expires, cookie.httpOnly, cookie.expires - cookie.maxAge)
}

export function xsrfCookieOf(state: SessionState, deps: SessionWriterDeps): OutgoingCookie {
  return lifetimeCookie(XSRF_COOKIE, typeof state.attributes._token === "string" ? state.attributes._token : "", false, deps)
}

export function sessionCookieOf(state: SessionState, deps: SessionWriterDeps): OutgoingCookie {
  return lifetimeCookie(deps.config.cookieName, state.id, true, deps)
}

export function xsrfCookie(state: SessionState, deps: SessionWriterDeps): string {
  return serializeCookie(xsrfCookieOf(state, deps))
}

export function sessionCookie(state: SessionState, deps: SessionWriterDeps): string {
  return serializeCookie(sessionCookieOf(state, deps))
}
