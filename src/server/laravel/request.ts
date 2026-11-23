const TRIMMED = /^[\s﻿​‎]+|[\s﻿​‎]+$/gu

export function laravelTrim(value: string): string {
  return value.replace(TRIMMED, "")
}

export type LaravelQuery = Map<string, string | null>

export function laravelQuery(url: URL): LaravelQuery {
  const query: LaravelQuery = new Map()
  for (const [name, raw] of url.searchParams) {
    const value = raw.replace(TRIMMED, "")
    query.set(name, value === "" ? null : value)
  }
  return query
}

export function hasArrayParameter(url: URL, name: string): boolean {
  return [...url.searchParams.keys()].some((key) => key.startsWith(`${name}[`))
}

export function laravelRequestUrl(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get("host") ?? url.host
  const scheme = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(/:$/, "")
  return `${scheme}://${host}${url.pathname.replace(/\/+$/, "")}`
}

export function expectsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? ""
  const first = accept.split(",")[0]?.split(";")[0]?.trim() ?? ""
  if (first.includes("/json") || first.includes("+json")) return true
  const ajax = request.headers.get("x-requested-with") === "XMLHttpRequest"
  const pjax = request.headers.get("x-pjax") === "true"
  return ajax && !pjax && (accept.trim() === "" || first === "*/*" || first === "*")
}
