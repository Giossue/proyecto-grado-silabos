import "server-only"
import { laravelBaseUrl } from "./config"

const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "host", "content-length"]

export async function proxyToLaravel(request: Request): Promise<Response> {
  const incoming = new URL(request.url)
  const target = `${laravelBaseUrl()}${incoming.pathname}${incoming.search}`
  const headers = new Headers(request.headers)
  for (const name of HOP_BY_HOP) headers.delete(name)
  headers.set("x-forwarded-host", request.headers.get("host") ?? incoming.host)
  headers.set("accept-encoding", "identity")
  const hasBody = !["GET", "HEAD"].includes(request.method)
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    cache: "no-store",
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit)
  const responseHeaders = new Headers(upstream.headers)
  for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]) responseHeaders.delete(name)
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })
}
