import type { PrismaService } from "../../prisma/prisma.service"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput } from "../http/input"
import { forbidden, apiJson, validationError } from "../http/responses"
import { convocationSchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { notificationDate, storeInternalNotifications, type NotificationScope } from "../notifications/store"
import type { ConvocationRecord } from "./convocations"
import type { GenerateOptions } from "./inProgressWorkHelpers"
import { createConvocationWriteDeps } from "./convocationWriteStore"
import { Missing, Rejected, settle } from "./reviewDecisions"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"
import { requireBound, type Binder } from "./boundSession"

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
}

export type ConvocationWriteDeps = {
  bridge: BridgeDeps
  convocation(id: string): Promise<ConvocationRecord | null>
  openProcessExists(id: string): Promise<boolean>
  nowMs: () => number
  transaction<T>(work: (tx: ConvocationWriteTx) => Promise<T>): Promise<T>
}

export function defaultConvocationWriteDeps(prisma: PrismaService): ConvocationWriteDeps {
  return { bridge: defaultBridgeDeps(), ...createConvocationWriteDeps(prisma) }
}

function reject(errors: Record<string, string[]>): never {
  throw new Rejected(validationError(errors))
}

function isCoordinatorOf(session: AppSession, careerId: string | null): boolean {
  return session.user.active && session.activeRole?.role === "coordinador" && (careerId === null ? session.activeRole.careerId !== null : session.activeRole.careerId === careerId)
}

const PROCESS_NOT_OPEN: Record<string, string> = {
  pausado: "El proceso institucional está en pausa. Podrá abrir cuando Administración lo reanude.",
  cerrado: "El proceso institucional ya se cerró. Prepare el periodo académico sobre un proceso vigente.",
}

async function openConvocation(tx: ConvocationWriteTx, convocationId: string): Promise<void> {
  const convocation = await tx.lockConvocation(convocationId)
  if (convocation === null) throw new Missing(MODELS.convocation, convocationId)
  if (convocation.state !== "preparacion") reject({ convocation: ["Solo un periodo académico en preparación puede abrirse."] })
  if (convocation.processState !== "abierto") {
    reject({ convocation: [PROCESS_NOT_OPEN[convocation.processState] ?? "El proceso institucional todavía no se abre. Podrá abrir cuando Administración lo inicie."] })
  }
  const blockers = await tx.readinessBlockers(convocation.careerId)
  if (blockers.length > 0) reject({ convocation: blockers })
  const problem = await tx.templateProblem("convocation")
  if (problem !== null) reject({ convocation: [problem] })
  await tx.generateConvocation(convocation.id)
  await tx.updateState(convocation.id, "abierta")
  const message = `Se abrió el periodo académico de ${convocation.careerLabel}; la entrega vence el ${notificationDate(convocation.dueAt)}.`
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

export async function createConvocation(request: Request, deps: ConvocationWriteDeps): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  return createConvocationFor(request, session, deps)
}

export async function createConvocationFor(request: Request, session: AppSession, deps: ConvocationWriteDeps): Promise<Response> {
  const original = request.clone()
  if (!isCoordinatorOf(session, null)) return forbidden()
  const input = await requestInput(request)
  const { errors } = await validateSchema(convocationSchema((value) => deps.openProcessExists(String(value))), input)
  if (errors !== null) return validationError(errors)
  const processId = input.process_id as string
  const careerId = session.activeRole!.careerId as string
  return settle(original, deps, async () => {
    const id = await deps.transaction(async (tx) => {
      const process = await tx.lockProcess(processId)
      if (process === null) throw new Missing(MODELS.process, processId)
      if (process.state !== "abierto") reject({ process_id: ["El periodo académico todavía no está abierto."] })
      if (await tx.careerHasConvocation(careerId, process.id)) reject({ process_id: ["Esta carrera ya abrió este periodo académico."] })
      const convocationId = await tx.createConvocation(careerId, process.id)
      await openConvocation(tx, convocationId)
      return convocationId
    })
    return apiJson({ message: "Periodo académico iniciado: se generó un sílabo por cada paralelo.", convocation_id: id }, 201)
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
      title: "Se reanudó el periodo académico",
      message: `Ya puede seguir con sus sílabos de ${convocation.careerLabel}.`,
      resourceType: "convocatoria",
      resourceId: convocation.id,
    })
  }
}

export function resumableConvocationBinder(id: string, deps: Pick<ConvocationWriteDeps, "convocation">): Binder<ConvocationRecord> {
  return async () => {
    const record = isUuid(id) ? await deps.convocation(id) : null
    return record === null ? modelNotFound(MODELS.convocation, id) : record
  }
}

export async function resumeConvocation(request: Request, id: string, deps: ConvocationWriteDeps): Promise<Response> {
  const bound = await requireBound(request, resumableConvocationBinder(id, deps), deps.bridge)
  if (bound instanceof Response) return bound
  return resumeConvocationFor(request, bound.session, bound.bound, deps)
}

export async function resumeConvocationFor(request: Request, session: AppSession, convocation: ConvocationRecord, deps: ConvocationWriteDeps): Promise<Response> {
  const original = request.clone()
  if (!isCoordinatorOf(session, convocation.careerId) || convocation.state !== "pausada") return forbidden()
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const locked = await tx.lockConvocation(convocation.id)
      if (locked === null) throw new Missing(MODELS.convocation, convocation.id)
      if (locked.state !== "pausada") reject({ convocation: ["Solo un periodo académico pausado puede reanudarse."] })
      if (locked.processState !== "abierto") {
        reject({ convocation: ["El proceso institucional no está abierto; el periodo académico se reanudará cuando Administración lo reanude."] })
      }
      await tx.generateConvocation(locked.id)
      await tx.updateState(locked.id, "abierta")
      await notifyConvocationResumed(tx, locked, timestampMs(deps.nowMs()))
    })
    return apiJson({ message: "Periodo académico reanudado. Los docentes vuelven a trabajar, los paralelos nuevos ya tienen su sílabo y la malla queda protegida." })
  })
}
