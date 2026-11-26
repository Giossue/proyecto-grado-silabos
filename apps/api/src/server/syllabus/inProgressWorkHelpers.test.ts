import { describe, expect, it } from "vitest"
import { GenerationRejected, purgeRequired, requestBoolean } from "./inProgressWorkHelpers"

describe("requestBoolean", () => {
  it("accepts the PHP truthy forms", () => {
    for (const value of [true, 1, "1", "true", " TRUE ", "on", "Yes"]) expect(requestBoolean(value)).toBe(true)
  })

  it("rejects everything else", () => {
    for (const value of [false, 0, 2, "0", "false", "off", "no", "", null, undefined, {}, []]) expect(requestBoolean(value)).toBe(false)
  })
})

describe("GenerationRejected", () => {
  it("carries the field errors", () => {
    const error = new GenerationRejected({ subject: ["falta"] })
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe("generation rejected")
    expect(error.errors).toEqual({ subject: ["falta"] })
  })
})

describe("purgeRequired", () => {
  it("counts the syllabi to replace", () => {
    expect(purgeRequired(2).purge_count).toEqual(["2"])
    expect(purgeRequired(1).purge_required[0]).toMatch(/^Este cambio reemplazará 1 sílabo\./)
  })
})
