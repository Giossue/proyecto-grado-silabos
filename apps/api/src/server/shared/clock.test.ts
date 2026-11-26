import { afterEach, describe, expect, it, vi } from "vitest"
import { institutionToday, systemNow } from "./clock"

const timezone = process.env.DISPLAY_TIMEZONE

afterEach(() => {
  vi.useRealTimers()
  if (timezone === undefined) delete process.env.DISPLAY_TIMEZONE
  else process.env.DISPLAY_TIMEZONE = timezone
})

describe("systemNow", () => {
  it("returns whole Unix seconds", () => {
    vi.useFakeTimers({ now: new Date("2026-11-25T20:15:42.987Z") })
    expect(systemNow()).toBe(Math.floor(Date.parse("2026-11-25T20:15:42Z") / 1000))
  })
})

describe("institutionToday", () => {
  it("uses Guayaquil when no display timezone is set", () => {
    delete process.env.DISPLAY_TIMEZONE
    vi.useFakeTimers({ now: new Date("2026-11-26T03:30:00Z") })
    expect(institutionToday()).toBe("2026-11-25")
  })

  it("follows DISPLAY_TIMEZONE", () => {
    process.env.DISPLAY_TIMEZONE = "Asia/Tokyo"
    vi.useFakeTimers({ now: new Date("2026-11-25T20:00:00Z") })
    expect(institutionToday()).toBe("2026-11-26")
  })
})
