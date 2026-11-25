// @vitest-environment node
import { describe, expect, it } from "vitest"
import { strnatcasecmp } from "./naturalSort"

describe("strnatcasecmp", () => {
  it("orders like PHP natural case-insensitive comparison", () => {
    const names = ["Software 10", "software 2", "Ácido", "Zoología", "Agronomía", "Software 1", "img012", "img12", "img 3"]
    expect([...names].sort(strnatcasecmp)).toEqual(["Agronomía", "img012", "img 3", "img12", "Software 1", "software 2", "Software 10", "Zoología", "Ácido"])
  })

  it("treats leading zeros as fractional digits and empty strings first", () => {
    expect(strnatcasecmp("x1.010", "x1.01")).toBe(1)
    expect(strnatcasecmp("", "a")).toBe(-1)
    expect(strnatcasecmp("ABC", "abc")).toBe(0)
  })
})
