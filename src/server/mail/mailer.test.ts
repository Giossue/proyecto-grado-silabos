// @vitest-environment node
import { describe, expect, it } from "vitest"
import { mailConfig } from "./config"
import { renderMailable, type QueuedMail } from "./mailables"
import { createMailer, smtpOptions } from "./mailer"
import { createSendMailJob, sendMailJob } from "./sendMailJob"

const env = {
  MAIL_MAILER: "array",
  MAIL_FROM_ADDRESS: "no-reply@example.test",
  MAIL_FROM_NAME: "Sílabos UEB",
  APP_NAME: "Sílabos UEB",
  FRONTEND_URL: "http://localhost:3000,http://localhost:5173",
  APP_LOCALE: "es",
}

const app = { name: "Sílabos UEB", frontendUrl: "http://localhost:3000", locale: "es" }

const mails: Array<{ mail: QueuedMail; subject: string; headers: Record<string, string> }> = [
  {
    mail: { mailable: "activation", to: "maria@example.test", data: { name: "María Pérez", roleName: "Docente", activationUrl: "http://localhost:3000/activar-cuenta?token=abc", careerName: null } },
    subject: "Su invitación a Sílabos UEB",
    headers: { Importance: "high", "X-Priority": "1", Priority: "urgent" },
  },
  { mail: { mailable: "workflow", to: "ana@example.test", data: { name: "Ana", title: "Aviso", body: "Hola", url: "http://localhost:3000/" } }, subject: "Aviso", headers: {} },
  {
    mail: { mailable: "daily", to: "luis@example.test", data: { name: "Luis", lines: ["Derecho: 1 sílabo por corregir."], buttonLabel: "Abrir mis sílabos", url: "http://localhost:3000/docente/mis-silabos" } },
    subject: "Resumen del día: sílabos pendientes",
    headers: {},
  },
  {
    mail: { mailable: "coordinator", to: "carlos@example.test", data: { name: "Carlos", careers: [{ career: "Derecho", review: 2 }], url: "http://localhost:3000/coordinacion/revisiones" } },
    subject: "Resumen del día: sílabos pendientes",
    headers: {},
  },
  { mail: { mailable: "resetPassword", to: "docente@example.test", data: { token: "abc", email: "docente@example.test", expireMinutes: 60 } }, subject: "Solicitud de cambio de contraseña", headers: {} },
]

describe("mailer", () => {
  it("sends each mailable with the configured sender, its recipient, subject, priority headers and both bodies", async () => {
    const mailer = createMailer(mailConfig(env))
    for (const item of mails) {
      const sent = await mailer.send(item.mail)
      const rendered = await renderMailable(item.mail, app)
      expect(sent.from).toEqual([{ address: "no-reply@example.test", name: "Sílabos UEB" }])
      expect(sent.to).toEqual([{ address: item.mail.to, name: "" }])
      expect(sent.subject).toBe(item.subject)
      expect(sent.html).toBe(rendered.html)
      expect(sent.text).toBe(rendered.text)
      for (const [name, value] of Object.entries(item.headers)) expect(sent.raw).toContain(`${name}: ${value}\n`)
    }
    expect(mailer.sent).toHaveLength(mails.length)
  })

  it("keeps the reset link readable in the logged message", async () => {
    const lines: string[] = []
    const mailer = createMailer(mailConfig({ ...env, MAIL_MAILER: "log" }), { log: (line) => lines.push(line) })
    await mailer.send({ mailable: "resetPassword", to: "docente@example.test", data: { token: "a1b2", email: "docente@example.test", expireMinutes: 60 } })
    const raw = lines[0].replace(/=\r?\n/g, "").replace(/=3D/g, "=")
    expect(raw).toContain("To: docente@example.test")
    expect(raw.match(/https?:\/\/[^\s"<>]*restablecer-contrasena[^\s"<>]*/)?.[0]).toBe("http://localhost:3000/restablecer-contrasena?token=a1b2&email=docente%40example.test")
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
    const mail = mails[0].mail
    const job = createSendMailJob(() => mailer)
    expect({ name: job.name, queue: job.queue }).toEqual({ name: sendMailJob.name, queue: "general" })
    await job.handle(mail, { attempt: 1, jobId: "1", signal: new AbortController().signal })
    expect(mailer.sent.map((sent) => sent.to)).toEqual([[{ address: mail.to, name: "" }]])
  })
})
