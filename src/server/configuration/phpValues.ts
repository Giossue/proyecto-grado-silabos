export type PhpRecord = { [key: string]: unknown }

export function isRecord(value: unknown): value is PhpRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isPhpArray(value: unknown): value is unknown[] | PhpRecord {
  return Array.isArray(value) || isRecord(value)
}

export function isList(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function isAssoc(value: unknown): value is PhpRecord {
  return isRecord(value)
}

export function record(value: unknown): PhpRecord {
  return isRecord(value) ? value : {}
}

export function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return isRecord(value) ? Object.values(value) : []
}

export function phpCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  return isRecord(value) ? Object.keys(value).length : 0
}

export function isEmptyArray(value: unknown): boolean {
  return isPhpArray(value) && phpCount(value) === 0
}

function normalizeDecoded(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDecoded)
  if (!isRecord(value)) return value
  const keys = Object.keys(value)
  if (keys.length === 0) return []
  if (keys.every((key, index) => key === String(index))) return keys.map((key) => normalizeDecoded(value[key]))
  return Object.fromEntries(keys.map((key) => [key, normalizeDecoded(value[key])]))
}

export function phpJsonDecode(text: string | null | undefined): unknown {
  if (text === null || text === undefined) return null
  try {
    return normalizeDecoded(JSON.parse(text))
  } catch {
    return null
  }
}

export function phpToBool(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") return value !== "" && value !== "0"
  if (isPhpArray(value)) return phpCount(value) > 0
  return true
}

function entries(value: unknown[] | PhpRecord): [string, unknown][] {
  return Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value)
}

export function phpIdentical(left: unknown, right: unknown): boolean {
  if (isPhpArray(left) || isPhpArray(right)) {
    if (!isPhpArray(left) || !isPhpArray(right)) return false
    const a = entries(left)
    const b = entries(right)
    return a.length === b.length && a.every(([key, value], index) => b[index][0] === key && phpIdentical(value, b[index][1]))
  }
  if (left === undefined) return right === undefined || right === null
  if (right === undefined) return left === null
  return left === right
}

const NUMERIC = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/

function looseScalar(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined || right === null || right === undefined || typeof left === "boolean" || typeof right === "boolean") {
    return phpToBool(left) === phpToBool(right)
  }
  if (typeof left === "number" && typeof right === "number") return left === right
  if (typeof left === "number" && typeof right === "string") return NUMERIC.test(right) ? left === Number(right.trim()) : String(left) === right
  if (typeof left === "string" && typeof right === "number") return looseScalar(right, left)
  if (typeof left === "string" && typeof right === "string") {
    return NUMERIC.test(left) && NUMERIC.test(right) ? Number(left.trim()) === Number(right.trim()) : left === right
  }
  return left === right
}

export function phpEquals(left: unknown, right: unknown): boolean {
  if (isPhpArray(left) && isPhpArray(right)) {
    const a = new Map(entries(left))
    const b = new Map(entries(right))
    if (a.size !== b.size) return false
    for (const [key, value] of a) {
      if (!b.has(key) || !phpEquals(value, b.get(key))) return false
    }
    return true
  }
  if (isPhpArray(left) || isPhpArray(right)) {
    const other = isPhpArray(left) ? right : left
    if (other === null || other === undefined || typeof other === "boolean") return phpToBool(left) === phpToBool(right)
    return false
  }
  return looseScalar(left, right)
}

export function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

export function phpString(value: unknown): string {
  if (value === true) return "1"
  if (value === false || value === null || value === undefined) return ""
  return String(value)
}

export function mbStrlen(value: string): number {
  return [...value].length
}

export function phpTrim(value: string): string {
  return value.replace(/^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g, "")
}

const OBJECT = Symbol("php-object")

export type PhpObject = { [OBJECT]: true; value: PhpRecord }

export function phpObject(value: PhpRecord): PhpObject {
  return { [OBJECT]: true, value }
}

function isPhpObject(value: unknown): value is PhpObject {
  return typeof value === "object" && value !== null && OBJECT in value
}

export function phpShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(phpShape)
  if (isPhpObject(value)) return Object.fromEntries(Object.entries(value.value).map(([key, item]) => [key, phpShape(item)]))
  if (!isRecord(value) || typeof (value as { toJSON?: unknown }).toJSON === "function") return value
  const keys = Object.keys(value)
  if (keys.length === 0) return []
  return Object.fromEntries(keys.map((key) => [key, phpShape(value[key])]))
}
