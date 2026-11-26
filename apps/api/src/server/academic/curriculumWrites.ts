import { MODELS } from "../http/models"
import type { BridgeDeps } from "../auth/types"
import { requestInput, type PhpArray } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import type { z } from "zod"
import { curriculumConfigurationSchema, requirementSchema, subjectLayoutSchema } from "@silabos/shared/schemas/academic"
import { validateSchema } from "../http/schemaValidation"
import { requestBoolean } from "../syllabus/inProgressWorkHelpers"
import { Missing, settle } from "../syllabus/reviewDecisions"
import { careerSession, invalid, type CareerContext } from "./careerWrites"
import { phpIntCast } from "./governanceWrites"
import { CONVOCATION_LOCK_REASON } from "./structure"
import { unmatchedRoute, routeAllows } from "../http/router"

type CurriculumCareer = { id: string; cycleCount: number }
type CurriculumSubject = { id: string; code: string; name: string; cycle: number | null; position: number }

export interface CurriculumTx {
  careerLocked(careerId: string): Promise<boolean>
  lockCareer(careerId: string, curriculumId: string): Promise<CurriculumCareer | null>
  maxCycle(careerId: string): Promise<number | null>
  updateCycleCount(careerId: string, cycleCount: number): Promise<void>
  lockSubjects(careerId: string, subjectIds: string[]): Promise<{ id: string; cycle: number | null }[]>
  prerequisites(careerId: string): Promise<{ subjectId: string; requirementId: string }[]>
  findRequirement(subjectId: string, requirementId: string): Promise<{ id: string; type: string } | null>
  insertRequirement(subjectId: string, requirementId: string, type: string): Promise<string>
  lockRequirement(requirementId: string, careerId: string): Promise<{ id: string; type: string } | null>
  deleteRequirement(requirementId: string): Promise<void>
  lockSubject(subjectId: string, careerId: string): Promise<CurriculumSubject | null>
  subjectUsage(subjectId: string): Promise<{ parallels: number; syllabi: number }>
  deleteSubject(subjectId: string): Promise<void>
  lockCycleSubjects(careerId: string, cycle: number): Promise<{ id: string; position: number }[]>
  setPosition(subjectId: string, position: number): Promise<void>
  sync(confirmed: boolean, careerId: string): Promise<void>
  guard<T>(confirmed: boolean, careerId: string, change: () => Promise<T>): Promise<T>
}

export type CurriculumDeps = {
  bridge: BridgeDeps
  careerActive(careerId: string): Promise<boolean>
  transaction<T>(work: (tx: CurriculumTx) => Promise<T>): Promise<T>
}

type Mutation = (tx: CurriculumTx, career: CurriculumCareer, context: CareerContext, input: PhpArray) => Promise<string>

async function curriculumChange(
  request: Request,
  ids: string[],
  deps: CurriculumDeps,
  schema: ((input: PhpArray) => z.ZodType) | null,
  mutate: Mutation,
  requestedCareerId: string | null,
): Promise<Response> {
  const original = request.clone()
  if (!routeAllows(request)) return unmatchedRoute(request)
  const context = await careerSession(request.clone(), deps.bridge, deps.careerActive, requestedCareerId)
  if (context instanceof Response) return context
  const input = await requestInput(request)
  const errors = schema === null ? null : (await validateSchema(schema(input), input)).errors
  if (errors !== null) return validationError(errors)
  return settle(original, deps, async () => {
    const message = await deps.transaction((tx) => curriculumMutation(tx, context, ids[0], input, mutate))
    return apiJson({ message })
  })
}

function confirmedSync(tx: CurriculumTx, context: CareerContext, input: PhpArray): Promise<void> {
  return tx.sync(requestBoolean(input.confirm_purge), context.careerId)
}

export function updateCurriculumConfiguration(request: Request, curriculumId: string, deps: CurriculumDeps, requestedCareerId: string | null = null): Promise<Response> {
  return curriculumChange(
    request,
    [curriculumId],
    deps,
    () => curriculumConfigurationSchema,
    async (tx, career, context, input) => {
      const cycleCount = phpIntCast(input.cycle_count)
      const lastUsed = (await tx.maxCycle(career.id)) ?? 0
      if (lastUsed > cycleCount) throw invalid("cycle_count", `Existen materias en el ciclo ${lastUsed}. Muévalas antes de reducir la malla.`)
      await tx.updateCycleCount(career.id, cycleCount)
      await confirmedSync(tx, context, input)
      return "Configuración de la malla actualizada."
    },
    requestedCareerId,
  )
}

function createsCycle(relations: { subjectId: string; requirementId: string }[], subjectId: string, requirementId: string): boolean {
  const pending = [requirementId]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const current = pending.pop() as string
    if (current === subjectId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const relation of relations) if (relation.subjectId === current) pending.push(relation.requirementId)
  }
  return false
}

export async function addRequirement(tx: CurriculumTx, career: CurriculumCareer, context: CareerContext, input: PhpArray): Promise<string> {
  const subjectId = input.subject_id as string
  const requirementId = input.requirement_id as string
  const type = input.type as string
  const subjects = await tx.lockSubjects(career.id, [subjectId, requirementId])
  if (subjects.length !== 2) throw invalid("requirement_id", "Ambas materias deben pertenecer a la malla actual.")
  const subjectCycle = subjects.find((subject) => subject.id === subjectId)?.cycle ?? 0
  const requirementCycle = subjects.find((subject) => subject.id === requirementId)?.cycle ?? 0
  if (type === "prerrequisito" && requirementCycle >= subjectCycle) throw invalid("requirement_id", "Un prerrequisito debe estar en un ciclo anterior.")
  if (type === "correquisito" && requirementCycle !== subjectCycle) throw invalid("requirement_id", "Un correquisito debe estar en el mismo ciclo.")
  if (type === "prerrequisito" && createsCycle(await tx.prerequisites(career.id), subjectId, requirementId)) {
    throw invalid("requirement_id", "La relación produciría un ciclo de prerrequisitos.")
  }
  const message = type === "correquisito" ? "Correquisito agregado." : "Prerrequisito agregado."
  const existing = await tx.findRequirement(subjectId, requirementId)
  if (existing !== null && existing.type !== type) throw invalid("requirement_id", "Esa materia ya está registrada con otro tipo de requisito.")
  if (existing !== null) return message
  await tx.insertRequirement(subjectId, requirementId, type)
  await confirmedSync(tx, context, input)
  return message
}

export async function curriculumMutation(tx: CurriculumTx, context: CareerContext, curriculumId: string, input: PhpArray, mutate: Mutation): Promise<string> {
  return tx.guard(requestBoolean(input.confirm_purge), context.careerId, async () => {
    if (await tx.careerLocked(context.careerId)) throw invalid("process", CONVOCATION_LOCK_REASON)
    const career = await tx.lockCareer(context.careerId, curriculumId)
    if (career === null) throw new Missing(MODELS.career, curriculumId)
    return mutate(tx, career, context, input)
  })
}

export function createSubjectRequirement(request: Request, curriculumId: string, deps: CurriculumDeps, requestedCareerId: string | null = null): Promise<Response> {
  return curriculumChange(
    request,
    [curriculumId],
    deps,
    (input) => requirementSchema({ subjectId: input.subject_id, hasSubject: "subject_id" in input }),
    addRequirement,
    requestedCareerId,
  )
}

export function deleteSubjectRequirement(request: Request, curriculumId: string, requirementId: string, deps: CurriculumDeps, requestedCareerId: string | null = null): Promise<Response> {
  return curriculumChange(request, [curriculumId, requirementId], deps, null, async (tx, career, context, input) => {
    const requirement = await tx.lockRequirement(requirementId, career.id)
    if (requirement === null) throw new Missing(MODELS.requirement, requirementId)
    await tx.deleteRequirement(requirement.id)
    await confirmedSync(tx, context, input)
    return "Relación académica eliminada."
  }, requestedCareerId)
}

export function deleteCurriculumSubject(request: Request, curriculumId: string, subjectId: string, deps: CurriculumDeps, requestedCareerId: string | null = null): Promise<Response> {
  return curriculumChange(request, [curriculumId, subjectId], deps, null, async (tx, career, context, input) => {
    const subject = await tx.lockSubject(subjectId, career.id)
    if (subject === null) throw new Missing(MODELS.subject, subjectId)
    const { parallels, syllabi } = await tx.subjectUsage(subject.id)
    if (parallels > 0 || syllabi > 0) {
      const blockers: string[] = []
      if (parallels > 0) blockers.push(parallels === 1 ? "1 paralelo" : `${parallels} paralelos`)
      if (syllabi > 0) blockers.push(syllabi === 1 ? "1 sílabo" : `${syllabi} sílabos`)
      throw invalid(
        "subject",
        `No se puede eliminar «${subject.name}»: tiene ${blockers.join(" y ")}. Estos son registros de otros procesos, no las relaciones de la malla. Archívela para conservar el historial.`,
      )
    }
    await tx.deleteSubject(subject.id)
    await confirmedSync(tx, context, input)
    return "Materia eliminada de la malla."
  }, requestedCareerId)
}

export function updateSubjectLayout(request: Request, curriculumId: string, deps: CurriculumDeps, requestedCareerId: string | null = null): Promise<Response> {
  return curriculumChange(
    request,
    [curriculumId],
    deps,
    () => subjectLayoutSchema,
    async (tx, career, context, input) => {
      const cycle = phpIntCast(input.cycle)
      if (cycle > career.cycleCount) throw invalid("cycle", "El ciclo excede la configuración de la malla.")
      const subject = await tx.lockSubject(input.subject_id as string, career.id)
      if (subject === null) throw new Missing(MODELS.subject)
      if (cycle !== subject.cycle) throw invalid("cycle", "Una materia solo puede reordenarse dentro de su ciclo.")
      const ordered = (await tx.lockCycleSubjects(career.id, cycle)).filter((item) => item.id !== subject.id)
      const position = Math.min(phpIntCast(input.position), ordered.length)
      const moving = { id: subject.id, position: subject.position }
      ordered.splice(position, 0, moving)
      for (const [index, item] of ordered.entries()) {
        if (item.position === index) continue
        await tx.setPosition(item.id, index)
        item.position = index
      }
      await confirmedSync(tx, context, input)
      return "Posición de la materia actualizada."
    },
    requestedCareerId,
  )
}
