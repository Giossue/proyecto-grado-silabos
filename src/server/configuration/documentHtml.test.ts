// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/html-golden.json"
import { phpJsonEncode } from "../http/phpJson"
import { documentFromHtml, documentLines } from "./documentHtml"

describe("documentFromHtml", () => {
  it("produces the same document nodes as DocumentHtml::fromHtml for every golden case", () => {
    const mismatches = golden.filter((item) => phpJsonEncode(documentFromHtml(item.html, item.layout)) !== item.document)
    expect(mismatches.map((item) => item.html)).toEqual([])
    expect(golden.length).toBeGreaterThan(500)
  })

  it("round-trips the lines it reads back into the same document", () => {
    for (const item of golden.slice(0, 40)) {
      const document = documentFromHtml(item.html, item.layout)
      expect(phpJsonEncode(documentFromHtml(documentLines(document), item.layout))).toBe(phpJsonEncode(document))
    }
  })

  it("returns an empty paragraph for empty input and keeps sections only in layouts", () => {
    expect(documentFromHtml("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] })
    expect(documentFromHtml("<section><p>a</p></section>", true)).toEqual({ type: "doc", content: [{ type: "group", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }] })
    expect(documentFromHtml("<section><p>a</p></section>")).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] })
  })
})
