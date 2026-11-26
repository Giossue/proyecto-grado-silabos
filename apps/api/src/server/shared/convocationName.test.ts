import { describe, expect, it } from "vitest"
import { convocationName } from "./convocationName"

describe("convocationName", () => {
  it("joins career and period", () => {
    expect(convocationName("Software", "2026-2027 CI")).toBe("Software · 2026-2027 CI")
  })

  it("falls back to Período and trims PHP whitespace", () => {
    expect(convocationName("\t Software", null)).toBe("Software · Período")
    expect(convocationName("", "2026\n")).toBe("· 2026")
  })
})
