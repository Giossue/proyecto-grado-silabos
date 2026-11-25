// @vitest-environment node
import { describe, expect, it } from "vitest"
import { institutionDateOfValue, passesDateRule } from "./phpDates"

describe("passesDateRule, like Laravel's date rule (strtotime plus checkdate)", () => {
  it.each(["2026-01-05", "2026-1-5", "2026/01/05", "01/05/2026", "05-01-2026", "05.01.2026", "20260105", "2026-01-05 10:30", "2026-01-05T10:30:00Z", "2026-01-05T10:30:00.123-05:00", 20260105])(
    "accepts %s",
    (value) => {
      expect(passesDateRule(value)).toBe(true)
    },
  )

  it.each(["2026-02-30", "2026-13-01", "mañana", "", "2026-01-05x", null, true, { a: 1 }, 5])("rejects %s", (value) => {
    expect(passesDateRule(value as never)).toBe(false)
  })
})

describe("institutionDateOfValue, like InstitutionDate::dateOfValue", () => {
  it("keeps a plain date as written", () => {
    expect(institutionDateOfValue("2026-02-30")).toBe("2026-02-30")
  })

  it("reads other formats in the institution's time zone and rolls over impossible days like Carbon", () => {
    expect(institutionDateOfValue("2026/01/05")).toBe("2026-01-05")
    expect(institutionDateOfValue("01/05/2026")).toBe("2026-01-05")
    expect(institutionDateOfValue("2026-01-06T02:00:00Z")).toBe("2026-01-05")
    expect(institutionDateOfValue("2026/02/30")).toBe("2026-03-02")
  })

  it("gives up on what Carbon cannot parse", () => {
    expect(institutionDateOfValue("mañana")).toBeNull()
    expect(institutionDateOfValue(20260105)).toBeNull()
    expect(institutionDateOfValue("  ")).toBeNull()
  })
})
