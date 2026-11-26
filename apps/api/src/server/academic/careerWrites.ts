import { MODELS } from "../http/models"
import { requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { ROLE_COMBINATION_MESSAGE, roleCombinationConflicts } from "../identity/accountRules"
import { isJsonRequest, isPhpArray, requestInput, type PhpArray, type PhpValue } from "../http/input"
import { forbidden, apiJson, validationError } from "../http/responses"
import { phpIsNumeric } from "@silabos/shared/schemas/php"
import { mallaTargetSchema, parallelSchema, parallelsSchema, parallelTeacherSchema, subjectSchema, teacherAssignmentSchema } from "@silabos/shared/schemas/academic"
import { validateSchema } from "../http/schemaValidation"
import { requestBoolean, type WorkScope } from "../syllabus/inProgressWorkHelpers"
import { Missing, Rejected, settle } from "../syllabus/reviewDecisions"
import { phpIntCast } from "./governanceWrites"
import { CONVOCATION_LOCK_REASON } from "./structure"
import { unmatchedRoute, routeAllows } from "../http/router"
import { activeCareerId, resolveCareerScope } from "./careerScope"

export const SUBJECT_COLUMNS = [
  "codigo_asignatura",
  "nombre_asignatura",
  "ciclo_asignatura",
  "creditos_asignatura",
  "horas_docencia",
  "horas_practicas",
  "horas_autonomas",
  "orden_asignatura_en_ciclo",
  "unidad_curricular_asignatura",
  "modalidad_asignatura",
  "genera_silabo_asignatura",
] as const

export type SubjectColumn = (typeof SUBJECT_COLUMNS)[number]
export type SubjectValue = string | number | boolean | null
export type SubjectRow = { id: string; careerId: string; mallaId: string; columns: Record<SubjectColumn, SubjectValue> }
export type ParallelRow = { id: string; subjectId: string; code: string; shift: string }
export type CareerConvocation = { id: string; state: string; processState: string }

export interface CareerWriteTx {
  careerLocked(careerId: string): Promise<boolean>
  /** Locks a malla of the career; subjects are created and edited inside the cycles of their malla. */
  lockMalla(careerId: string, mallaId: string): Promise<{ id: string; cycleCount: number } | null>
  lastPosition(mallaId: string, cycle: PhpValue): Promise<number | null>
  insertSubject(careerId: string, mallaId: string, columns: Record<SubjectColumn, PhpValue>): Promise<string>
  subjectGeneratesSyllabus(subjectId: string): Promise<boolean | null>
  lockSubject(subjectId: string, careerId: string): Promise<SubjectRow | null>
  updateSubject(subjectId: string, columns: Partial<Record<SubjectColumn, PhpValue>>): Promise<void>
  subjectsOfParallel(parallelId: string): Promise<string[]>
  parallelsWithStartedSyllabus(parallelIds: string[]): Promise<string[]>
  lockParallel(parallelId: string, careerId: string): Promise<ParallelRow | null>
  hasCoordinatorRole(userId: string, careerId: string): Promise<boolean>
  effectiveRoles(userId: string): Promise<string[]>
  teacherGrant(userId: string, careerId: string): Promise<{ id: string; active: boolean } | null>
  insertTeacherGrant(userId: string, careerId: string): Promise<void>
  eligibleTeacherRole(userId: string, careerId: string): Promise<string | null>
  parallelHasActiveTeacher(parallelId: string): Promise<boolean>
  insertTeacherAssignment(roleId: string, parallelId: string): Promise<string>
  restartForParallel(parallelId: string): Promise<void>
  lockCurrentConvocation(careerId: string): Promise<CareerConvocation | null>
  generateParallelSyllabus(convocationId: string, parallelId: string): Promise<void>
  activeTeacherAssignment(parallelId: string): Promise<string | null>
  lockTeacherAssignment(assignmentId: string, careerId: string): Promise<string | null>
  deleteTeacherAssignment(assignmentId: string): Promise<void>
  lockActiveSubject(subjectId: string, careerId: string): Promise<string | null>
  existingParallelCodes(subjectId: string, upperCodes: string[]): Promise<string[]>
  insertParallel(subjectId: string, code: string, shift: PhpValue): Promise<string>
  parallelCodeTaken(subjectId: string, exceptId: string, upperCode: string): Promise<boolean>
  updateParallel(parallelId: string, code: string, shift: PhpValue): Promise<void>
  parallelHasSentSyllabus(parallelId: string): Promise<boolean>
  restartSentForParallel(parallelId: string, reason?: string): Promise<void>
  refreshParallel(parallelId: string): Promise<void>
  guard<T>(confirmed: boolean, careerId: string, change: () => Promise<T>, subjectIds: string[] | null): Promise<T>
  keepContent<T>(confirmed: boolean, careerId: string, change: () => Promise<T>): Promise<T>
  replace<T>(confirmed: boolean, change: () => Promise<T>, scope: WorkScope): Promise<T>
}

export type CareerWriteDeps = {
  bridge: BridgeDeps
  careerActive(careerId: string): Promise<boolean>
  mallaInCareer(mallaId: string, careerId: string): Promise<boolean>
  /** The malla of a subject of the career, or null when the subject is not in the career. */
  subjectMalla(subjectId: string, careerId: string): Promise<string | null>
  /** An active subject of the career whose malla is not closed. */
  activeSubjectInCareer(subjectId: string, careerId: string): Promise<boolean>
  subjectCodeTaken(mallaId: string, code: string, except: string | null): Promise<boolean>
  eligibleUserExists(userId: string): Promise<boolean>
  parallelInCareer(parallelId: string, careerId: string): Promise<boolean>
  transaction<T>(work: (tx: CareerWriteTx) => Promise<T>): Promise<T>
}

export type CareerContext = { session: AppSession; careerId: string }

const CREATED = "Registro académico creado dentro de su carrera."
const PURGE_STARTED =
  "El sílabo de este paralelo ya tiene trabajo del docente. Cambiar el docente lo elimina con todo su contenido (borrador, revisiones, aprobación, firmas y análisis de IA) y el nuevo docente lo empieza de cero."
const PURGE_SENT =
  "El sílabo de este paralelo ya está en revisión o aprobado. Cambiar el código o la jornada lo elimina con todo su contenido (revisiones, aprobación, firmas y análisis de IA) y el docente lo empieza de nuevo."
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g
const INTEGER_COLUMNS = new Set<SubjectColumn>(["ciclo_asignatura", "orden_asignatura_en_ciclo"])
const DECIMAL_COLUMNS = new Set<SubjectColumn>(["creditos_asignatura", "horas_docencia", "horas_practicas", "horas_autonomas"])

export function phpTrim(value: string): string {
  return value.replace(PHP_TRIM, "")
}

export function invalid(attribute: string, message: string): Rejected {
  return new Rejected(validationError({ [attribute]: [message] }))
}

export function notJson(request: Request): boolean {
  return request.headers.get("content-type") !== null && !isJsonRequest(request)
}

export async function careerSession(
  request: Request,
  bridge: BridgeDeps,
  careerActive: (careerId: string) => Promise<boolean>,
  requestedCareerId: string | null = null,
): Promise<CareerContext | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, bridge)
  if (session instanceof Response) return session
  const careerId = await resolveCareerScope(session, requestedCareerId, activeCareerId(careerActive))
  if (careerId instanceof Response) return careerId
  return { session, careerId }
}

export function decimalString(value: string | number, scale = 2): string {
  const text = typeof value === "number" ? String(value) : value.trim()
  const match = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (match === null) return text
  const [, sign, integral = "", fraction = "", exponent = "0"] = match
  const digits = BigInt(`${integral}${fraction}` || "0")
  const shift = Number(exponent) - fraction.length + scale
  let scaled: bigint
  const ten = BigInt(10)
  if (shift >= 0) scaled = digits * ten ** BigInt(shift)
  else {
    const divisor = ten ** BigInt(-shift)
    scaled = digits / divisor
    if ((digits % divisor) * BigInt(2) >= divisor) scaled += BigInt(1)
  }
  const body = scaled.toString().padStart(scale + 1, "0")
  return `${sign === "-" && scaled !== BigInt(0) ? "-" : ""}${body.slice(0, -scale)}.${body.slice(-scale)}`
}

function totalHours(input: PhpArray): number {
  let total = 0
  for (const key of ["horas_ac", "horas_pae", "horas_aa"]) {
    const value = input[key]
    if (phpIsNumeric(value)) total += Number(typeof value === "string" ? value.trim() : value)
  }
  return total
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

async function validateSubject(input: PhpArray, deps: CareerWriteDeps, mallaId: unknown, except: string | null): Promise<Record<string, string[]> | null> {
  input.horas_totales = totalHours(input)
  const codeAvailable = async (value: unknown) => typeof mallaId !== "string" || !UUID.test(mallaId) || !(await deps.subjectCodeTaken(mallaId, String(value), except))
  return (await validateSchema(subjectSchema(codeAvailable), input)).errors
}

async function validateNewSubject(input: PhpArray, deps: CareerWriteDeps, careerId: string): Promise<Record<string, string[]> | null> {
  const target = (await validateSchema(mallaTargetSchema({ mallaExists: (value) => deps.mallaInCareer(String(value), careerId) }), input)).errors
  const subject = await validateSubject(input, deps, target === null ? input.malla_id : null, null)
  return target === null && subject === null ? null : { ...(target ?? {}), ...(subject ?? {}) }
}

function subjectModality(input: PhpArray): string | null {
  return typeof input.modality === "string" && input.modality !== "" ? input.modality : null
}

function subjectAttributes(input: PhpArray): Partial<Record<SubjectColumn, PhpValue>> {
  const attributes: Partial<Record<SubjectColumn, PhpValue>> = {
    codigo_asignatura: input.code,
    nombre_asignatura: input.nombre,
    ciclo_asignatura: input.cycle ?? null,
    modalidad_asignatura: subjectModality(input),
    creditos_asignatura: input.creditos ?? null,
  }
  const optional: [string, SubjectColumn][] = [
    ["position", "orden_asignatura_en_ciclo"],
    ["organization_unit", "unidad_curricular_asignatura"],
    ["horas_ac", "horas_docencia"],
    ["horas_pae", "horas_practicas"],
    ["horas_aa", "horas_autonomas"],
  ]
  for (const [key, column] of optional) if (key in input) attributes[column] = input[key]
  if ("generates_syllabus" in input) attributes.genera_silabo_asignatura = requestBoolean(input.generates_syllabus)
  return attributes
}

function equivalent(column: SubjectColumn, attribute: PhpValue, original: SubjectValue): boolean {
  if (attribute === original) return true
  if (attribute === null || original === null) return false
  if (INTEGER_COLUMNS.has(column)) return phpIntCast(attribute) === phpIntCast(original)
  if (DECIMAL_COLUMNS.has(column)) return decimalString(attribute as string | number) === decimalString(original as string | number)
  if (column === "genera_silabo_asignatura") return Boolean(attribute) === Boolean(original)
  return phpIsNumeric(attribute) && phpIsNumeric(original) && String(attribute) === String(original)
}

async function teacherRole(tx: CareerWriteTx, userId: string, careerId: string): Promise<string> {
  const coordinator = await tx.hasCoordinatorRole(userId, careerId)
  if (coordinator && roleCombinationConflicts("docente", await tx.effectiveRoles(userId))) throw invalid("user_id", ROLE_COMBINATION_MESSAGE)
  if (coordinator) {
    const grant = await tx.teacherGrant(userId, careerId)
    if (grant === null) await tx.insertTeacherGrant(userId, careerId)
    // Deactivated in Docentes: only «Reactivar» brings the teacher back, never an assignment.
    else if (!grant.active) throw invalid("user_id", "El docente está inactivo en esta carrera. Reactívelo en Docentes antes de asignarle un paralelo.")
  }
  const roleId = await tx.eligibleTeacherRole(userId, careerId)
  if (roleId === null) throw invalid("user_id", "El docente debe verificar su correo antes de recibir una asignación.")
  return roleId
}

function openConvocation(convocation: CareerConvocation | null): string | null {
  return convocation !== null && convocation.state === "abierto" && convocation.processState === "abierto" ? convocation.id : null
}

async function assignTeacher(tx: CareerWriteTx, context: CareerContext, parallelId: string, userId: string, confirmed: boolean, convocationId: string | null): Promise<void> {
  if (!confirmed && (await tx.parallelsWithStartedSyllabus([parallelId])).length > 0) {
    throw new Rejected(validationError({ purge_required: [PURGE_STARTED], purge_count: ["1"] }))
  }
  const subjects = await tx.subjectsOfParallel(parallelId)
  await tx.guard(
    confirmed,
    context.careerId,
    async () => {
      const parallel = await tx.lockParallel(parallelId, context.careerId)
      if (parallel === null) throw new Missing(MODELS.parallel)
      const roleId = await teacherRole(tx, userId, context.careerId)
      if (await tx.parallelHasActiveTeacher(parallel.id)) throw invalid("user_id", "El paralelo ya tiene un docente asignado.")
      await tx.insertTeacherAssignment(roleId, parallel.id)
      await tx.restartForParallel(parallel.id)
      if (convocationId !== null) await tx.generateParallelSyllabus(convocationId, parallel.id)
    },
    subjects,
  )
}

async function prepared(request: Request, deps: CareerWriteDeps, requestedCareerId: string | null): Promise<{ context: CareerContext; input: PhpArray } | Response> {
  const context = await careerSession(request.clone(), deps.bridge, deps.careerActive, requestedCareerId)
  if (context instanceof Response) return context
  return { context, input: await requestInput(request) }
}

export async function createCareerRecord(request: Request, entity: string, deps: CareerWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  if (!["asignatura", "asignacion_docente"].includes(entity) || !routeAllows(request)) return unmatchedRoute(request)
  const ready = await prepared(request, deps, requestedCareerId)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  const careerId = context.careerId
  if (entity === "asignacion_docente") {
    const { errors } = await validateSchema(
      teacherAssignmentSchema({ userExists: (value) => deps.eligibleUserExists(String(value)), parallelExists: (value) => deps.parallelInCareer(String(value), careerId) }),
      input,
    )
    if (errors !== null) return validationError(errors)
    return settle(original, deps, async () => {
      await deps.transaction(async (tx) =>
        assignTeacher(tx, context, input.parallel_id as string, input.user_id as string, requestBoolean(input.confirm_purge), openConvocation(await tx.lockCurrentConvocation(careerId))),
      )
      return apiJson({ message: CREATED })
    })
  }
  const errors = await validateNewSubject(input, deps, careerId)
  if (errors !== null) return validationError(errors)
  return settle(original, deps, async () => {
    await deps.transaction((tx) => insertCareerSubject(tx, context, input))
    return apiJson({ message: CREATED })
  })
}

/** Inserts a subject in the malla `input.malla_id` of the context career (already validated to belong to it). */
export async function insertCareerSubject(tx: CareerWriteTx, context: CareerContext, input: PhpArray): Promise<string> {
  const careerId = context.careerId
  if (await tx.careerLocked(careerId)) throw invalid("process", CONVOCATION_LOCK_REASON)
  const malla = await tx.lockMalla(careerId, String(input.malla_id))
  if (malla === null) throw new Missing(MODELS.career)
  if (phpIntCast(input.cycle) > malla.cycleCount) throw invalid("cycle", "El ciclo excede la configuración de esta malla.")
  const last = await tx.lastPosition(malla.id, input.cycle)
  const position = "position" in input ? phpIntCast(input.position) : last === null ? 0 : last + 1
  const id = await tx.insertSubject(careerId, malla.id, {
    codigo_asignatura: input.code,
    nombre_asignatura: input.nombre,
    ciclo_asignatura: input.cycle ?? null,
    creditos_asignatura: input.creditos ?? null,
    horas_docencia: input.horas_ac ?? null,
    horas_practicas: input.horas_pae ?? null,
    horas_autonomas: input.horas_aa ?? null,
    orden_asignatura_en_ciclo: position,
    unidad_curricular_asignatura: input.organization_unit ?? null,
    modalidad_asignatura: subjectModality(input),
    genera_silabo_asignatura: "generates_syllabus" in input ? requestBoolean(input.generates_syllabus) : true,
  })
  return id
}

export async function updateCareerRecord(request: Request, entity: string, recordId: string, deps: CareerWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  if (entity !== "asignatura" || !routeAllows(request)) return unmatchedRoute(request)
  const ready = await prepared(request, deps, requestedCareerId)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  const careerId = context.careerId
  const mallaId = await deps.subjectMalla(recordId, careerId)
  if (mallaId === null) return forbidden()
  const errors = await validateSubject(input, deps, mallaId, recordId)
  if (errors !== null) return validationError(errors)
  const confirmed = requestBoolean(input.confirm_purge)
  const attributes = subjectAttributes(input)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      if (await tx.careerLocked(careerId)) throw invalid("process", CONVOCATION_LOCK_REASON)
      const toggles = "generates_syllabus" in input && (await tx.subjectGeneratesSyllabus(recordId)) !== requestBoolean(input.generates_syllabus)
      const change = async () => {
        const subject = await tx.lockSubject(recordId, careerId)
        if (subject === null) throw new Missing(MODELS.subject)
        if (input.cycle !== undefined && input.cycle !== null) {
          const malla = await tx.lockMalla(subject.careerId, subject.mallaId)
          if (phpIntCast(input.cycle) > (malla?.cycleCount ?? 0)) throw invalid("cycle", "El ciclo excede la configuración de esta malla.")
        }
        const dirty = SUBJECT_COLUMNS.filter((column) => column in attributes && !equivalent(column, attributes[column] as PhpValue, subject.columns[column]))
        if (dirty.length === 0) return
        await tx.updateSubject(subject.id, Object.fromEntries(dirty.map((column) => [column, attributes[column] as PhpValue])))
      }
      if (toggles) await tx.guard(confirmed, careerId, () => tx.replace(confirmed, change, { careerIds: careerId, subjectId: recordId }), null)
      else await tx.keepContent(confirmed, careerId, change)
    })
    return apiJson({ message: "Registro académico actualizado." })
  })
}

export async function createParallels(request: Request, deps: CareerWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  const ready = await prepared(request, deps, requestedCareerId)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  const careerId = context.careerId
  if (isPhpArray(input.codes)) {
    const codes = Object.values(input.codes)
      .filter((code): code is string => typeof code === "string")
      .map(phpTrim)
      .filter((code) => code !== "")
    input.codes = Object.fromEntries(codes.map((code, index) => [String(index), code]))
  }
  const { errors } = await validateSchema(
    parallelsSchema({ subjectExists: (value) => deps.activeSubjectInCareer(String(value), careerId), userExists: (value) => deps.eligibleUserExists(String(value)) }),
    input,
  )
  if (errors !== null) return validationError(errors)
  const confirmed = requestBoolean(input.confirm_purge)
  const codes = Object.values(input.codes as PhpArray).map((code) => phpTrim(code as string))
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const convocationId = openConvocation(await tx.lockCurrentConvocation(careerId))
      const subjectId = await tx.lockActiveSubject(input.subject_id as string, careerId)
      if (subjectId === null) throw new Missing(MODELS.subject)
      const existing = await tx.existingParallelCodes(
        subjectId,
        codes.map((code) => code.toUpperCase()),
      )
      if (existing.length > 0) throw invalid("codes", `Ya existe el paralelo ${existing.join(", ")} para esta materia.`)
      for (const code of codes) {
        const parallelId = await tx.insertParallel(subjectId, code, input.shift)
        await assignTeacher(tx, context, parallelId, input.user_id as string, confirmed, convocationId)
      }
    })
    return apiJson({ message: `${codes.length} paralelos creados dentro de su carrera.` })
  })
}

export async function updateParallel(request: Request, parallelId: string, deps: CareerWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  if (!routeAllows(request)) return unmatchedRoute(request)
  const ready = await prepared(request, deps, requestedCareerId)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  if (typeof input.code === "string") input.code = phpTrim(input.code)
  const { errors } = await validateSchema(parallelSchema, input)
  if (errors !== null) return validationError(errors)
  const confirmed = requestBoolean(input.confirm_purge)
  const code = phpTrim(input.code as string)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const parallel = await tx.lockParallel(parallelId, context.careerId)
      if (parallel === null) throw new Missing(MODELS.parallel)
      await tx.guard(
        confirmed,
        context.careerId,
        async () => {
          if (await tx.parallelCodeTaken(parallel.subjectId, parallel.id, code.toUpperCase())) throw invalid("code", `Ya existe el paralelo ${code} en esta materia.`)
          if (parallel.code === code && parallel.shift === input.shift) return
          const sent = await tx.parallelHasSentSyllabus(parallel.id)
          if (sent && !confirmed) throw new Rejected(validationError({ purge_required: [PURGE_SENT], purge_count: ["1"] }))
          await tx.updateParallel(parallel.id, code, input.shift)
          if (sent) await tx.restartSentForParallel(parallel.id, requestedCareerId === null ? undefined : "Administración cambió el código o la jornada del paralelo")
          await tx.refreshParallel(parallel.id)
        },
        [parallel.subjectId],
      )
    })
    return apiJson({ message: "Paralelo actualizado." })
  })
}

export async function replaceParallelTeacher(request: Request, parallelId: string, deps: CareerWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  if (!routeAllows(request)) return unmatchedRoute(request)
  const ready = await prepared(request, deps, requestedCareerId)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  const { errors } = await validateSchema(parallelTeacherSchema, input)
  if (errors !== null) return validationError(errors)
  const confirmed = requestBoolean(input.confirm_purge)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const convocationId = openConvocation(await tx.lockCurrentConvocation(context.careerId))
      const parallel = await tx.lockParallel(parallelId, context.careerId)
      if (parallel === null) throw new Missing(MODELS.parallel)
      const current = await tx.activeTeacherAssignment(parallel.id)
      if (current !== null) {
        const assignment = await tx.lockTeacherAssignment(current, context.careerId)
        if (assignment === null) throw new Missing(MODELS.teacherAssignment, current)
        await tx.deleteTeacherAssignment(assignment)
      }
      await assignTeacher(tx, context, parallel.id, input.user_id as string, confirmed, convocationId)
    })
    return apiJson({ message: CREATED })
  })
}
