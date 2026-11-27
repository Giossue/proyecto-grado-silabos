import type { PrismaService } from "../../prisma/prisma.service"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput, type PhpArray, type PhpValue } from "../http/input"
import { forbidden, apiJson, validationError } from "../http/responses"
import { deadlineExtensionSchema, redoConfirmationSchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { notificationDate, storeInternalNotifications, type NotificationScope } from "../notifications/store"
import { notifyConvocationResumed, timestampMs } from "./convocationWrites"
import { hasRole, ROLE_ADMINISTRATOR } from "./policy"
import { display, processDay, processInstant, type ProcessRow } from "./processes"
import { createProcessWriteDeps } from "./processWriteStore"
import { deadlineBlockReason } from "./finalizedChangeNotice"
import { requestBoolean } from "./inProgressWorkHelpers"
import type { ReopenPlan, TemplateChange } from "./reopenCatchUp"
import { Missing, Rejected, settle } from "./reviewDecisions"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

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
  adaptToTemplate(processId: string, change: TemplateChange): Promise<void>
  convocationsToReopen(processId: string): Promise<string[]>
  reopenPlan(convocationIds: string[], processId: string, finalized: boolean): Promise<ReopenPlan>
  reopen(processId: string): Promise<string[]>
  applyPlan(plan: ReopenPlan, convocationIds: string[], periodId: string): Promise<void>
  generateReopened(convocationIds: string[]): Promise<void>
  openConvocations(processId: string): Promise<OpenConvocation[]>
  updateState(processId: string, state: string): Promise<void>
  extendDeadline(processId: string, dueAt: string, extension: number): Promise<void>
  teachersWithPendingWork(processId: string): Promise<string[]>
}

export type ProcessWriteDeps = {
  bridge: BridgeDeps
  find(id: string): Promise<ProcessRow | null>
  now: () => number
  nowMs: () => number
  transaction<T>(work: (tx: ProcessWriteTx) => Promise<T>): Promise<T>
}

export function defaultProcessWriteDeps(prisma: PrismaService): ProcessWriteDeps {
  return { bridge: defaultBridgeDeps(), ...createProcessWriteDeps(prisma) }
}

const WRONG_STATE = "El proceso no está en un estado que admita esta acción."
const PAUSE_TEMPLATE_CHANGED =
  "La plantilla cambió durante la pausa. Confirme para adaptar los sílabos del período: se conserva lo escrito y los enviados o aprobados vuelven a borrador."
const CLOSED_TEMPLATE_CHANGED =
  "La plantilla cambió después de finalizar. Confirme para adaptar los sílabos del período: se conserva lo escrito y los enviados o aprobados vuelven a borrador."
const PENDING_CHANGES =
  "Hubo cambios mientras el proceso de sílabos estuvo finalizado. Confirme para aplicarlos: hay sílabos que volverán a borrador, volverán a Coordinación o perderán su contenido."

function reject(errors: Record<string, string[]>): never {
  throw new Rejected(validationError(errors))
}

async function bindProcess(request: Request, id: string, deps: ProcessWriteDeps): Promise<{ session: AppSession; process: ProcessRow } | Response> {
  let process: ProcessRow | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        process = isUuid(id) ? await deps.find(id) : null
        return process === null ? modelNotFound(MODELS.process, id) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (process === null) return modelNotFound(MODELS.process, id)
  return { session, process }
}

export async function deleteProcess(request: Request, id: string, deps: ProcessWriteDeps): Promise<Response> {
  const original = request.clone()
  const bound = await bindProcess(request, id, deps)
  if (bound instanceof Response) return bound
  return deleteBoundProcess(original, bound.session, bound.process, deps)
}

export async function deleteBoundProcess(original: Request, session: AppSession, process: ProcessRow, deps: ProcessWriteDeps): Promise<Response> {
  if (!hasRole(session, ROLE_ADMINISTRATOR) || !["abierto", "pausado"].includes(process.state)) return forbidden()
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const locked = await tx.lockProcess(process.id)
      if (locked === null) throw new Missing(MODELS.process, process.id)
      if (locked.state === "cerrado") reject({ process: ["Un proceso de sílabos cerrado no se elimina: queda como historial."] })
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
        title: "Proceso de sílabos eliminado",
        message: `Administración eliminó el proceso de sílabos ${locked.period} y todos sus sílabos.`,
        resourceType: "periodo_academico",
        resourceId: locked.periodId,
        periodId: locked.periodId,
      })
    })
    return apiJson({ message: "Proceso de sílabos eliminado." })
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
      title: "Administración reanudó el proceso de sílabos",
      message: `Se retoman la edición y las revisiones de los sílabos del período ${process.period}.`,
      resourceType: "proceso_silabos",
      resourceId: process.id,
    })
  }
}

export async function resumeProcess(request: Request, id: string, deps: ProcessWriteDeps): Promise<Response> {
  const original = request.clone()
  const bound = await bindProcess(original.clone(), id, deps)
  if (bound instanceof Response) return bound
  return resumeBoundProcess(original, bound.session, bound.process, await requestInput(request), deps)
}

export async function resumeBoundProcess(original: Request, session: AppSession, process: ProcessRow, input: PhpArray, deps: ProcessWriteDeps): Promise<Response> {
  if (!hasRole(session, ROLE_ADMINISTRATOR) || process.state !== "pausado") return forbidden()
  const { errors } = await validateSchema(redoConfirmationSchema, input)
  if (errors !== null) return validationError(errors)
  return settle(original, deps, async () => {
    const confirmation = await deps.transaction(async (tx) => {
      const locked = await tx.lockProcess(process.id)
      if (locked === null) throw new Missing(MODELS.process, process.id)
      if (locked.state !== "pausado") reject({ process: [WRONG_STATE] })
      const problem = await tx.templateProblem("process")
      if (problem !== null) reject({ process: [problem] })
      const change = await tx.templateChange(locked.id, "pause")
      if (change !== null) {
        const counts = await tx.syllabusCounts(locked.id, false)
        if (!requestBoolean(input.confirmar_rehacer)) return counts
        await tx.adaptToTemplate(locked.id, change)
      }
      await tx.updateState(locked.id, "abierto")
      await notifyProcessResumed(tx, locked, deps)
      return null
    })
    if (confirmation !== null) return apiJson({ message: PAUSE_TEMPLATE_CHANGED, code: "plantilla_cambiada", counts: confirmation }, 422)
    return apiJson({ message: "Proceso reanudado. Los envíos vuelven a admitirse." })
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

export async function extendProcessDeadline(request: Request, id: string, deps: ProcessWriteDeps): Promise<Response> {
  const original = request.clone()
  const bound = await bindProcess(request, id, deps)
  if (bound instanceof Response) return bound
  return extendBoundProcessDeadline(original, bound.session, bound.process, await requestInput(request), deps)
}

export async function extendBoundProcessDeadline(original: Request, session: AppSession, process: ProcessRow, input: PhpArray, deps: ProcessWriteDeps): Promise<Response> {
  if (!hasRole(session, ROLE_ADMINISTRATOR)) return forbidden()
  input.due_at = processDay(input.due_at, false) as PhpValue
  const { errors } = await validateSchema(deadlineExtensionSchema, input)
  if (errors !== null) return validationError(errors)
  const requested = processInstant(input.due_at)
  const requestedOn = institutionDayOf(requested)
  return settle(original, deps, async () => {
    const outcome = await deps.transaction(async (tx): Promise<DeadlineConfirmation | { reopened: boolean }> => {
      const locked = await tx.lockProcess(process.id)
      if (locked === null) throw new Missing(MODELS.process, process.id)
      const reopening = locked.state === "cerrado"
      if (reopening) await tx.lockOtherProcesses(locked.id)
      const previousOn = institutionDayOf(locked.dueAt)
      const blocked = await deadlineBlockReason({ anotherInProgress: (processId) => tx.anotherInProgress(processId), templateProblem: () => tx.templateProblem("process") }, locked, deps.now())
      if (blocked !== null) reject({ process: [blocked] })
      if (requestedOn < institutionDayOf(deps.now())) reject({ due_at: ["La nueva fecha ya pasó."] })
      if (requestedOn <= previousOn) reject({ due_at: [`La nueva fecha debe ser posterior a la vigente, que es el ${display(previousOn)}.`] })
      if (requestedOn > locked.periodEndsOn) reject({ due_at: [`La nueva fecha no puede pasar del último día de clases (${display(locked.periodEndsOn)}).`] })
      let change: TemplateChange | null = null
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
          const counts = await tx.syllabusCounts(locked.id, true)
          if (!requestBoolean(input.confirmar_rehacer)) return { code: "plantilla_cambiada", counts, pending }
        }
        if (pending !== null && !requestBoolean(input.confirmar_cambios)) return { code: "cambios_pendientes", counts: pending, pending: null }
        reopened = await tx.reopen(locked.id)
      }
      const extension = locked.extensions + 1
      await tx.extendDeadline(locked.id, iso8601(requested), extension)
      if (change !== null) await tx.adaptToTemplate(locked.id, change)
      if (plan !== null) await tx.applyPlan(plan, convocationIds, locked.periodId)
      if (reopened.length > 0) await tx.generateReopened(reopened)
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
      if (outcome.code === "cambios_pendientes") return apiJson({ message: PENDING_CHANGES, code: outcome.code, counts: outcome.counts }, 422)
      return apiJson(
        { message: CLOSED_TEMPLATE_CHANGED, code: outcome.code, counts: outcome.counts, ...(outcome.pending === null ? {} : { pending_counts: outcome.pending }) },
        422,
      )
    }
    return apiJson({ message: outcome.reopened ? "Plazo prorrogado. El proceso de sílabos se volvió a abrir." : "Plazo prorrogado para todos los procesos de sílabos." })
  })
}
