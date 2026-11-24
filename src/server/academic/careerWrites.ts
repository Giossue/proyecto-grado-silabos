import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { ROLE_COMBINATION_MESSAGE, roleCombinationConflicts } from "../identity/accountRules"
import { isJsonRequest, isPhpArray, laravelInput, type PhpArray, type PhpValue } from "../laravel/input"
import { forbidden, laravelJson, validationError } from "../laravel/responses"
import { phpIsNumeric, validateInput, type Rule } from "../laravel/validation"
import { laravelBoolean, type WorkScope } from "../syllabus/inProgressWork"
import { Missing, Rejected, settle } from "../syllabus/reviewDecisions"
import { createCareerWriteDeps } from "./careerWriteStore"
import { phpIntCast } from "./governanceWrites"
import { CONVOCATION_LOCK_REASON, CURRICULAR_UNITS, SHIFTS, STUDY_MODALITIES } from "./structure"
import { laravelRouter, routeAllows } from "../laravel/router"

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
export type SubjectRow = { id: string; careerId: string; totalHours: number | null; columns: Record<SubjectColumn, SubjectValue> }
export type ParallelRow = { id: string; subjectId: string; code: string; shift: string }

export interface CareerWriteTx {
  careerLocked(careerId: string): Promise<boolean>
  lockCareer(careerId: string): Promise<{ id: string; cycleCount: number } | null>
  lastPosition(careerId: string, cycle: PhpValue): Promise<number | null>
  insertSubject(careerId: string, columns: Record<SubjectColumn, PhpValue>): Promise<string>
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
  activateGrant(grantId: string): Promise<void>
  eligibleTeacherRole(userId: string, careerId: string): Promise<string | null>
  parallelHasActiveTeacher(parallelId: string): Promise<boolean>
  insertTeacherAssignment(roleId: string, parallelId: string): Promise<string>
  restartForParallel(parallelId: string): Promise<void>
  activeTeacherAssignment(parallelId: string): Promise<string | null>
  lockTeacherAssignment(assignmentId: string, careerId: string): Promise<string | null>
  deleteTeacherAssignment(assignmentId: string): Promise<void>
  lockActiveSubject(subjectId: string, careerId: string): Promise<string | null>
  existingParallelCodes(subjectId: string, upperCodes: string[]): Promise<string[]>
  insertParallel(subjectId: string, code: string, shift: PhpValue): Promise<string>
  parallelCodeTaken(subjectId: string, exceptId: string, upperCode: string): Promise<boolean>
  updateParallel(parallelId: string, code: string, shift: PhpValue): Promise<void>
  parallelHasSentSyllabus(parallelId: string): Promise<boolean>
  restartSentForParallel(parallelId: string): Promise<void>
  refreshParallel(parallelId: string): Promise<void>
  guard<T>(confirmed: boolean, careerId: string, change: () => Promise<T>, subjectIds: string[] | null): Promise<T>
  keepContent<T>(confirmed: boolean, careerId: string, change: () => Promise<T>): Promise<T>
  replace<T>(confirmed: boolean, change: () => Promise<T>, scope: WorkScope): Promise<T>
}

export type CareerWriteDeps = {
  bridge: BridgeDeps
  careerActive(careerId: string): Promise<boolean>
  subjectInCareer(subjectId: string, careerId: string): Promise<boolean>
  activeSubjectInCareer(subjectId: string, careerId: string): Promise<boolean>
  subjectCodeTaken(careerId: string, code: string, except: string | null): Promise<boolean>
  eligibleUserExists(userId: string): Promise<boolean>
  parallelInCareer(parallelId: string, careerId: string): Promise<boolean>
  transaction<T>(work: (tx: CareerWriteTx) => Promise<T>): Promise<T>
}

export type CareerContext = { session: LaravelSession; careerId: string }

export function defaultCareerWriteDeps(): CareerWriteDeps {
  return { bridge: defaultBridgeDeps(), ...createCareerWriteDeps() }
}

const CREATED = "Registro académico creado dentro de su carrera."
const PURGE_STARTED =
  "El sílabo de este paralelo ya tiene trabajo del docente. Cambiar el docente lo elimina con todo su contenido (borrador, revisiones, aprobación, firmas y análisis de IA) y el nuevo docente lo empieza de cero."
const PURGE_SENT =
  "El sílabo de este paralelo ya está en revisión o aprobado. Cambiar el código o la jornada lo elimina con todo su contenido (revisiones, aprobación, firmas y análisis de IA) y el docente lo empieza de nuevo."
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g
const SUBJECT_LABELS = { code: "código", nombre: "nombre", cycle: "ciclo", position: "posición", organization_unit: "unidad de organización curricular", modality: "modalidad" }
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

export async function careerSession(request: Request, bridge: BridgeDeps, careerActive: (careerId: string) => Promise<boolean>): Promise<CareerContext | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, bridge)
  if (session instanceof Response) return session
  const role = session.activeRole
  if (!session.user.active || role?.role !== "coordinador" || role.careerId === null || !(await careerActive(role.careerId))) return forbidden()
  return { session, careerId: role.careerId }
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

function subjectRules(unique: (value: PhpValue) => Promise<boolean>): Record<string, Rule[]> {
  const hours: Rule[] = ["required", "numeric", { min: 0 }, { max: 9999.99 }]
  return {
    code: ["required", "string", { max: 80 }, { unique }],
    nombre: ["required", "string", { max: 180 }],
    cycle: ["required", "integer", { min: 1 }, { max: 30 }],
    position: ["nullable", "integer", { min: 0 }, { max: 999 }],
    organization_unit: ["required", "string", { in: Object.keys(CURRICULAR_UNITS) }],
    modality: ["nullable", "string", { in: STUDY_MODALITIES }],
    creditos: hours,
    horas_totales: ["required", "integer", { min: 0 }, { max: 32767 }],
    horas_ac: hours,
    horas_pae: hours,
    horas_aa: hours,
    generates_syllabus: ["sometimes", "boolean"],
  }
}

async function validateSubject(input: PhpArray, deps: CareerWriteDeps, careerId: string, except: string | null): Promise<Record<string, string[]>> {
  input.horas_totales = totalHours(input)
  return validateInput(
    input,
    subjectRules(async (value) => !(await deps.subjectCodeTaken(careerId, String(value), except))),
    SUBJECT_LABELS,
    { messages: { "code.unique": "Ya existe una materia con ese código." } },
  )
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
  if ("generates_syllabus" in input) attributes.genera_silabo_asignatura = laravelBoolean(input.generates_syllabus)
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
    else if (!grant.active) await tx.activateGrant(grant.id)
  }
  const roleId = await tx.eligibleTeacherRole(userId, careerId)
  if (roleId === null) throw invalid("user_id", "El docente debe verificar su correo antes de recibir una asignación.")
  return roleId
}

async function assignTeacher(tx: CareerWriteTx, context: CareerContext, parallelId: string, userId: string, confirmed: boolean): Promise<void> {
  if (!confirmed && (await tx.parallelsWithStartedSyllabus([parallelId])).length > 0) {
    throw new Rejected(validationError({ purge_required: [PURGE_STARTED], purge_count: ["1"] }))
  }
  const subjects = await tx.subjectsOfParallel(parallelId)
  await tx.guard(
    confirmed,
    context.careerId,
    async () => {
      const parallel = await tx.lockParallel(parallelId, context.careerId)
      if (parallel === null) throw new Missing()
      const roleId = await teacherRole(tx, userId, context.careerId)
      if (await tx.parallelHasActiveTeacher(parallel.id)) throw invalid("user_id", "El paralelo ya tiene un docente asignado.")
      await tx.insertTeacherAssignment(roleId, parallel.id)
      await tx.restartForParallel(parallel.id)
    },
    subjects,
  )
}

async function prepared(request: Request, deps: CareerWriteDeps): Promise<{ context: CareerContext; input: PhpArray } | Response> {
  const context = await careerSession(request.clone(), deps.bridge, deps.careerActive)
  if (context instanceof Response) return context
  return { context, input: await laravelInput(request) }
}

export async function createCareerRecord(request: Request, entity: string, deps: CareerWriteDeps = defaultCareerWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (!["asignatura", "asignacion_docente"].includes(entity) || !routeAllows(request)) return laravelRouter(request)
  if (notJson(request)) return deps.bridge.forward(original)
  const ready = await prepared(request, deps)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  const careerId = context.careerId
  if (entity === "asignacion_docente") {
    const errors = await validateInput(
      input,
      {
        user_id: ["required", "uuid", { exists: (value) => deps.eligibleUserExists(String(value)) }],
        parallel_id: ["required", "uuid", { exists: (value) => deps.parallelInCareer(String(value), careerId) }],
      },
      { user_id: "usuario", parallel_id: "paralelo" },
    )
    if (Object.keys(errors).length > 0) return validationError(errors)
    return settle(original, deps, async () => {
      await deps.transaction((tx) => assignTeacher(tx, context, input.parallel_id as string, input.user_id as string, laravelBoolean(input.confirm_purge)))
      return laravelJson({ message: CREATED })
    })
  }
  const errors = await validateSubject(input, deps, careerId, null)
  if (Object.keys(errors).length > 0) return validationError(errors)
  return settle(original, deps, async () => {
    await deps.transaction((tx) => insertCareerSubject(tx, context, input))
    return laravelJson({ message: CREATED })
  })
}

export async function insertCareerSubject(tx: CareerWriteTx, context: CareerContext, input: PhpArray): Promise<string> {
  const careerId = context.careerId
  if (await tx.careerLocked(careerId)) throw invalid("process", CONVOCATION_LOCK_REASON)
  const career = await tx.lockCareer(careerId)
  if (career === null) throw new Missing()
  if (phpIntCast(input.cycle) > career.cycleCount) throw invalid("cycle", "El ciclo excede la configuración de esta malla.")
  const last = await tx.lastPosition(career.id, input.cycle)
  const position = "position" in input ? phpIntCast(input.position) : last === null ? 0 : last + 1
  const id = await tx.insertSubject(career.id, {
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
    genera_silabo_asignatura: "generates_syllabus" in input ? laravelBoolean(input.generates_syllabus) : true,
  })
  return id
}

export async function updateCareerRecord(request: Request, entity: string, recordId: string, deps: CareerWriteDeps = defaultCareerWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (entity !== "asignatura" || !routeAllows(request)) return laravelRouter(request)
  if (notJson(request)) return deps.bridge.forward(original)
  const ready = await prepared(request, deps)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  const careerId = context.careerId
  if (!(await deps.subjectInCareer(recordId, careerId))) return forbidden()
  const errors = await validateSubject(input, deps, careerId, recordId)
  if (Object.keys(errors).length > 0) return validationError(errors)
  if ("position" in input && input.position === null) return deps.bridge.forward(original)
  const confirmed = laravelBoolean(input.confirm_purge)
  const attributes = subjectAttributes(input)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      if (await tx.careerLocked(careerId)) throw invalid("process", CONVOCATION_LOCK_REASON)
      const toggles = "generates_syllabus" in input && (await tx.subjectGeneratesSyllabus(recordId)) !== laravelBoolean(input.generates_syllabus)
      const change = async () => {
        const subject = await tx.lockSubject(recordId, careerId)
        if (subject === null) throw new Missing()
        if (input.cycle !== undefined && input.cycle !== null) {
          const career = await tx.lockCareer(subject.careerId)
          if (phpIntCast(input.cycle) > (career?.cycleCount ?? 0)) throw invalid("cycle", "El ciclo excede la configuración de esta malla.")
        }
        const dirty = SUBJECT_COLUMNS.filter((column) => column in attributes && !equivalent(column, attributes[column] as PhpValue, subject.columns[column]))
        if (dirty.length === 0) return
        await tx.updateSubject(subject.id, Object.fromEntries(dirty.map((column) => [column, attributes[column] as PhpValue])))
      }
      if (toggles) await tx.guard(confirmed, careerId, () => tx.replace(confirmed, change, { careerIds: careerId, subjectId: recordId }), null)
      else await tx.keepContent(confirmed, careerId, change)
    })
    return laravelJson({ message: "Registro académico actualizado." })
  })
}

export async function createParallels(request: Request, deps: CareerWriteDeps = defaultCareerWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (notJson(request)) return deps.bridge.forward(original)
  const ready = await prepared(request, deps)
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
  const errors = await validateInput(
    input,
    {
      subject_id: ["required", "uuid", { exists: (value) => deps.activeSubjectInCareer(String(value), careerId) }],
      codes: ["required", "array", { min: 1 }, { max: 50 }],
      "codes.*": ["required", "string", { max: 30 }, "distinct"],
      shift: ["required", "string", { in: SHIFTS }],
      user_id: ["required", "uuid", { exists: (value) => deps.eligibleUserExists(String(value)) }],
    },
    { subject_id: "materia", codes: "códigos de paralelo", "codes.*": "código de paralelo", shift: "jornada", user_id: "usuario" },
    { messages: { "user_id.required": "Seleccione el docente del paralelo.", "user_id.exists": "Elija un docente activo con el correo verificado." } },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const confirmed = laravelBoolean(input.confirm_purge)
  const codes = Object.values(input.codes as PhpArray).map((code) => phpTrim(code as string))
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const subjectId = await tx.lockActiveSubject(input.subject_id as string, careerId)
      if (subjectId === null) throw new Missing()
      const existing = await tx.existingParallelCodes(
        subjectId,
        codes.map((code) => code.toUpperCase()),
      )
      if (existing.length > 0) throw invalid("codes", `Ya existe el paralelo ${existing.join(", ")} para esta materia.`)
      for (const code of codes) {
        const parallelId = await tx.insertParallel(subjectId, code, input.shift)
        await assignTeacher(tx, context, parallelId, input.user_id as string, confirmed)
      }
    })
    return laravelJson({ message: `${codes.length} paralelos creados dentro de su carrera.` })
  })
}

export async function updateParallel(request: Request, parallelId: string, deps: CareerWriteDeps = defaultCareerWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (!routeAllows(request)) return laravelRouter(request)
  if (notJson(request)) return deps.bridge.forward(original)
  const ready = await prepared(request, deps)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  if (typeof input.code === "string") input.code = phpTrim(input.code)
  const errors = await validateInput(
    input,
    { code: ["required", "string", { max: 30 }], shift: ["required", "string", { in: SHIFTS }], confirm_purge: ["nullable", "boolean"] },
    { code: "código de paralelo", shift: "jornada", confirm_purge: "confirmación de borrado" },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const confirmed = laravelBoolean(input.confirm_purge)
  const code = phpTrim(input.code as string)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const parallel = await tx.lockParallel(parallelId, context.careerId)
      if (parallel === null) throw new Missing()
      await tx.guard(
        confirmed,
        context.careerId,
        async () => {
          if (await tx.parallelCodeTaken(parallel.subjectId, parallel.id, code.toUpperCase())) throw invalid("code", `Ya existe el paralelo ${code} en esta materia.`)
          if (parallel.code === code && parallel.shift === input.shift) return
          const sent = await tx.parallelHasSentSyllabus(parallel.id)
          if (sent && !confirmed) throw new Rejected(validationError({ purge_required: [PURGE_SENT], purge_count: ["1"] }))
          await tx.updateParallel(parallel.id, code, input.shift)
          if (sent) await tx.restartSentForParallel(parallel.id)
          await tx.refreshParallel(parallel.id)
        },
        [parallel.subjectId],
      )
    })
    return laravelJson({ message: "Paralelo actualizado." })
  })
}

export async function replaceParallelTeacher(request: Request, parallelId: string, deps: CareerWriteDeps = defaultCareerWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (!routeAllows(request)) return laravelRouter(request)
  if (notJson(request)) return deps.bridge.forward(original)
  const ready = await prepared(request, deps)
  if (ready instanceof Response) return ready
  const { context, input } = ready
  const errors = await validateInput(
    input,
    { user_id: ["required", "uuid"], confirm_purge: ["nullable", "boolean"] },
    { user_id: "docente", confirm_purge: "confirmación de borrado" },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const confirmed = laravelBoolean(input.confirm_purge)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const parallel = await tx.lockParallel(parallelId, context.careerId)
      if (parallel === null) throw new Missing()
      const current = await tx.activeTeacherAssignment(parallel.id)
      if (current !== null) {
        const assignment = await tx.lockTeacherAssignment(current, context.careerId)
        if (assignment === null) throw new Missing()
        await tx.deleteTeacherAssignment(assignment)
      }
      await assignTeacher(tx, context, parallel.id, input.user_id as string, confirmed)
    })
    return laravelJson({ message: CREATED })
  })
}
