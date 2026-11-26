import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import { subjectTotalHours } from "./subjectHours"

describe("subjectTotalHours", () => {
  it("adds the teaching, practical and autonomous hours and rounds half away from zero like the dropped column", () => {
    expect(subjectTotalHours(new Prisma.Decimal("48.00"), new Prisma.Decimal("48.00"), new Prisma.Decimal("48.00"))).toBe(144)
    expect(subjectTotalHours("10.25", "10.25", null)).toBe(21)
    expect(subjectTotalHours("10.20", "10.20", "0.00")).toBe(20)
    expect(subjectTotalHours("0.10", "0.20", "0.20")).toBe(1)
    expect(subjectTotalHours(0.1, 0.2, 0.2)).toBe(1)
  })

  it("counts missing hours as zero and gives zero when every hour is missing", () => {
    expect(subjectTotalHours(null, "1.50", null)).toBe(2)
    expect(subjectTotalHours(null, null, null)).toBe(0)
  })
})
