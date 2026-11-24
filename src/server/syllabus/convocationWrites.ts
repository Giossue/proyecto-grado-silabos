import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { isJsonRequest, laravelInput } from "../laravel/input"
import { forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { notificationDate, storeInternalNotifications, type NotificationScope } from "../notifications/store"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import type { ConvocationRecord } from "./convocations"
import type { GenerateOptions } from "./inProgressWork"
import { createConvocationWriteDeps } from "./convocationWriteStore"
import { auditOf, Missing, Rejected, settle } from "./reviewDecisions"

export type LockedProcess = { id: string; state: string; periodId: string }
export type LockedConvocation = { id: string; careerId: string; careerLabel: string; state: string; processState: string; dueAt: number }

export interface ConvocationWriteTx {
  notifications: NotificationScope
  generateConvocation(convocationId: string, options?: GenerateOptions): Promise<number>
  teacherSyllabusCounts(convocationIds: string[]): Promise<Map<string, number>>
  lockProcess(id: string): Promise<LockedProcess | null>
  careerHasConvocation(careerId: string, processId: string): Promise<boolean>
  createConvocation(careerId: string, processId: string): Promise<string>
  lockConvocation(id: string): Promise<LockedConvocation | null>
  readinessBlockers(careerId: string): Promise<string[]>
  templateProblem(errorKey: string): Promise<string | null>
  updateState(id: string, state: string): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export type ConvocationWriteDeps = {
  bridge: BridgeDeps
  convocation(id: string): Promise<ConvocationRecord | null>
  openProcessExists(id: string): Promise<boolean>
  now: () => number
  nowMs: () => number
  transaction<T>(work: (tx: ConvocationWriteTx) => Promise<T>): Promise<T>
}

export function defaultConvocationWriteDeps(): ConvocationWriteDeps {
  return { bridge: defaultBridgeDeps(), ...createConvocationWriteDeps() }
}

function reject(errors: Record<string, string[]>): never {
  throw new Rejected(validationError(errors))
}

function isCoordinatorOf(session: LaravelSession, careerId: string | null): boolean {
  return session.user.active && session.activeRole?.role === "coordinador" && (careerId === null ? session.activeRole.careerId !== null : session.activeRole.careerId === careerId)
}

const PROCESS_NOT_OPEN: Record<string, string> = {
  pausado: "El proceso institucional está en pausa. Podrá abrir cuando Administración lo reanude.",
  cerrado: "El proceso institucional ya se cerró. Prepare la convocatoria sobre un proceso vigente.",
}

async function openConvocation(tx: ConvocationWriteTx, session: LaravelSession, convocationId: string, now: number): Promise<void> {
  const convocation = await tx.lockConvocation(convocationId)
  if (convocation === null) throw new Missing()
  if (convocation.state !== "preparacion") reject({ convocation: ["Solo una convocatoria en preparación puede abrirse."] })
  if (convocation.processState !== "abierto") {
    reject({ convocation: [PROCESS_NOT_OPEN[convocation.processState] ?? "El proceso institucional todavía no se abre. Podrá abrir cuando Administración lo inicie."] })
  }
  const blockers = await tx.readinessBlockers(convocation.careerId)
  if (blockers.length > 0) reject({ convocation: blockers })
  const problem = await tx.templateProblem("convocation")
  if (problem !== null) reject({ convocation: [problem] })
  const generated = await tx.generateConvocation(convocation.id)
  await tx.updateState(convocation.id, "abierta")
  await tx.recordAudit(auditOf(session, "convocatoria.abierta", "convocatoria", convocation.id, { generated_count: generated }, now))
  const message = `Se abrió la convocatoria de ${convocation.careerLabel}; la entrega vence el ${notificationDate(convocation.dueAt)}.`
  for (const [teacherId, count] of await tx.teacherSyllabusCounts([convocation.id])) {
    await storeInternalNotifications(tx.notifications, {
      eventType: "convocatoria.abierta",
      deduplicationKey: `convocatoria.abierta:${convocation.id}:${teacherId}`,
      recipientIds: [teacherId],
      title: count === 1 ? "Tiene un sílabo por elaborar" : `Tiene ${count} sílabos por elaborar`,
      message,
      resourceType: "convocatoria",
      resourceId: convocation.id,
    })
  }
}

export async function createConvocation(request: Request, deps: ConvocationWriteDeps = defaultConvocationWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!isCoordinatorOf(session, null)) return forbidden()
  const input = await laravelInput(request)
  const errors = await validateInput(input, { process_id: ["required", "uuid", { exists: (value) => deps.openProcessExists(String(value)) }] }, { process_id: "proceso" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const processId = input.process_id as string
  const careerId = session.activeRole!.careerId as string
  return settle(original, deps, async () => {
    const id = await deps.transaction(async (tx) => {
      const process = await tx.lockProcess(processId)
      if (process === null) throw new Missing()
      if (process.state !== "abierto") reject({ process_id: ["La convocatoria institucional todavía no está abierta."] })
      if (await tx.careerHasConvocation(careerId, process.id)) reject({ process_id: ["Esta carrera ya tiene una convocatoria para el período institucional."] })
      const convocationId = await tx.createConvocation(careerId, process.id)
      const now = deps.now()
      await tx.recordAudit(auditOf(session, "convocatoria.iniciada", "convocatoria", convocationId, { process_id: process.id, period_id: process.periodId }, now))
      await openConvocation(tx, session, convocationId, now)
      return convocationId
    })
    return laravelJson({ message: "Convocatoria iniciada: se generó un sílabo por cada paralelo.", convocation_id: id }, 201)
  })
}

export function timestampMs(milliseconds: number): string {
  const date = new Date(milliseconds)
  const pad = (value: number, length = 2) => String(value).padStart(length, "0")
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}${pad(date.getUTCMilliseconds(), 3)}`
}

export async function notifyConvocationResumed(tx: Pick<ConvocationWriteTx, "notifications" | "teacherSyllabusCounts">, convocation: Pick<LockedConvocation, "id" | "careerLabel">, at: string): Promise<void> {
  for (const teacherId of (await tx.teacherSyllabusCounts([convocation.id])).keys()) {
    await storeInternalNotifications(tx.notifications, {
      eventType: "convocatoria.reanudada",
      deduplicationKey: `convocatoria.reanudada:${convocation.id}:${teacherId}:${at}`,
      recipientIds: [teacherId],
      title: "Se reanudó la convocatoria",
      message: `Ya puede seguir con sus sílabos de ${convocation.careerLabel}.`,
      resourceType: "convocatoria",
      resourceId: convocation.id,
    })
  }
}

export async function resumeConvocation(request: Request, id: string, deps: ConvocationWriteDeps = defaultConvocationWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (!isUuid(id)) return deps.bridge.forward(original)
  let record: ConvocationRecord | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        record = await deps.convocation(id)
        return record === null ? deps.bridge.forward(original) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  const convocation = record as ConvocationRecord | null
  if (convocation === null) return deps.bridge.forward(original)
  if (!isCoordinatorOf(session, convocation.careerId) || convocation.state !== "pausada") return forbidden()
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const locked = await tx.lockConvocation(convocation.id)
      if (locked === null) throw new Missing()
      if (locked.state !== "pausada") reject({ convocation: ["Solo una convocatoria pausada puede reanudarse."] })
      if (locked.processState !== "abierto") {
        reject({ convocation: ["El proceso institucional no está abierto; la convocatoria se reanudará cuando Administración lo reanude."] })
      }
      const generated = await tx.generateConvocation(locked.id)
      await tx.updateState(locked.id, "abierta")
      await tx.recordAudit(auditOf(session, "convocatoria.abierta", "convocatoria", locked.id, generated > 0 ? { generated_count: generated } : {}, deps.now()))
      await notifyConvocationResumed(tx, locked, timestampMs(deps.nowMs()))
    })
    return laravelJson({ message: "Convocatoria reanudada. Los docentes vuelven a trabajar, los paralelos nuevos ya tienen su sílabo y la malla queda protegida." })
  })
}
