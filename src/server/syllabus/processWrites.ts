import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { isJsonRequest, laravelInput, type PhpValue } from "../laravel/input"
import { forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { notificationDate, storeInternalNotifications, type NotificationScope } from "../notifications/store"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { notifyConvocationResumed, timestampMs } from "./convocationWrites"
import { hasRole, ROLE_ADMINISTRATOR } from "./policy"
import { display, processDay, type ProcessRow } from "./processes"
import { createProcessWriteDeps } from "./processWriteStore"
import { deadlineBlockReason } from "./finalizedChangeNotice"
import { laravelBoolean } from "./inProgressWork"
import type { ReopenPlan, TemplateChange } from "./reopenCatchUp"
import { auditOf, Missing, Rejected, settle } from "./reviewDecisions"
import { NeedsLaravel } from "./snapshotDocuments"

export type LockedSyllabusProcess = {
  id: string
  state: string
  periodId: string
  period: string
  dueAt: number
  extensions: number
  periodEndsOn: string
  finalized: boolean
}

export type AuditActor = { actorId: string; roleAssignmentId: string | null; occurredAt: number }
export type OpenConvocation = { id: string; careerLabel: string }

export interface ProcessWriteTx {
  notifications: NotificationScope
  lockProcess(id: string): Promise<LockedSyllabusProcess | null>
  lockConvocations(processId: string): Promise<string[]>
  lockSyllabi(convocationIds: string[]): Promise<string[]>
  teachersForProcess(processId: string): Promise<string[]>
  coordinatorsForProcess(processId: string): Promise<string[]>
  librarians(): Promise<string[]>
  teacherSyllabusCounts(convocationIds: string[]): Promise<Map<string, number>>
  purge(syllabusIds: string[]): Promise<void>
  deleteProcess(processId: string, convocationIds: string[]): Promise<void>
  templateProblem(errorKey: string): Promise<string | null>
  lockOtherProcesses(processId: string): Promise<void>
  anotherInProgress(processId: string): Promise<boolean>
  templateChange(processId: string, reference: "pause" | "reopen"): Promise<TemplateChange | null>
  syllabusCounts(processId: string, toReopen: boolean): Promise<Record<string, number>>
  adaptToTemplate(processId: string, change: TemplateChange, counts: Record<string, number>, audit: AuditActor): Promise<void>
  convocationsToReopen(processId: string): Promise<string[]>
  reopenPlan(convocationIds: string[], processId: string, finalized: boolean): Promise<ReopenPlan>
  reopen(processId: string): Promise<string[]>
  applyPlan(plan: ReopenPlan, convocationIds: string[], periodId: string): Promise<void>
  generateReopened(convocationIds: string[]): Promise<void>
  openConvocations(processId: string): Promise<OpenConvocation[]>
  updateState(processId: string, state: string): Promise<void>
  extendDeadline(processId: string, dueAt: string, extension: number): Promise<void>
  convocationCount(processId: string): Promise<number>
  teachersWithPendingWork(processId: string): Promise<string[]>
  recordAudit(event: AuditEventInput): Promise<void>
}

export type ProcessWriteDeps = {
  bridge: BridgeDeps
  find(id: string): Promise<ProcessRow | null>
  now: () => number
  nowMs: () => number
  transaction<T>(work: (tx: ProcessWriteTx) => Promise<T>): Promise<T>
}

export function defaultProcessWriteDeps(): ProcessWriteDeps {
  return { bridge: defaultBridgeDeps(), ...createProcessWriteDeps() }
}

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g
const ASK_MESSAGE = "Escriba el mensaje para docentes, coordinación y biblioteca."
const WRONG_STATE = "El proceso no está en un estado que admita esta acción."
const PAUSE_TEMPLATE_CHANGED =
  "La plantilla cambió durante la pausa. Confirme para adaptar los sílabos del período: se conserva lo escrito y los enviados o aprobados vuelven a borrador."
const CLOSED_TEMPLATE_CHANGED =
  "La plantilla cambió después de finalizar. Confirme para adaptar los sílabos del período: se conserva lo escrito y los enviados o aprobados vuelven a borrador."
const PENDING_CHANGES =
  "Hubo cambios mientras la convocatoria estuvo finalizada. Confirme para aplicarlos: hay sílabos que volverán a borrador, volverán a Coordinación o perderán su contenido."

function actorOf(session: LaravelSession, occurredAt: number): AuditActor {
  return { actorId: session.user.id, roleAssignmentId: session.activeRole?.id ?? null, occurredAt }
}

function reject(errors: Record<string, string[]>): never {
  throw new Rejected(validationError(errors))
}

async function bindProcess(request: Request, id: string, deps: ProcessWriteDeps): Promise<{ session: LaravelSession; process: ProcessRow } | Response> {
  if (!isUuid(id)) return deps.bridge.forward(request)
  let process: ProcessRow | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        process = await deps.find(id)
        return process === null ? deps.bridge.forward(request) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (process === null) return deps.bridge.forward(request)
  return { session, process }
}

export async function deleteProcess(request: Request, id: string, deps: ProcessWriteDeps = defaultProcessWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const bound = await bindProcess(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, process } = bound
  if (!hasRole(session, ROLE_ADMINISTRATOR) || !["abierto", "pausado"].includes(process.state)) return forbidden()
  const input = await laravelInput(request)
  const errors = await validateInput(
    input,
    { mensaje: ["required", "string", { max: 1000 }] },
    { mensaje: "mensaje para docentes, coordinación y biblioteca" },
    { messages: { "mensaje.required": ASK_MESSAGE, "mensaje.string": ASK_MESSAGE, "mensaje.max": "El mensaje no puede pasar de 1000 caracteres." } },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const notice = (input.mensaje as string).replace(PHP_TRIM, "")
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const locked = await tx.lockProcess(process.id)
      if (locked === null) throw new Missing()
      if (locked.state === "cerrado") reject({ process: ["Una convocatoria cerrada no se elimina: queda como historial."] })
      const convocations = await tx.lockConvocations(locked.id)
      const syllabi = await tx.lockSyllabi(convocations)
      const people = [...new Set([...(await tx.teachersForProcess(locked.id)), ...(await tx.coordinatorsForProcess(locked.id)), ...(await tx.librarians())])]
      const recipients = people.filter((person) => person !== session.user.id)
      await tx.purge(syllabi)
      await tx.deleteProcess(locked.id, convocations)
      await storeInternalNotifications(tx.notifications, {
        eventType: "proceso.eliminado",
        deduplicationKey: `proceso.eliminado:${locked.id}`,
        recipientIds: recipients,
        title: "Convocatoria eliminada",
        message: `Se borraron todos los sílabos de ${locked.period}. Mensaje de Administración: ${notice}`,
        resourceType: "periodo_academico",
        resourceId: locked.periodId,
        periodId: locked.periodId,
      })
      await tx.recordAudit(
        auditOf(session, "proceso_silabos.eliminado", "proceso_silabos", process.id, {
          period_id: locked.periodId,
          previous_state: locked.state,
          deleted_convocations: convocations.length,
          deleted_syllabi: syllabi.length,
          notified_people: recipients.length,
        }, deps.now()),
      )
    })
    return laravelJson({ message: "Convocatoria institucional eliminada." })
  })
}

async function notifyProcessResumed(tx: ProcessWriteTx, process: LockedSyllabusProcess, deps: ProcessWriteDeps): Promise<void> {
  for (const convocation of await tx.openConvocations(process.id)) {
    await notifyConvocationResumed(
      { notifications: tx.notifications, teacherSyllabusCounts: (ids) => tx.teacherSyllabusCounts(ids) },
      convocation,
      timestampMs(deps.nowMs()),
    )
  }
  const at = timestampMs(deps.nowMs())
  const staff = [...new Set([...(await tx.coordinatorsForProcess(process.id)), ...(await tx.librarians())])]
  for (const person of staff) {
    await storeInternalNotifications(tx.notifications, {
      eventType: "proceso.reanudado",
      deduplicationKey: `proceso.reanudado:${process.id}:${person}:${at}`,
      recipientIds: [person],
      title: "Administración reanudó la convocatoria",
      message: `Se retoman la edición y las revisiones de los sílabos del período ${process.period}.`,
      resourceType: "proceso_silabos",
      resourceId: process.id,
    })
  }
}

export async function resumeProcess(request: Request, id: string, deps: ProcessWriteDeps = defaultProcessWriteDeps()): Promise<Response> {
  const original = request.clone()
  const bound = await bindProcess(original.clone(), id, deps)
  if (bound instanceof Response) return bound
  const { session, process } = bound
  if (!hasRole(session, ROLE_ADMINISTRATOR) || process.state !== "pausado") return forbidden()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const input = await laravelInput(request)
  const errors = await validateInput(input, { confirmar_rehacer: ["sometimes", "boolean"] }, { confirmar_rehacer: "confirmación para rehacer los sílabos" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  return settle(original, deps, async () => {
    const confirmation = await deps.transaction(async (tx) => {
      const locked = await tx.lockProcess(process.id)
      if (locked === null) throw new Missing()
      if (locked.state !== "pausado") reject({ process: [WRONG_STATE] })
      const problem = await tx.templateProblem("process")
      if (problem !== null) reject({ process: [problem] })
      const change = await tx.templateChange(locked.id, "pause")
      let counts: Record<string, number> = {}
      if (change !== null) {
        counts = await tx.syllabusCounts(locked.id, false)
        if (!laravelBoolean(input.confirmar_rehacer)) return counts
        await tx.adaptToTemplate(locked.id, change, counts, actorOf(session, deps.now()))
      }
      await tx.updateState(locked.id, "abierto")
      await tx.recordAudit(auditOf(session, "proceso_silabos.abierto", "proceso_silabos", locked.id, { previous_state: locked.state }, deps.now()))
      await notifyProcessResumed(tx, locked, deps)
      return null
    })
    if (confirmation !== null) return laravelJson({ message: PAUSE_TEMPLATE_CHANGED, code: "plantilla_cambiada", counts: confirmation }, 422)
    return laravelJson({ message: "Proceso reanudado. Los envíos vuelven a admitirse." })
  })
}

function institutionDayOf(seconds: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(seconds * 1000),
  )
}

function iso8601(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}+00:00`
}

type DeadlineConfirmation = { code: string; counts: Record<string, number>; pending: Record<string, number> | null }

export async function extendProcessDeadline(request: Request, id: string, deps: ProcessWriteDeps = defaultProcessWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const bound = await bindProcess(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, process } = bound
  if (!hasRole(session, ROLE_ADMINISTRATOR)) return forbidden()
  const input = await laravelInput(request)
  try {
    input.due_at = processDay(input.due_at, false) as PhpValue
  } catch (error) {
    if (error instanceof NeedsLaravel) return deps.bridge.forward(original)
    throw error
  }
  const errors = await validateInput(
    input,
    { stage: ["prohibited"], due_at: ["required"], confirmar_rehacer: ["sometimes", "boolean"], confirmar_cambios: ["sometimes", "boolean"] },
    { stage: "etapa", due_at: "fecha límite", confirmar_rehacer: "confirmación para rehacer los sílabos", confirmar_cambios: "confirmación para aplicar los cambios pendientes" },
    { messages: { "stage.prohibited": "La prórroga solo modifica la fecha límite de entrega." } },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const requested = Math.floor(Date.parse(input.due_at as string) / 1000)
  const requestedOn = institutionDayOf(requested)
  return settle(original, deps, async () => {
    const outcome = await deps.transaction(async (tx): Promise<DeadlineConfirmation | { reopened: boolean }> => {
      const locked = await tx.lockProcess(process.id)
      if (locked === null) throw new Missing()
      const reopening = locked.state === "cerrado"
      if (reopening) await tx.lockOtherProcesses(locked.id)
      const previousOn = institutionDayOf(locked.dueAt)
      const blocked = await deadlineBlockReason({ anotherInProgress: (processId) => tx.anotherInProgress(processId), templateProblem: () => tx.templateProblem("process") }, locked, deps.now())
      if (blocked !== null) reject({ process: [blocked] })
      if (requestedOn < institutionDayOf(deps.now())) reject({ due_at: ["La nueva fecha ya pasó."] })
      if (requestedOn <= previousOn) reject({ due_at: [`La nueva fecha debe ser posterior a la vigente, que es el ${display(previousOn)}.`] })
      if (requestedOn > locked.periodEndsOn) reject({ due_at: [`La nueva fecha no puede pasar del último día de clases (${display(locked.periodEndsOn)}).`] })
      let change: TemplateChange | null = null
      let counts: Record<string, number> = {}
      let reopened: string[] = []
      let convocationIds: string[] = []
      let plan: ReopenPlan | null = null
      if (reopening) {
        const problem = await tx.templateProblem("process")
        if (problem !== null) reject({ process: [problem] })
        change = await tx.templateChange(locked.id, "reopen")
        convocationIds = await tx.convocationsToReopen(locked.id)
        plan = await tx.reopenPlan(convocationIds, locked.id, locked.finalized)
        const pending = Object.values(plan.counts).reduce((sum, value) => sum + value, 0) > 0 ? plan.counts : null
        if (change !== null) {
          counts = await tx.syllabusCounts(locked.id, true)
          if (!laravelBoolean(input.confirmar_rehacer)) return { code: "plantilla_cambiada", counts, pending }
        }
        if (pending !== null && !laravelBoolean(input.confirmar_cambios)) return { code: "cambios_pendientes", counts: pending, pending: null }
        reopened = await tx.reopen(locked.id)
      }
      const extension = locked.extensions + 1
      await tx.extendDeadline(locked.id, iso8601(requested), extension)
      if (change !== null) await tx.adaptToTemplate(locked.id, change, counts, actorOf(session, deps.now()))
      if (plan !== null) await tx.applyPlan(plan, convocationIds, locked.periodId)
      if (reopened.length > 0) await tx.generateReopened(reopened)
      await tx.recordAudit(
        auditOf(session, "proceso_silabos.plazo_extendido", "proceso_silabos", locked.id, {
          stage: "borrador",
          previous_due_at: iso8601(locked.dueAt),
          new_due_at: iso8601(requested),
          convocations_reached: await tx.convocationCount(locked.id),
          extension_number: extension,
        }, deps.now()),
      )
      if (reopening) await tx.recordAudit(auditOf(session, "proceso_silabos.reabierto", "proceso_silabos", locked.id, { previous_state: "cerrado" }, deps.now()))
      await storeInternalNotifications(tx.notifications, {
        eventType: "proceso.plazo_extendido",
        deduplicationKey: `proceso.plazo_extendido:${locked.id}:${requested}`,
        recipientIds: await tx.teachersWithPendingWork(locked.id),
        title: "Plazo extendido",
        message: `La entrega de sílabos del proceso «${locked.period}» se amplió hasta el ${notificationDate(requested)}.`,
        resourceType: "proceso_silabos",
        resourceId: locked.id,
      })
      return { reopened: reopening }
    })
    if ("code" in outcome) {
      if (outcome.code === "cambios_pendientes") return laravelJson({ message: PENDING_CHANGES, code: outcome.code, counts: outcome.counts }, 422)
      return laravelJson(
        { message: CLOSED_TEMPLATE_CHANGED, code: outcome.code, counts: outcome.counts, ...(outcome.pending === null ? {} : { pending_counts: outcome.pending }) },
        422,
      )
    }
    return laravelJson({ message: outcome.reopened ? "Plazo prorrogado. La convocatoria se volvió a abrir." : "Plazo prorrogado para todas las convocatorias del proceso." })
  })
}
