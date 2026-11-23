// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createUuid7Generator } from "./uuid7"

const FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("uuid7", () => {
  it("writes the millisecond timestamp first, with version 7 and the RFC variant, like Str::uuid7()", () => {
    const next = createUuid7Generator(() => 0x01a1c5bc79ca)
    const id = next()
    expect(id).toMatch(FORMAT)
    expect(id.startsWith("01a1c5bc-79ca-7")).toBe(true)
  })

  it("keeps ids strictly increasing inside the same millisecond and across milliseconds", () => {
    let now = 1_800_000_000_000
    const next = createUuid7Generator(() => now)
    const ids = Array.from({ length: 500 }, (_, index) => {
      if (index === 250) now += 1
      return next()
    })
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => FORMAT.test(id))).toBe(true)
  })

  it("does not go back when the clock does", () => {
    let now = 1_800_000_000_500
    const next = createUuid7Generator(() => now)
    const first = next()
    now -= 400
    expect(next() > first).toBe(true)
  })
})
