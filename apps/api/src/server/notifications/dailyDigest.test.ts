// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { QueuedMail } from "../mail/mailables"
import { runDailyDigest, type DigestDeps, type DigestPerson } from "./dailyDigest"

const TEACHER: DigestPerson = { id: "t", name: "Ana", email: "ana@ueb.edu.ec", preferences: null }
// 2026-11-26 is a Thursday; Guayaquil is UTC-5.
const at = (iso: string) => Date.parse(iso) / 1000

function setup(overrides: Partial<{ now: number; enabled: boolean; time: string; pending: { role: string; person: DigestPerson }[]; failMail: boolean }> = {}) {
  const claims = new Set<string>()
  const sent: QueuedMail[] = []
  const state = { failMail: overrides.failMail ?? false, reads: 0, now: overrides.now ?? at("2026-11-26T08:00:00-05:00"), today: "" }
  const deps: DigestDeps = {
    now: () => state.now,
    timeZone: "America/Guayaquil",
    settings: async () => ({ enabled: overrides.enabled ?? true, time: overrides.time ?? "08:00" }),
    pending: async (today) => {
      state.today = today
      state.reads += 1
      return overrides.pending ?? [{ role: "docente", person: TEACHER }]
    },
    claim: async (key) => (claims.has(key) ? false : (claims.add(key), true)),
    release: async (key) => void claims.delete(key),
    finished: async (key) => claims.has(key),
    finish: async (key) => void claims.add(key),
    mail: async (mail) => {
      if (state.failMail) throw new Error("sin cola")
      sent.push(mail)
    },
    frontendUrl: "http://localhost:3000",
  }
  return { deps, sent, state }
}

describe("daily pending summary", () => {
  it("sends one email that only says there is pending work, with the access button", async () => {
    const { deps, sent } = setup()
    expect(await runDailyDigest(deps)).toBe(1)
    expect(sent).toEqual([
      { mailable: "daily", to: "ana@ueb.edu.ec", data: { name: "Ana", lines: ["Tiene pendientes en el sistema."], buttonLabel: "Abrir el sistema", url: "http://localhost:3000/" } },
    ])
  })

  it("sends one email per person with several pending roles", async () => {
    const { deps, sent } = setup({ pending: [{ role: "docente", person: TEACHER }, { role: "coordinador", person: TEACHER }] })
    await runDailyDigest(deps)
    expect(sent).toHaveLength(1)
  })

  it("sends nothing when nobody has pending work", async () => {
    const { deps, sent } = setup({ pending: [] })
    expect(await runDailyDigest(deps)).toBe(0)
    expect(sent).toEqual([])
  })

  it("runs once a day, and again the next weekday", async () => {
    const { deps, sent, state } = setup()
    await runDailyDigest(deps)
    state.now += 60
    await runDailyDigest(deps)
    expect(sent).toHaveLength(1)
    expect(state.reads).toBe(1)
    state.now = at("2026-11-27T08:00:00-05:00")
    await runDailyDigest(deps)
    expect(sent).toHaveLength(2)
  })

  it.each([
    ["before the hour", "2026-11-26T07:59:00-05:00", "08:00"],
    ["long after the hour", "2026-11-26T12:00:00-05:00", "08:00"],
    ["on Saturday", "2026-11-28T08:00:00-05:00", "08:00"],
    ["on Sunday", "2026-11-29T08:00:00-05:00", "08:00"],
    ["before a later chosen hour", "2026-11-26T08:00:00-05:00", "14:30"],
  ])("does not send %s", async (_case, iso, time) => {
    const { deps, sent } = setup({ now: at(iso), time })
    await runDailyDigest(deps)
    expect(sent).toEqual([])
  })

  it("respects the system switch and each person's own switch for that role", async () => {
    const off = setup({ enabled: false })
    await runDailyDigest(off.deps)
    expect(off.sent).toEqual([])
    const muted = { ...TEACHER, preferences: { "docente.resumen_diario": false } }
    const one = setup({ pending: [{ role: "docente", person: muted }] })
    await runDailyDigest(one.deps)
    expect(one.sent).toEqual([])
    const both = setup({ pending: [{ role: "docente", person: muted }, { role: "coordinador", person: muted }] })
    await runDailyDigest(both.deps)
    expect(both.sent).toHaveLength(1)
  })

  it("asks for what is pending on the institution's date, which is what the deadline is compared with", async () => {
    const { deps, state } = setup({ now: at("2026-11-26T20:30:00-05:00"), time: "20:30" })
    await runDailyDigest(deps)
    expect(state.today).toBe("2026-11-26")
  })

  it("after a run cut short halfway, sends only to whoever is missing", async () => {
    const second = { ...TEACHER, id: "u", email: "luis@ueb.edu.ec" }
    const { deps, sent, state } = setup({ pending: [{ role: "docente", person: TEACHER }, { role: "docente", person: second }] })
    const mail = deps.mail
    // The connection drops after the first email: nothing can be released or marked as finished either.
    deps.mail = async (message) => {
      if (sent.length === 1) throw new Error("reinicio")
      return mail(message)
    }
    deps.release = async () => {
      throw new Error("sin conexión")
    }
    await expect(runDailyDigest(deps)).rejects.toThrow()
    const claimedByCrash = "resumen:2026-11-26:u"
    deps.mail = mail
    deps.release = async () => {}
    const claim = deps.claim
    deps.claim = async (key) => (key === claimedByCrash ? true : claim(key))
    state.now += 60
    await runDailyDigest(deps)
    expect(sent.map((message) => message.to)).toEqual(["ana@ueb.edu.ec", "luis@ueb.edu.ec"])
  })

  it("sends nothing when the settings cannot be read", async () => {
    const { deps, sent } = setup()
    deps.settings = async () => {
      throw new Error("sin base")
    }
    await expect(runDailyDigest(deps)).rejects.toThrow("sin base")
    expect(sent).toEqual([])
  })

  it("retries on the next tick when queuing the mail fails", async () => {
    const { deps, sent, state } = setup({ failMail: true })
    await expect(runDailyDigest(deps)).rejects.toThrow("sin cola")
    state.failMail = false
    state.now += 60
    await runDailyDigest(deps)
    expect(sent).toHaveLength(1)
  })
})
