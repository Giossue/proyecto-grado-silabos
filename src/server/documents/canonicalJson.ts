import { createHash } from "node:crypto"

const ESCAPES: Record<string, string> = { '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\u2028": "\\u2028", "\u2029": "\\u2029" }

function phpString(value: string): string {
  return `"${value.replace(/["\\\u0000-\u001f\u2028\u2029]/g, (character) => ESCAPES[character] ?? `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`
}

export function phpFloatLiteral(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Inf and NaN cannot be JSON encoded")
  const [mantissa, exponentText] = value.toExponential().split("e")
  const exponent = Number(exponentText)
  if (exponent + 1 < -3 || exponent + 1 > 17) {
    const [whole, fraction] = mantissa.split(".")
    return `${whole}.${fraction ?? "0"}e${exponent < 0 ? "-" : "+"}${Math.abs(exponent)}`
  }
  const fixed = String(value)
  return fixed.includes(".") ? fixed : `${fixed}.0`
}

function phpNumber(value: number): string {
  return Number.isInteger(value) && Math.abs(value) < 2 ** 63 ? String(value) : phpFloatLiteral(value)
}

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
}

function isList(keys: string[]): boolean {
  return keys.every((key, index) => key === String(index))
}

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return phpNumber(value)
  if (typeof value === "string") return phpString(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    const keys = entries.map(([key]) => key)
    if (isList(keys)) return `[${entries.map(([, item]) => canonicalJson(item)).join(",")}]`
    const sorted = [...entries].sort(([left], [right]) => compareBytes(left, right))
    return `{${sorted.map(([key, item]) => `${phpString(key)}:${canonicalJson(item)}`).join(",")}}`
  }
  throw new Error(`Type is not supported: ${typeof value}`)
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")
}
