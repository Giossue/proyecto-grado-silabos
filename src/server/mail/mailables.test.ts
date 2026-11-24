// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/mail-golden.json"
import { coordinatorLines, renderMailable, type QueuedMail } from "./mailables"

type GoldenCase = { mail: QueuedMail; expected: { subject: string; headers: Record<string, string>; html: string; text: string } }

const cases = golden.cases as unknown as GoldenCase[]

describe("renderMailable", () => {
  it.each(cases.map((item, index) => [`${index} ${item.mail.mailable} ${item.mail.to}`, item] as const))("renders %s byte for byte like Laravel", (_label, item) => {
    const rendered = renderMailable(item.mail, golden.app)
    expect(rendered.subject).toBe(item.expected.subject)
    expect(rendered.headers).toEqual(item.expected.headers)
    expect(rendered.text).toBe(item.expected.text)
    expect(rendered.html).toBe(item.expected.html)
  })

  it("covers the four Laravel mailables", () => {
    expect(new Set(cases.map((item) => item.mail.mailable))).toEqual(new Set(["activation", "workflow", "daily", "coordinator"]))
  })

  it("lists only careers with syllabi to review, singular for one", () => {
    expect(coordinatorLines([{ career: "A", review: 1 }, { career: "B", review: 0 }, { career: "C", review: 2 }])).toEqual(["A: 1 sílabo por revisar.", "C: 2 sílabos por revisar."])
  })
})
