export const systemNow = () => Math.floor(Date.now() / 1000)

export const institutionTimezone = () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

export function institutionToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: institutionTimezone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}
