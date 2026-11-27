import type { QueuedMail } from "../mail/mailables"
import { wantsEmail } from "../operations/emailNoticeCatalog"
import type { AfterCommit } from "../queue/dispatch"
import type { NotificationEmailConfig } from "./config"
import { workflowMessage } from "./workflowMessages"

const IN_APP_EVENTS = new Set([
  "silabo.correccion_solicitada",
  "silabo.devuelto_borrador",
  "silabo.regenerado",
  "silabo.eliminado",
  "proceso.plantilla_rehecho",
  "documento.exportacion_fallida",
])

export type NotificationRecipient = { id: string; name: string; email: string; verified: boolean; preferences: unknown }

export type NotificationRow = {
  userId: string
  key: string
  type: string
  title: string
  message: string
  resourceType: string
  resourceId: string
  periodId: string | null
  notifiedAt: number
}

export interface NotificationTx {
  recipients(ids: string[]): Promise<NotificationRecipient[]>
  periodOf(resourceType: string, resourceId: string): Promise<string | null>
  create(row: NotificationRow): Promise<boolean>
  subjectOf(syllabusId: string): Promise<string | null>
}

export type NotificationScope = {
  tx: NotificationTx
  afterCommit: AfterCommit
  mail: (mail: QueuedMail) => Promise<unknown>
  now: number
  email: NotificationEmailConfig
  frontendUrl: string
}

export type InternalNotice = {
  eventType: string
  deduplicationKey: string
  recipientIds: string[]
  title: string
  message: string
  resourceType: string
  resourceId: string
  periodId?: string | null
}

function email(scope: NotificationScope, recipient: NotificationRecipient, eventType: string, title: string, message: string): void {
  if (!scope.email.enabled || !scope.email.events.includes(eventType) || !recipient.verified || !wantsEmail(recipient.preferences, eventType)) return
  const url = `${scope.frontendUrl.replace(/\/+$/, "")}/`
  scope.afterCommit(() => scope.mail({ mailable: "workflow", to: recipient.email, data: { name: recipient.name, title, body: message, url } }))
}

export async function storeInternalNotifications(scope: NotificationScope, notice: InternalNotice): Promise<number> {
  const ids = [...new Set(notice.recipientIds)]
  if (ids.length === 0) return 0
  const recipients = await scope.tx.recipients(ids)
  if (!IN_APP_EVENTS.has(notice.eventType)) {
    for (const recipient of recipients) email(scope, recipient, notice.eventType, notice.title, notice.message)
    return recipients.length
  }
  const periodId = notice.periodId ?? (await scope.tx.periodOf(notice.resourceType, notice.resourceId))
  for (const recipient of recipients) {
    const created = await scope.tx.create({
      userId: recipient.id,
      key: `flujo:${notice.deduplicationKey}`,
      type: notice.eventType,
      title: notice.title,
      message: notice.message,
      resourceType: notice.resourceType,
      resourceId: notice.resourceId,
      periodId,
      notifiedAt: scope.now,
    })
    if (created) email(scope, recipient, notice.eventType, notice.title, notice.message)
  }
  return recipients.length
}

export type WorkflowNotice = {
  syllabusId: string
  eventType: string
  deduplicationKey: string
  recipientIds: string[]
  revisionNumber: number | null
  artifactId?: string | null
}

export async function scheduleWorkflowNotification(scope: NotificationScope, notice: WorkflowNotice): Promise<void> {
  const [title, message] = workflowMessage(notice.eventType, await scope.tx.subjectOf(notice.syllabusId), notice.revisionNumber)
  const artifactId = notice.artifactId ?? null
  await storeInternalNotifications(scope, {
    eventType: notice.eventType,
    deduplicationKey: notice.deduplicationKey,
    recipientIds: notice.recipientIds,
    title,
    message,
    resourceType: artifactId === null ? "silabo" : "artefacto_exportacion",
    resourceId: artifactId ?? notice.syllabusId,
  })
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

export function notificationDate(seconds: number, timeZone: string = process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(seconds * 1000))
      .map((part) => [part.type, part.value]),
  )
  return `${Number(parts.day)} de ${MONTHS[Number(parts.month) - 1]} de ${parts.year}, ${parts.hour}:${parts.minute}`
}
