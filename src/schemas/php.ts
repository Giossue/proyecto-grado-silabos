const INT64_MIN = BigInt("-9223372036854775808")
const INT64_MAX = BigInt("9223372036854775807")

export function phpIsNumeric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value)
  return typeof value === "string" && /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(value)
}

export function phpFilterInt(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null
  if (typeof value === "boolean") return value ? 1 : null
  if (typeof value !== "string") return null
  const trimmed = value.replace(/^[ \t\n\r\v\0]+|[ \t\n\r\v\0]+$/g, "")
  if (!/^[+-]?(0|[1-9]\d*)$/.test(trimmed)) return null
  const big = BigInt(trimmed)
  return big < INT64_MIN || big > INT64_MAX ? null : Number(big)
}

export function phpString(value: unknown): string {
  if (value === true) return "1"
  if (value === false || value === null || value === undefined) return ""
  return String(value)
}
