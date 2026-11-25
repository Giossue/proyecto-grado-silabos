import { randomInt } from "node:crypto"
import { isPhpArray, isRecord, list, type PhpRecord } from "../configuration/phpValues"

const FLOAT = Symbol("php-float")

export type PhpFloat = { [FLOAT]: number }

export function phpFloat(value: number): PhpFloat {
  return { [FLOAT]: value }
}

export function isPhpFloat(value: unknown): value is PhpFloat {
  return typeof value === "object" && value !== null && FLOAT in value
}

export type JsonFlags = { unicode?: boolean; slashes?: boolean }

function encodeString(value: string, flags: JsonFlags): string {
  let json = JSON.stringify(value)
  json = json.replace(/[\u2028\u2029]/g, (character) => (character === "\u2028" ? "\\u2028" : "\\u2029"))
  if (!flags.slashes) json = json.replace(/\//g, "\\/")
  if (!flags.unicode) json = json.replace(/[\u0080-\uffff]/g, (character) => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"))
  return json
}

function encodeNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Inf and NaN cannot be JSON encoded")
  return JSON.stringify(value)
}

export function phpJson(value: unknown, flags: JsonFlags = {}): string {
  if (value === null || value === undefined) return "null"
  if (value === true) return "true"
  if (value === false) return "false"
  if (typeof value === "number") return encodeNumber(value)
  if (isPhpFloat(value)) return encodeNumber(value[FLOAT])
  if (typeof value === "string") return encodeString(value, flags)
  if (Array.isArray(value)) return `[${value.map((item) => phpJson(item, flags)).join(",")}]`
  if (typeof value === "object") {
    const entries = Object.entries(value as PhpRecord).filter(([, item]) => item !== undefined)
    return `{${entries.map(([key, item]) => `${encodeString(key, flags)}:${phpJson(item, flags)}`).join(",")}}`
  }
  return "null"
}

const WIDE_RANGES: [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
]

function charWidth(character: string): number {
  const code = character.codePointAt(0) ?? 0
  return WIDE_RANGES.some(([from, to]) => code >= from && code <= to) ? 2 : 1
}

export function strLimit(value: string, limit = 100, end = "..."): string {
  const characters = [...value]
  if (characters.reduce((sum, character) => sum + charWidth(character), 0) <= limit) return value
  let width = 0
  let result = ""
  for (const character of characters) {
    const next = charWidth(character)
    if (width + next > limit) break
    width += next
    result += character
  }
  return result.replace(/[ \t\n\r\0\x0B]+$/, "") + end
}

const LETTERS: Record<string, string> = {
  ß: "ss", ẞ: "SS", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ø: "o", Ø: "O", ł: "l", Ł: "L", đ: "d", Đ: "D", ð: "d", Ð: "D",
  þ: "th", Þ: "TH", ħ: "h", Ħ: "H", ı: "i", ĳ: "ij", Ĳ: "IJ", ŀ: "l", Ŀ: "L", ſ: "s", ŋ: "n", Ŋ: "N", ŧ: "t", Ŧ: "T",
  "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "«": "<<", "»": ">>", "€": "EUR", "º": "o", "ª": "a",
}

export function strAscii(value: string): string {
  return [...value.normalize("NFD")]
    .map((character) => LETTERS[character] ?? character)
    .join("")
    .replace(/[\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/[^\x00-\x7F]/g, "")
}

const POOL = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

export function strRandom(length: number): string {
  let result = ""
  for (let index = 0; index < length; index++) result += POOL[randomInt(POOL.length)]
  return result
}

export function phpTrimChars(value: string, characters: string): string {
  let start = 0
  let end = value.length
  while (start < end && characters.includes(value[start])) start++
  while (end > start && characters.includes(value[end - 1])) end--
  return value.slice(start, end)
}

type SourceReviver = (this: unknown, key: string, value: unknown, context?: { source?: string }) => unknown

export function phpJsonDecode(text: string): unknown {
  const reviver: SourceReviver = (_key, value, context) =>
    typeof value === "number" && context?.source !== undefined && (/[.eE]/.test(context.source) || !Number.isSafeInteger(value)) ? phpFloat(value) : value
  return JSON.parse(text, reviver as (this: unknown, key: string, value: unknown) => unknown)
}

export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!isRecord(value)) return value
  const keys = Object.keys(value)
  if (keys.length === 0) return []
  if (keys.every((key, index) => key === String(index))) return keys.map((key) => canonical(value[key]))
  return Object.fromEntries(
    keys.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))).map((key) => [key, canonical(value[key])]),
  )
}

export function isPhpListValue(value: unknown): boolean {
  if (Array.isArray(value)) return true
  return isRecord(value) && Object.keys(value).every((key, index) => key === String(index))
}

export function phpArrayValues(value: unknown): unknown[] {
  return isPhpArray(value) ? list(value) : []
}
