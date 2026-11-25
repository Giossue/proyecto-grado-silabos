export type ParsedDate = { year: number; month: number; day: number; hour: number; minute: number; second: number; offsetMinutes: number | null }

const DATE_PATTERNS: { pattern: RegExp; order: ["year" | "month" | "day", "year" | "month" | "day", "year" | "month" | "day"] }[] = [
  { pattern: /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/, order: ["year", "month", "day"] },
  { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, order: ["month", "day", "year"] },
  { pattern: /^(\d{1,2})[-.](\d{1,2})[-.](\d{4})/, order: ["day", "month", "year"] },
  { pattern: /^(\d{4})(\d{2})(\d{2})/, order: ["year", "month", "day"] },
]
const TIME = /^(?:[Tt]|\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/
const ZONE = /^\s*(?:([Zz]|UTC|GMT)|([+-])(\d{2}):?(\d{2})?)$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function institutionTimezone(): string {
  return process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"
}

export function parsePhpDate(raw: string): ParsedDate | null {
  const text = raw.trim()
  for (const { pattern, order } of DATE_PATTERNS) {
    const match = pattern.exec(text)
    if (match === null) continue
    const parts = { year: 0, month: 0, day: 0 }
    order.forEach((name, index) => (parts[name] = Number(match[index + 1])))
    if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return null
    let rest = text.slice(match[0].length)
    let hour = 0
    let minute = 0
    let second = 0
    const time = TIME.exec(rest)
    if (time !== null) {
      hour = Number(time[1])
      minute = Number(time[2])
      second = time[3] === undefined ? 0 : Number(time[3])
      if (hour > 23 || minute > 59 || second > 59) return null
      rest = rest.slice(time[0].length)
    }
    if (rest.trim() === "") return { ...parts, hour, minute, second, offsetMinutes: null }
    const zone = ZONE.exec(rest)
    if (zone === null) return null
    const offsetMinutes = zone[1] !== undefined ? 0 : (zone[2] === "-" ? -1 : 1) * (Number(zone[3]) * 60 + Number(zone[4] ?? 0))
    return { ...parts, hour, minute, second, offsetMinutes }
  }
  return null
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function passesDateRule(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false
  const parsed = parsePhpDate(String(value))
  return parsed !== null && parsed.day <= daysInMonth(parsed.year, parsed.month)
}

function zoneOffset(time: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  )
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - Math.floor(time / 1000) * 1000
}

export function carbonInstant(value: string, timeZone = institutionTimezone()): number | null {
  const parsed = parsePhpDate(value)
  if (parsed === null) return null
  const wall = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second)
  if (parsed.offsetMinutes !== null) return wall - parsed.offsetMinutes * 60_000
  const guess = wall - zoneOffset(wall, timeZone)
  return wall - zoneOffset(guess, timeZone)
}

export function localDate(time: number, timeZone = institutionTimezone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time))
}

export function institutionDateOfValue(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null
  if (DATE_ONLY.test(value)) return value
  const instant = carbonInstant(value)
  return instant === null ? null : localDate(instant)
}

export function plainDateOf(value: unknown): unknown {
  if (!passesDateRule(value)) return value
  const parsed = parsePhpDate(String(value)) as ParsedDate
  return `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`
}
