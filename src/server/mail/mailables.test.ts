// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/mail-golden.json"
import resetGolden from "./__fixtures__/reset-password-golden.json"
import type { MailApp } from "./layout"
import { coordinatorLines, renderMailable, resetPasswordUrl, type QueuedMail } from "./mailables"

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

describe("reset password notification", () => {
  type ResetCase = { app: MailApp; mail: QueuedMail; expected: { subject: string; headers: Record<string, string>; html: string; text: string } }
  const resetCases = resetGolden.cases as unknown as ResetCase[]

  it.each(resetCases.map((item, index) => [`${index} ${item.mail.to}`, item] as const))("renders %s byte for byte like Laravel's ResetPassword", (_label, item) => {
    const rendered = renderMailable(item.mail, item.app)
    expect(rendered.subject).toBe(item.expected.subject)
    expect(rendered.headers).toEqual(item.expected.headers)
    expect(rendered.text).toBe(item.expected.text)
    expect(rendered.html).toBe(item.expected.html)
  })

  it("builds the reset link like the FortifyServiceProvider callback, with PHP's urlencode", () => {
    expect(resetPasswordUrl("http://localhost:3000/", "a b+c~", "ana+x@example.test")).toBe(
      "http://localhost:3000/restablecer-contrasena?token=a+b%2Bc%7E&email=ana%2Bx%40example.test",
    )
  })
})
