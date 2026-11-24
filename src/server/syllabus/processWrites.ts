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
import { auditOf, Missing, Rejected, settle } from "./reviewDecisions"
import { NeedsLaravel } from "./snapshotDocuments"

export type LockedSyllabusProcess = { id: string; state: string; periodId: string; period: string; dueAt: number; extensions: number; periodEndsOn: string }
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
  templateChangedDuringPause(processId: string): Promise<boolean>
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
  const errors = await validateInput(await laravelInput(request), { confirmar_rehacer: ["sometimes", "boolean"] }, { confirmar_rehacer: "confirmación para rehacer los sílabos" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const locked = await tx.lockProcess(process.id)
      if (locked === null) throw new Missing()
      if (locked.state !== "pausado") reject({ process: [WRONG_STATE] })
      const problem = await tx.templateProblem("process")
      if (problem !== null) reject({ process: [problem] })
      if (await tx.templateChangedDuringPause(locked.id)) throw new NeedsLaravel()
      await tx.updateState(locked.id, "abierto")
      await tx.recordAudit(auditOf(session, "proceso_silabos.abierto", "proceso_silabos", locked.id, { previous_state: locked.state }, deps.now()))
      await notifyProcessResumed(tx, locked, deps)
    })
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

function deadlineBlock(process: LockedSyllabusProcess, today: string): string | null {
  if (process.extensions >= 2) return "Ya se usaron las 2 prórrogas de esta convocatoria."
  if (institutionDayOf(process.dueAt) >= process.periodEndsOn) return `El plazo ya llega al último día de clases (${display(process.periodEndsOn)}).`
  if (process.periodEndsOn < today) return `Las clases del período terminaron el ${display(process.periodEndsOn)}.`
  return null
}

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
    await deps.transaction(async (tx) => {
      const locked = await tx.lockProcess(process.id)
      if (locked === null) throw new Missing()
      if (locked.state === "cerrado") throw new NeedsLaravel()
      const previousOn = institutionDayOf(locked.dueAt)
      const blocked = deadlineBlock(locked, institutionDayOf(deps.now()))
      if (blocked !== null) reject({ process: [blocked] })
      if (requestedOn < institutionDayOf(deps.now())) reject({ due_at: ["La nueva fecha ya pasó."] })
      if (requestedOn <= previousOn) reject({ due_at: [`La nueva fecha debe ser posterior a la vigente, que es el ${display(previousOn)}.`] })
      if (requestedOn > locked.periodEndsOn) reject({ due_at: [`La nueva fecha no puede pasar del último día de clases (${display(locked.periodEndsOn)}).`] })
      const extension = locked.extensions + 1
      await tx.extendDeadline(locked.id, iso8601(requested), extension)
      await tx.recordAudit(
        auditOf(session, "proceso_silabos.plazo_extendido", "proceso_silabos", locked.id, {
          stage: "borrador",
          previous_due_at: iso8601(locked.dueAt),
          new_due_at: iso8601(requested),
          convocations_reached: await tx.convocationCount(locked.id),
          extension_number: extension,
        }, deps.now()),
      )
      await storeInternalNotifications(tx.notifications, {
        eventType: "proceso.plazo_extendido",
        deduplicationKey: `proceso.plazo_extendido:${locked.id}:${requested}`,
        recipientIds: await tx.teachersWithPendingWork(locked.id),
        title: "Plazo extendido",
        message: `La entrega de sílabos del proceso «${locked.period}» se amplió hasta el ${notificationDate(requested)}.`,
        resourceType: "proceso_silabos",
        resourceId: locked.id,
      })
    })
    return laravelJson({ message: "Plazo prorrogado para todas las convocatorias del proceso." })
  })
}
