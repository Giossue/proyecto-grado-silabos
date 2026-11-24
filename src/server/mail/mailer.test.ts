// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/mail-golden.json"
import { mailConfig } from "./config"
import type { QueuedMail } from "./mailables"
import { createMailer, smtpOptions } from "./mailer"
import { createSendMailJob, sendMailJob } from "./sendMailJob"

type GoldenCase = { mail: QueuedMail; expected: { subject: string; from: unknown; to: unknown; headers: Record<string, string>; html: string; text: string } }

const env = {
  MAIL_MAILER: "array",
  MAIL_FROM_ADDRESS: golden.from.address,
  MAIL_FROM_NAME: golden.from.name,
  LARAVEL_APP_NAME: golden.app.name,
  FRONTEND_URL: `${golden.app.frontendUrl},http://localhost:5173`,
  LARAVEL_APP_LOCALE: golden.app.locale,
}

describe("mailer", () => {
  it("sends each mailable with Laravel's sender, recipient, subject, priority headers and bodies", async () => {
    const mailer = createMailer(mailConfig(env))
    for (const item of golden.cases as unknown as GoldenCase[]) {
      const sent = await mailer.send(item.mail)
      expect(sent.from).toEqual(item.expected.from)
      expect(sent.to).toEqual(item.expected.to)
      expect(sent.subject).toBe(item.expected.subject)
      expect(sent.html).toBe(item.expected.html)
      expect(sent.text).toBe(item.expected.text)
      for (const [name, value] of Object.entries(item.expected.headers)) expect(sent.raw).toContain(`${name}: ${value}\n`)
    }
    expect(mailer.sent).toHaveLength(golden.cases.length)
  })

  it("writes the whole message to the log with the log mailer, like Laravel's log transport", async () => {
    const lines: string[] = []
    const mailer = createMailer(mailConfig({ ...env, MAIL_MAILER: "log" }), { log: (line) => lines.push(line) })
    await mailer.send({ mailable: "workflow", to: "persona@example.test", data: { name: "Ana", title: "Aviso", body: "Hola", url: "http://localhost:3000/" } })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("To: persona@example.test")
    expect(lines[0]).toContain("Subject: Aviso")
    expect(lines[0]).toContain("Content-Type: text/html")
    expect(lines[0]).toContain("Content-Type: text/plain")
  })

  it("maps MAIL_* to SMTP like Laravel: implicit TLS for smtps or port 465, login only with a user", () => {
    const base = { ...env, MAIL_MAILER: "smtp", MAIL_HOST: "smtp.example.test", MAIL_PORT: "587", MAIL_SCHEME: "null" }
    expect(smtpOptions(mailConfig(base))).toEqual({ host: "smtp.example.test", port: 587, secure: false, name: "localhost" })
    expect(smtpOptions(mailConfig({ ...base, MAIL_PORT: "465", MAIL_USERNAME: "u", MAIL_PASSWORD: "p", APP_URL: "https://silabos.example.test" }))).toEqual({
      host: "smtp.example.test",
      port: 465,
      secure: true,
      name: "silabos.example.test",
      auth: { user: "u", pass: "p" },
    })
    expect(smtpOptions(mailConfig({ ...base, MAIL_SCHEME: "smtps" })).secure).toBe(true)
  })

  it("refuses a mailer it does not support instead of dropping mail", () => {
    expect(() => createMailer(mailConfig({ ...env, MAIL_MAILER: "ses" }))).toThrow("Mailer [ses] is not supported.")
  })

  it("sends queued mail from the general queue job", async () => {
    const mailer = createMailer(mailConfig(env))
    const mail = (golden.cases as unknown as GoldenCase[])[0].mail
    const job = createSendMailJob(() => mailer)
    expect({ name: job.name, queue: job.queue }).toEqual({ name: sendMailJob.name, queue: "general" })
    await job.handle(mail, { attempt: 1, jobId: "1", signal: new AbortController().signal })
    expect(mailer.sent.map((sent) => sent.to)).toEqual([[{ address: mail.to, name: "" }]])
  })
})
