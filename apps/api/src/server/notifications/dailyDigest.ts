import type { QueuedMail } from "../mail/mailables"
import { wantsEmail } from "../operations/emailNoticeCatalog"

export type DigestPerson = { id: string; name: string; email: string; preferences: unknown }

/** One entry per person and role with something waiting for them. */
export type DigestPending = { role: string; person: DigestPerson }

export type DigestDeps = {
  now: () => number
  timeZone: string
  settings: () => Promise<{ enabled: boolean; time: string }>
  /** `today` is the institution's date, compared with each delivery date. */
  pending: (today: string) => Promise<DigestPending[]>
  /** True only the first time a key is taken. */
  claim: (key: string) => Promise<boolean>
  release: (key: string) => Promise<void>
  /** A day is marked only after everyone got theirs, so a run cut short is retried. */
  finished: (key: string) => Promise<boolean>
  finish: (key: string) => Promise<void>
  mail: (mail: QueuedMail) => Promise<unknown>
  frontendUrl: string
}

const PREFERENCE: Record<string, string> = {
  docente: "docente.resumen_diario",
  coordinador: "coordinacion.resumen_diario",
  bibliotecario: "biblioteca.resumen_diario",
}

/** A worker that was down at the chosen hour still sends this long after it, never later in the day. */
const CATCH_UP_MINUTES = 240

function localMoment(seconds: number, timeZone: string): { date: string; weekend: boolean; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(seconds * 1000))
      .map((part) => [part.type, part.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekend: parts.weekday === "Sat" || parts.weekday === "Sun", minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** Monday to Friday at the chosen hour: one «you have pending work» email per person. Safe to call every minute. */
export async function runDailyDigest(deps: DigestDeps): Promise<number> {
  const { enabled, time } = await deps.settings()
  const moment = localMoment(deps.now(), deps.timeZone)
  const [hour, minute] = time.split(":").map(Number)
  const late = moment.minutes - (hour * 60 + minute)
  if (!enabled || moment.weekend || late < 0 || late >= CATCH_UP_MINUTES) return 0
  const day = `resumen:${moment.date}`
  if (await deps.finished(day)) return 0
  const people = new Map<string, DigestPerson>()
  for (const { role, person } of await deps.pending(moment.date)) {
    if (wantsEmail(person.preferences, PREFERENCE[role])) people.set(person.id, person)
  }
  let sent = 0
  for (const person of people.values()) {
    // Claimed per person: a retry, or a second worker, never repeats someone's email.
    const key = `${day}:${person.id}`
    if (!(await deps.claim(key))) continue
    try {
      await deps.mail({
        mailable: "daily",
        to: person.email,
        data: { name: person.name, lines: ["Tiene pendientes en el sistema."], buttonLabel: "Abrir el sistema", url: `${deps.frontendUrl.replace(/\/+$/, "")}/` },
      })
    } catch (error) {
      await deps.release(key)
      throw error
    }
    sent += 1
  }
  await deps.finish(day)
  return sent
}
