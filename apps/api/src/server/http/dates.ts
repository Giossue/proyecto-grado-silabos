import type { PhpValue } from "./input"

const YMD = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/

export function phpCreateFromYmd(value: PhpValue | undefined): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const match = YMD.exec(String(value))
  if (!match) return null
  const date = new Date(0)
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getTime()
}

export function formatYmd(time: number): string {
  const date = new Date(time)
  const pad = (part: number, size: number) => String(part).padStart(size, "0")
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`
}

export function passesYmdFormat(value: PhpValue | undefined): boolean {
  const time = phpCreateFromYmd(value)
  return time !== null && formatYmd(time) === String(value)
}

export function isYmdAfterOrEqual(value: PhpValue | undefined, other: PhpValue | undefined): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false
  if (other === undefined || other === null) return true
  const first = phpCreateFromYmd(value)
  const second = phpCreateFromYmd(other)
  return first !== null && second !== null && first >= second
}
