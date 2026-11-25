// @vitest-environment node
import { describe, expect, it } from "vitest"
import { phpFloat, phpJsonEncode } from "./phpJson"

describe("phpJsonEncode", () => {
  it("writes PHP floats with a trailing .0 when they are whole numbers, like json_encode", () => {
    expect(phpJsonEncode({ whole: phpFloat(12), part: phpFloat(4.5), zero: phpFloat(0), negative: phpFloat(-3), int: 7 })).toBe(
      '{"whole":12.0,"part":4.5,"zero":0.0,"negative":-3.0,"int":7}',
    )
  })

  it("keeps the float marker inside lists and pretty output", () => {
    expect(phpJsonEncode([phpFloat(1)], { pretty: true })).toBe("[\n    1.0\n]")
  })

  it("does not confuse a user string with the float marker", () => {
    expect(phpJsonEncode({ text: "1.0" })).toBe('{"text":"1.0"}')
  })
})
