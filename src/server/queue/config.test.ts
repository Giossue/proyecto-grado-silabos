// @vitest-environment node
import { describe, expect, it } from "vitest"
import { maxRunSeconds } from "./config"

describe("maxRunSeconds", () => {
  it("keeps the worker running unless QUEUE_MAX_TIME asks it to stop", () => {
    expect(maxRunSeconds({})).toBe(0)
    expect(maxRunSeconds({ QUEUE_MAX_TIME: "3600" })).toBe(3600)
    expect(maxRunSeconds({ QUEUE_MAX_TIME: "x" })).toBe(0)
  })
})
