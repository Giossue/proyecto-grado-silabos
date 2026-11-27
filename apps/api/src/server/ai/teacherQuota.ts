export const DAILY_REQUESTS = 20

const DAY_SECONDS = 86400

export function institutionDay(now: number, timeZone: string): { date: string; secondsLeft: number } {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
  const parts = Object.fromEntries(format.formatToParts(new Date(now * 1000)).map((part) => [part.type, part.value]))
  const elapsed = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, secondsLeft: DAY_SECONDS - elapsed }
}

export function dailyRequestLimit(userId: string, now: number, timeZone: string) {
  const day = institutionDay(now, timeZone)
  return { key: `teacher-assistant:${userId}:${day.date}`, maxAttempts: DAILY_REQUESTS, decaySeconds: day.secondsLeft }
}
