// @vitest-environment node
import { describe, expect, it } from "vitest"
import { laravelInput } from "./input"

function post(body: unknown, query = ""): Request {
  return new Request(`http://localhost:3000/api/v1/x${query}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
}

describe("laravelInput", () => {
  it("trims every string and turns empty ones into null, like TrimStrings and ConvertEmptyStringsToNull", async () => {
    expect(await laravelInput(post({ title: "  Hola  ", note: "   ", list: [" a ", ""] }, "?screen=%20panel%20"))).toEqual({
      title: "Hola",
      note: null,
      list: { "0": "a", "1": null },
      screen: "panel",
    })
  })

  it("keeps the spaces of the keys that Laravel never trims but still turns empty strings into null", async () => {
    const text = { type: "text", text: " Hola " }
    const input = await laravelInput(
      post({ content: { text: " a " }, value: " b ", values: [" c "], sections: [{ title: " T ", fields: [{ key: " k ", content: { content: [text, { text: "" }] } }] }] }),
    )
    expect(input).toEqual({
      content: { text: " a " },
      value: " b ",
      values: { "0": " c " },
      sections: { "0": { title: "T", fields: { "0": { key: "k", content: { content: { "0": { type: "text", text: " Hola " }, "1": { text: null } } } } } } },
    })
  })
})
