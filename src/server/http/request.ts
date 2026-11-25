const TRIMMED = /^[\s﻿​‎]+|[\s﻿​‎]+$/gu

export function trimInput(value: string): string {
  return value.replace(TRIMMED, "")
}

export type QueryParams = Map<string, string | null>

export function queryParams(url: URL): QueryParams {
  const query: QueryParams = new Map()
  for (const [name, raw] of url.searchParams) {
    const value = raw.replace(TRIMMED, "")
    query.set(name, value === "" ? null : value)
  }
  return query
}

export function hasArrayParameter(url: URL, name: string): boolean {
  return [...url.searchParams.keys()].some((key) => key.startsWith(`${name}[`))
}

export function requestRoot(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get("host") ?? url.host
  const scheme = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(/:$/, "")
  return `${scheme}://${host}`
}

export function requestUrl(request: Request): string {
  return `${requestRoot(request)}${new URL(request.url).pathname.replace(/\/+$/, "")}`
}

export function expectsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? ""
  const first = accept.split(",")[0]?.split(";")[0]?.trim() ?? ""
  if (first.includes("/json") || first.includes("+json")) return true
  const ajax = request.headers.get("x-requested-with") === "XMLHttpRequest"
  const pjax = request.headers.get("x-pjax") === "true"
  return ajax && !pjax && (accept.trim() === "" || first === "*/*" || first === "*")
}

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

type QueryTree = Map<string, string | QueryTree>

function phpKey(key: string): string {
  return /^(0|-?[1-9]\d*)$/.test(key) && Number.isSafeInteger(Number(key)) ? String(Number(key)) : key
}

function nextQueryIndex(tree: QueryTree): string {
  const numeric = [...tree.keys()].filter((key) => /^(0|-?[1-9]\d*)$/.test(key)).map(Number)
  return String(numeric.length === 0 ? 0 : Math.max(-1, ...numeric) + 1)
}

function bracketSegments(rest: string): string[] {
  const segments: string[] = []
  let index = 0
  while (rest[index] === "[") {
    const close = rest.indexOf("]", index)
    if (close === -1) break
    segments.push(rest.slice(index + 1, close))
    index = close + 1
  }
  return segments
}

function parseSymfonyQuery(query: string): QueryTree {
  const tree: QueryTree = new Map()
  for (const part of query.split("&")) {
    const raw = part.includes("\0") ? part.slice(0, part.indexOf("\0")) : part
    const at = raw.indexOf("=")
    let key = phpUrlDecode(at === -1 ? raw : raw.slice(0, at)).toString("utf8")
    if (key.includes("\0")) key = key.slice(0, key.indexOf("\0"))
    key = key.replace(/^ +/, "")
    const value = at === -1 ? "" : phpUrlDecode(raw.slice(at + 1)).toString("utf8")
    const open = key.indexOf("[")
    const base = open === -1 ? key : key.slice(0, open)
    if (base === "") continue
    const segments = open === -1 ? [] : bracketSegments(key.slice(open))
    if (open !== -1 && segments.length === 0) {
      tree.set(phpKey(key), value)
      continue
    }
    let target = tree
    let name = phpKey(base)
    for (const segment of segments) {
      let child = target.get(name)
      if (!(child instanceof Map)) {
        child = new Map()
        target.set(name, child)
      }
      target = child
      name = segment === "" ? nextQueryIndex(target) : phpKey(segment)
    }
    target.set(name, value)
  }
  return tree
}

const isNumeric = (value: string) => /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(value)

function phpKeyCompare(left: string, right: string): number {
  if (isNumeric(left) && isNumeric(right)) return Number(left) - Number(right)
  return left < right ? -1 : left > right ? 1 : 0
}

function buildQuery(tree: QueryTree, prefix: string | null): string[] {
  return [...tree.entries()].flatMap(([key, value]) => {
    const name = prefix === null ? rawUrlEncode(Buffer.from(key, "utf8")) : `${prefix}%5B${rawUrlEncode(Buffer.from(key, "utf8"))}%5D`
    return value instanceof Map ? buildQuery(value, name) : [`${name}=${rawUrlEncode(Buffer.from(value, "utf8"))}`]
  })
}

export function requestFullUrl(request: Request): string {
  const url = new URL(request.url)
  const base = requestUrl(request)
  const query = url.search.slice(1)
  if (query === "") return base
  const tree = parseSymfonyQuery(query)
  const sorted: QueryTree = new Map([...tree.entries()].sort(([left], [right]) => phpKeyCompare(left, right)))
  const normalized = buildQuery(sorted, null).join("&")
  if (normalized === "") return base
  return `${base}${url.pathname === "/" ? "/?" : "?"}${normalized}`
}
