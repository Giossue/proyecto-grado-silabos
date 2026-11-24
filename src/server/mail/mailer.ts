import "server-only"
import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"
import { mailConfig, type MailConfig } from "./config"
import { renderMailable, type QueuedMail } from "./mailables"

export type MailAddress = { address: string; name: string }

export type SentMail = { from: MailAddress[]; to: MailAddress[]; subject: string; html: string; text: string; raw: string }

export type Mailer = { send(mail: QueuedMail): Promise<SentMail>; readonly sent: SentMail[] }

export type MailerOptions = { log?: (message: string) => void }

export function smtpOptions(config: MailConfig): SMTPTransport.Options {
  return {
    host: config.host,
    port: config.port,
    secure: config.scheme === "smtps" || config.port === 465,
    ...(config.localDomain ? { name: config.localDomain } : {}),
    ...(config.username ? { auth: { user: config.username, pass: config.password ?? "" } } : {}),
  }
}

const captureOptions = { streamTransport: true, buffer: true, newline: "unix" } as const

function transportFor(config: MailConfig) {
  if (config.mailer === "smtp") return { transport: nodemailer.createTransport(smtpOptions(config)), captures: false }
  if (config.mailer === "log" || config.mailer === "array") return { transport: nodemailer.createTransport(captureOptions), captures: true }
  throw new Error(`Mailer [${config.mailer}] is not supported.`)
}

export function createMailer(config: MailConfig, options: MailerOptions = {}): Mailer {
  const { transport, captures } = transportFor(config)
  const log = options.log ?? ((message: string) => console.debug(message))
  const sent: SentMail[] = []
  return {
    sent,
    async send(mail) {
      const rendered = renderMailable(mail, config.app)
      const info = await transport.sendMail({
        from: { name: config.from.name, address: config.from.address },
        to: mail.to,
        subject: rendered.subject,
        headers: rendered.headers,
        text: rendered.text,
        html: rendered.html,
      })
      const raw = captures && "message" in info && Buffer.isBuffer(info.message) ? info.message.toString("utf8") : ""
      if (config.mailer === "log") log(raw)
      const message: SentMail = { from: [config.from], to: [{ address: mail.to, name: "" }], subject: rendered.subject, html: rendered.html, text: rendered.text, raw }
      if (config.mailer === "array") sent.push(message)
      return message
    },
  }
}

const globalForMailer = globalThis as unknown as { silabosMailer?: Mailer }

export function sharedMailer(): Mailer {
  globalForMailer.silabosMailer ??= createMailer(mailConfig())
  return globalForMailer.silabosMailer
}
