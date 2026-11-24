import { bladeSlot, e, htmlButton, renderMarkdownMail, textButton, type MailApp } from "./layout"

export type MailableData = {
  activation: { name: string; roleName: string; activationUrl: string; careerName: string | null }
  workflow: { name: string; title: string; body: string; url: string }
  daily: { name: string; lines: string[]; buttonLabel: string; url: string }
  coordinator: { name: string; careers: Array<{ career: string; review: number }>; url: string }
  resetPassword: { token: string; email: string; expireMinutes: number }
}

export type MailableName = keyof MailableData

export type QueuedMail = { [K in MailableName]: { mailable: K; to: string; data: MailableData[K] } }[MailableName]

export type RenderedMail = { subject: string; headers: Record<string, string>; html: string; text: string }

export const DAILY_SUMMARY_SUBJECT = "Resumen del día: sílabos pendientes"

type Button = (url: string, label: string) => string

const CLASS_SUBJECTS: Record<MailableName, string> = {
  activation: "Managed User Activation Mail",
  workflow: "Workflow Notification Mail",
  daily: "Daily Summary Mail",
  coordinator: "Coordinator Summary Mail",
  resetPassword: "Reset Password",
}

const RESET_SUBJECT = "Solicitud de cambio de contraseña"
const RESET_HEADING = "Restablezca su contraseña"
const RESET_INTRO = "Elija una contraseña nueva para su cuenta con el botón."
const RESET_ACTION = "Restablecer contraseña"
const RESET_OUTRO = "Si no hizo esta solicitud, ignore este correo; su contraseña no cambiará."
const SUBCOPY = "Si el botón no funciona, copie este enlace en su navegador:"

export function phpUrlencode(value: string): string {
  return [...new TextEncoder().encode(value)]
    .map((byte) => {
      const character = String.fromCharCode(byte)
      if (/[A-Za-z0-9_.-]/.test(character)) return character
      return byte === 0x20 ? "+" : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
    })
    .join("")
}

export function resetPasswordUrl(frontendUrl: string, token: string, email: string): string {
  return `${frontendUrl.replace(/\/+$/, "")}/restablecer-contrasena?token=${phpUrlencode(token)}&email=${phpUrlencode(email)}`
}

const truthy = (value: string | null) => value !== null && value !== "" && value !== "0"

function activationBody(data: MailableData["activation"], button: Button): string {
  const account = truthy(data.careerName)
    ? `Tiene una cuenta como **${e(data.roleName)}** de la carrera **${e(data.careerName as string)}**. Para ingresar, elija su contraseña.\n`
    : `Tiene una cuenta como **${e(data.roleName)}**. Para ingresar, elija su contraseña.\n`
  const contact = truthy(data.careerName) ? "la coordinación de su carrera" : "la administración del sistema"
  return `\n# Le damos la bienvenida\n\nHola ${e(data.name)}:\n\n${account}\n${button(data.activationUrl, "Activar mi cuenta")}\nEl enlace es personal, de un solo uso y caduca en 7 días. Si no esperaba este correo, avise a ${e(contact)}.\n`
}

function workflowBody(data: MailableData["workflow"], button: Button): string {
  return `\nHola ${e(data.name)}:\n\n${e(data.body)}\n\n${button(data.url, "Abrir el sistema")}`
}

function dailyBody(data: MailableData["daily"], button: Button): string {
  const lines = data.lines.map((line) => `- ${e(line)}\n`).join("")
  return `\n# Pendientes de hoy\n\nHola ${e(data.name)}:\n\n${lines}\n${button(data.url, bladeSlot(`\n${e(data.buttonLabel)}\n`))}`
}

export function coordinatorLines(careers: MailableData["coordinator"]["careers"]): string[] {
  return careers
    .filter((career) => career.review > 0)
    .map((career) => (career.review === 1 ? `${career.career}: 1 sílabo por revisar.` : `${career.career}: ${career.review} sílabos por revisar.`))
}

function resetBody(url: string, minutes: number, button: Button): string {
  const lines = [RESET_INTRO].map((line) => `${e(line)}\n\n`).join("")
  const outro = [`El enlace caduca en ${minutes} minutos.`, RESET_OUTRO].map((line) => `${e(line)}\n\n`).join("")
  return `# ${e(RESET_HEADING)}\n\n${lines}\n${button(url, e(RESET_ACTION))}\n${outro}\n`
}

type Mailable = { subject: (app: MailApp) => string; headers: Record<string, string>; body: (button: Button) => string; subcopy?: string }

function bodies(mail: QueuedMail, app: MailApp): Mailable {
  switch (mail.mailable) {
    case "activation":
      return {
        subject: (app) => `Su invitación a ${app.name}`,
        headers: { Importance: "high", "X-Priority": "1", Priority: "urgent" },
        body: (button) => activationBody(mail.data, button),
      }
    case "workflow":
      return { subject: () => mail.data.title, headers: {}, body: (button) => workflowBody(mail.data, button) }
    case "daily":
      return { subject: () => DAILY_SUMMARY_SUBJECT, headers: {}, body: (button) => dailyBody(mail.data, button) }
    case "coordinator":
      return {
        subject: () => DAILY_SUMMARY_SUBJECT,
        headers: {},
        body: (button) => dailyBody({ name: mail.data.name, lines: coordinatorLines(mail.data.careers), buttonLabel: "Abrir revisión", url: mail.data.url }, button),
      }
    case "resetPassword": {
      const url = resetPasswordUrl(app.frontendUrl, mail.data.token, mail.data.email)
      return {
        subject: () => RESET_SUBJECT,
        headers: {},
        body: (button) => resetBody(url, mail.data.expireMinutes, button),
        subcopy: `${SUBCOPY} <span class="break-all">[${e(url)}](${e(url)})</span>`,
      }
    }
  }
}

export function renderMailable(mail: QueuedMail, app: MailApp): RenderedMail {
  const mailable = bodies(mail, app)
  const rendered = renderMarkdownMail(app, {
    html: mailable.body((url, label) => htmlButton(url, label)),
    text: mailable.body((url, label) => textButton(e(url), label)),
    subcopy: mailable.subcopy,
  })
  const subject = mailable.subject(app)
  return { subject: truthy(subject) ? subject : CLASS_SUBJECTS[mail.mailable], headers: mailable.headers, ...rendered }
}
