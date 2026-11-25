import "reflect-metadata"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { withCookieQueue, withSetCookies } from "../../server/auth/cookieQueue"

export const HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "allow",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "retry-after",
  "x-ratelimit-reset",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "content-security-policy",
  "cross-origin-resource-policy",
]

export type Call = { method: string; path: string; body?: unknown; raw?: { contentType: string; data: Buffer }; headers?: Record<string, string> }

export type Raw = { status: number; body: string; headers: Record<string, string | null>; cookies: string[] }

export function live<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get(_target, key) {
      const value = (pick() as Record<PropertyKey, unknown>)[key]
      if (typeof value === "function") return (...args: unknown[]) => ((pick() as Record<PropertyKey, (...inner: unknown[]) => unknown>)[key] as (...inner: unknown[]) => unknown)(...args)
      if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return live(() => (pick() as Record<PropertyKey, object>)[key])
      return value
    },
  })
}

export function webRequest(call: Call, headers: Record<string, string>): Request {
  const body = call.raw ? new Uint8Array(call.raw.data) : call.body === undefined ? undefined : JSON.stringify(call.body)
  return new Request(new URL(call.path, "http://localhost:3000"), { method: call.method, headers, body })
}

export function contentHeaders(call: Call): Record<string, string> {
  if (call.raw) return { "content-type": call.raw.contentType }
  return call.body === undefined ? {} : { "content-type": "application/json" }
}

export async function served(handler: () => Promise<Response> | Response): Promise<Response> {
  const { result, cookies } = await withCookieQueue(async () => handler())
  return cookies.length === 0 ? result : withSetCookies(result, cookies)
}

export async function rawOf(response: Response): Promise<Raw> {
  const bytes = Buffer.from(await response.arrayBuffer())
  const type = response.headers.get("content-type") ?? ""
  return {
    status: response.status,
    body: type.includes("spreadsheetml") ? `<xlsx ${bytes.length > 0}>` : bytes.toString("utf8"),
    headers: Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)])),
    cookies: response.headers.getSetCookie(),
  }
}

export async function nestRaw(app: INestApplication, call: Call, headers: Record<string, string>): Promise<Raw> {
  let pending = request(app.getHttpServer())[call.method.toLowerCase() as "get"](call.path)
  for (const [name, value] of Object.entries({ ...headers, "x-forwarded-host": "localhost:3000" })) pending = pending.set(name, value)
  if (call.raw) pending = pending.buffer(true).parse((response, done) => {
    const chunks: Buffer[] = []
    response.on("data", (chunk: Buffer) => chunks.push(chunk))
    response.on("end", () => done(null, Buffer.concat(chunks)))
  })
  const response = await (call.raw ? pending.send(call.raw.data) : call.body === undefined ? pending : pending.send(JSON.stringify(call.body)))
  const type = String(response.headers["content-type"] ?? "")
  const text = type.includes("spreadsheetml") ? `<xlsx ${Buffer.isBuffer(response.body) ? response.body.length > 0 : (response.text ?? "").length > 0}>` : (response.text ?? (Buffer.isBuffer(response.body) ? response.body.toString("utf8") : ""))
  const cookies = response.headers["set-cookie"]
  return {
    status: response.status,
    body: text,
    headers: Object.fromEntries(HEADERS.map((name) => [name, (response.headers[name] as string | undefined) ?? null])),
    cookies: Array.isArray(cookies) ? cookies : cookies === undefined ? [] : [String(cookies)],
  }
}

export function normalizedCookie(header: string): string {
  const [pair, ...attributes] = header.split(";").map((part) => part.trim())
  const [name, ...value] = pair.split("=")
  const kept = attributes.filter((attribute) => !/^expires=/i.test(attribute))
  return [`${name}=${value.join("=") === "" ? "" : "<value>"}`, ...kept].join("; ")
}

export function jarWith(jar: Map<string, string>, setCookies: string[]): void {
  for (const header of setCookies) {
    const [pair, ...attributes] = header.split(";")
    const [name, ...rest] = pair.trim().split("=")
    const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))
    if (expired) jar.delete(name)
    else jar.set(name, rest.join("="))
  }
}

export const cookieHeader = (jar: Map<string, string>) => [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
