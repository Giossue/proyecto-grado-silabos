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

export function laravelRoot(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get("host") ?? url.host
  const scheme = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(/:$/, "")
  return `${scheme}://${host}`
}

export function laravelRequestUrl(request: Request): string {
  return `${laravelRoot(request)}${new URL(request.url).pathname.replace(/\/+$/, "")}`
}

export function expectsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? ""
  const first = accept.split(",")[0]?.split(";")[0]?.trim() ?? ""
  if (first.includes("/json") || first.includes("+json")) return true
  const ajax = request.headers.get("x-requested-with") === "XMLHttpRequest"
  const pjax = request.headers.get("x-pjax") === "true"
  return ajax && !pjax && (accept.trim() === "" || first === "*/*" || first === "*")
}

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/
const UNRESERVED = /[A-Za-z0-9\-_.~]/

function phpUrlDecode(text: string): Buffer {
  const source = Buffer.from(text, "utf8")
  const bytes: number[] = []
  for (let index = 0; index < source.length; index += 1) {
    const byte = source[index]
    const hex = source.subarray(index + 1, index + 3).toString("latin1")
    if (byte === 0x25 && /^[0-9a-fA-F]{2}$/.test(hex)) {
      bytes.push(Number.parseInt(hex, 16))
      index += 2
    } else bytes.push(byte === 0x2b ? 0x20 : byte)
  }
  return Buffer.from(bytes)
}

function rawUrlEncode(bytes: Buffer): string {
  let text = ""
  for (const byte of bytes) {
    const character = String.fromCharCode(byte)
    text += byte < 0x80 && UNRESERVED.test(character) ? character : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
  }
  return text
}

export function laravelFullUrl(request: Request): string | null {
  const url = new URL(request.url)
  const base = laravelRequestUrl(request)
  const query = url.search.slice(1)
  if (query === "") return base
  const pairs = new Map<string, Buffer>()
  for (const segment of query.split("&")) {
    if (segment === "") continue
    const at = segment.indexOf("=")
    const key = at === -1 ? segment : segment.slice(0, at)
    if (!PLAIN_KEY.test(key)) return null
    pairs.set(key, at === -1 ? Buffer.alloc(0) : phpUrlDecode(segment.slice(at + 1)))
  }
  if (pairs.size === 0) return base
  const sorted = [...pairs.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `${base}${url.pathname === "/" ? "/?" : "?"}${sorted.map(([key, value]) => `${key}=${rawUrlEncode(value)}`).join("&")}`
}
