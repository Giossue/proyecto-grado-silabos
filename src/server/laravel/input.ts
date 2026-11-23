import { laravelTrim } from "./request"

export type PhpArray = { [key: string]: PhpValue }
export type PhpValue = string | number | boolean | null | PhpArray

export function isPhpArray(value: unknown): value is PhpArray {
  return typeof value === "object" && value !== null
}

function cleanString(value: string): string | null {
  const trimmed = laravelTrim(value)
  return trimmed === "" ? null : trimmed
}

function toPhp(value: unknown): PhpValue {
  if (typeof value === "string") return cleanString(value)
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value
  if (Array.isArray(value)) return Object.fromEntries(value.map((item, index) => [String(index), toPhp(item)]))
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPhp(item)]))
  return null
}

export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get("content-type") ?? ""
  return type.includes("/json") || type.includes("+json")
}

async function jsonBody(request: Request): Promise<PhpArray> {
  let decoded: unknown
  try {
    decoded = JSON.parse(await request.text())
  } catch {
    return {}
  }
  if (isPhpArray(decoded)) return toPhp(decoded) as PhpArray
  return decoded === null ? {} : { "0": toPhp(decoded) }
}

function nextIndex(target: PhpArray): string {
  const numeric = Object.keys(target).filter((key) => /^(0|-?[1-9]\d*)$/.test(key)).map(Number)
  return String(numeric.length === 0 ? 0 : Math.max(-1, ...numeric) + 1)
}

export function phpQuery(url: URL): PhpArray {
  const result: PhpArray = {}
  for (const [rawName, rawValue] of url.searchParams) {
    const value = cleanString(rawValue)
    const open = rawName.indexOf("[")
    const segments: string[] = []
    let base = rawName
    if (open > 0) {
      const rest = rawName.slice(open)
      const pattern = /\[([^\]]*)\]/gy
      let match: RegExpExecArray | null
      let consumed = 0
      while ((match = pattern.exec(rest)) !== null) {
        segments.push(match[1])
        consumed = pattern.lastIndex
      }
      if (segments.length > 0) base = rawName.slice(0, open)
      if (consumed === 0) segments.length = 0
    }
    base = base.replace(/[. ]/g, "_").replace(/\[/g, "_")
    if (base === "") continue
    if (segments.length === 0) {
      result[base] = value
      continue
    }
    let target = result
    let key = base
    for (const segment of segments) {
      if (!isPhpArray(target[key])) target[key] = {}
      const next = target[key] as PhpArray
      key = segment === "" ? nextIndex(next) : segment
      target = next
    }
    target[key] = value
  }
  return result
}

export async function laravelInput(request: Request): Promise<PhpArray> {
  const query = phpQuery(new URL(request.url))
  const body = isJsonRequest(request) ? await jsonBody(request) : {}
  const merged: PhpArray = { ...body }
  for (const [key, value] of Object.entries(query)) if (!(key in merged)) merged[key] = value
  return merged
}

export function phpCount(value: PhpArray): number {
  return Object.keys(value).length
}
