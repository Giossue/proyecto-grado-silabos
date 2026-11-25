import type { ReactElement } from "react"
import { render } from "@react-email/render"
import { CoordinatorSummaryMail, type CoordinatorSummaryData } from "./templates/CoordinatorSummaryMail"
import { DailySummaryMail, type DailySummaryData } from "./templates/DailySummaryMail"
import type { MailApp } from "./templates/MailLayout"
import { ManagedUserActivationMail, type ManagedUserActivationData } from "./templates/ManagedUserActivationMail"
import { ResetPasswordMail } from "./templates/ResetPasswordMail"
import { WorkflowNotificationMail, type WorkflowNotificationData } from "./templates/WorkflowNotificationMail"

export { coordinatorLines } from "./templates/CoordinatorSummaryMail"
export type { MailApp } from "./templates/MailLayout"

export type MailableData = {
  activation: ManagedUserActivationData
  workflow: WorkflowNotificationData
  daily: DailySummaryData
  coordinator: CoordinatorSummaryData
  resetPassword: { token: string; email: string; expireMinutes: number }
}

export type MailableName = keyof MailableData

export type QueuedMail = { [K in MailableName]: { mailable: K; to: string; data: MailableData[K] } }[MailableName]

export type RenderedMail = { subject: string; headers: Record<string, string>; html: string; text: string }

export const DAILY_SUMMARY_SUBJECT = "Resumen del día: sílabos pendientes"

const CLASS_SUBJECTS: Record<MailableName, string> = {
  activation: "Managed User Activation Mail",
  workflow: "Workflow Notification Mail",
  daily: "Daily Summary Mail",
  coordinator: "Coordinator Summary Mail",
  resetPassword: "Reset Password",
}

const RESET_SUBJECT = "Solicitud de cambio de contraseña"

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

type Mailable = { subject: string; headers: Record<string, string>; element: ReactElement }

function mailableFor(mail: QueuedMail, app: MailApp): Mailable {
  switch (mail.mailable) {
    case "activation":
      return {
        subject: `Su invitación a ${app.name}`,
        headers: { Importance: "high", "X-Priority": "1", Priority: "urgent" },
        element: <ManagedUserActivationMail app={app} data={mail.data} />,
      }
    case "workflow":
      return { subject: mail.data.title, headers: {}, element: <WorkflowNotificationMail app={app} data={mail.data} /> }
    case "daily":
      return { subject: DAILY_SUMMARY_SUBJECT, headers: {}, element: <DailySummaryMail app={app} data={mail.data} /> }
    case "coordinator":
      return { subject: DAILY_SUMMARY_SUBJECT, headers: {}, element: <CoordinatorSummaryMail app={app} data={mail.data} /> }
    case "resetPassword": {
      const url = resetPasswordUrl(app.frontendUrl, mail.data.token, mail.data.email)
      return { subject: RESET_SUBJECT, headers: {}, element: <ResetPasswordMail app={app} url={url} expireMinutes={mail.data.expireMinutes} /> }
    }
  }
}

const TEXT_OPTIONS = { selectors: [{ selector: "h1", options: { uppercase: false } }] }

export async function renderMailable(mail: QueuedMail, app: MailApp): Promise<RenderedMail> {
  const mailable = mailableFor(mail, app)
  const [html, text] = await Promise.all([render(mailable.element), render(mailable.element, { plainText: true, htmlToTextOptions: TEXT_OPTIONS })])
  const subject = mailable.subject !== "" && mailable.subject !== "0" ? mailable.subject : CLASS_SUBJECTS[mail.mailable]
  return { subject, headers: mailable.headers, html, text }
}
