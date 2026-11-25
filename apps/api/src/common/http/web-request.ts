import type { Request as ExpressRequest } from "express"

export type ApiRequest = ExpressRequest & { rawBody?: Buffer }

const BODILESS = new Set(["GET", "HEAD"])
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade"])

export function webHeadersOf(request: ApiRequest): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name)) continue
    if (Array.isArray(value)) for (const item of value) headers.append(name, item)
    else headers.set(name, value)
  }
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  if (forwardedHost) headers.set("host", forwardedHost)
  if (!headers.has("x-forwarded-for") && request.socket.remoteAddress) headers.set("x-forwarded-for", request.socket.remoteAddress)
  return headers
}

export function webRequestOf(request: ApiRequest): Request {
  const headers = webHeadersOf(request)
  const url = `${request.protocol}://${headers.get("host") ?? "localhost"}${request.originalUrl}`
  const body = BODILESS.has(request.method) || !request.rawBody || request.rawBody.length === 0 ? undefined : new Uint8Array(request.rawBody)
  return new Request(url, { method: request.method, headers, body })
}
