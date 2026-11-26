import { aborted } from "../http/responses"
import { fromController } from "../auth/controllerResponse"
import { requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { phpIsNumeric } from "@silabos/shared/schemas/php"
import { CURRICULAR_UNITS, SHIFTS, STUDY_MODALITIES, studyModalityLabel } from "@silabos/shared/schemas/academic"
import { apiJson } from "../http/responses"
import { unmatchedRoute, routeAllows } from "../http/router"
import { resolveCareerScope } from "./careerScope"

export const FORBIDDEN = "No tiene permiso para hacer esto."
export const CONVOCATION_LOCK_REASON = "Periodo académico activo"
const UUID = /^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/

export { CURRICULAR_UNITS, SHIFTS, STUDY_MODALITIES, studyModalityLabel }

const FIXED_FIELDS = [
  { key: "acd", label: "ACD", type: "entero", system_key: "horas_ac", position: 1, totalizable: true },
  { key: "ape", label: "APE", type: "entero", system_key: "horas_pae", position: 2, totalizable: true },
  { key: "aa", label: "AA", type: "entero", system_key: "horas_aa", position: 3, totalizable: true },
  { key: "cred", label: "CRED", type: "numero", system_key: "creditos", position: 4, totalizable: true },
  { key: "total", label: "TOTAL", type: "entero", system_key: "horas_totales", position: 5, totalizable: true },
] as const

const SYSTEM_LABELS: Record<string, string> = {
  horas_ac: "Horas AC / ACD",
  horas_pae: "Horas PAE / APE",
  horas_aa: "Horas AA",
  creditos: "Créditos",
  horas_totales: "Horas totales",
}

/** `cycleCount` is the cycle count of the career's vigente malla (0 when it has none). */
export type CareerRecord = { id: string; name: string; modality: string | null; cycleCount: number }

export type MallaRecord = { id: string; careerId: string; code: string; cycleCount: number; state: string; subjectCount: number }

export interface MallaReadRepository {
  mallas(careerId: string): Promise<MallaRecord[]>
  malla(careerId: string, mallaId: string): Promise<MallaRecord | null>
}

export type CareerLock = { period: string | null; institutionalPause: boolean; deliveryOn: string }

export type SubjectRecord = {
  id: string
  code: string
  name: string
  cycle: number | null
  position: number
  organizationUnit: string | null
  modality: string | null
  credits: string | null
  totalHours: number | null
  hoursAc: string | null
  hoursPae: string | null
  hoursAa: string | null
  active: boolean
  generatesSyllabus: boolean
}

export type RequirementRecord = { id: string; subjectId: string; requirementId: string }

export type TeacherAssignmentRecord = {
  id: string
  userId: string
  userName: string
  userEmail: string
  parallelId: string
  parallelCode: string
  subjectName: string
  active: boolean
}

export type CareerTeacherRecord = { id: string; name: string; email: string; verified: boolean; hasActiveInvitation: boolean; active: boolean }

export type PersonRecord = { id: string; name: string; email: string }

export interface AcademicStructureRepository {
  activeCareer(careerId: string): Promise<CareerRecord | null>
  careerLock(careerId: string): Promise<CareerLock | null>
  curriculumSubjects(mallaId: string): Promise<SubjectRecord[]>
  requirements(subjectIds: string[]): Promise<RequirementRecord[]>
  teacherAssignments(careerId: string): Promise<TeacherAssignmentRecord[]>
  careerTeachers(careerId: string): Promise<CareerTeacherRecord[]>
  pendingTeachers(careerId: string): Promise<PersonRecord[]>
  unassignedParallels(careerId: string): Promise<{ id: string; label: string }[]>
  teacherUsers(careerId: string): Promise<PersonRecord[]>
}

export type AcademicStructureDeps = { bridge: BridgeDeps; academic: AcademicStructureRepository }

export type CurriculumReadDeps = AcademicStructureDeps & { mallas: MallaReadRepository }

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export function forbidden(): Response {
  return apiJson({ message: FORBIDDEN }, 403)
}

export function modalityOptions(): { value: string; label: string }[] {
  return STUDY_MODALITIES.map((value) => ({ value, label: studyModalityLabel(value) as string }))
}

export function shiftOptions(): { value: string; label: string }[] {
  return SHIFTS.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))
}

export function baseOptions(): Record<string, unknown> {
  return {
    faculties: [],
    careers: [],
    periods: [],
    modalityOptions: modalityOptions(),
    shiftOptions: shiftOptions(),
    currentCurricula: [],
    activeSubjects: [],
    scheduledSubjects: [],
    parallels: [],
    teacherUsers: [],
  }
}

export function lockPayload(lock: CareerLock | null): Record<string, unknown> | null {
  return lock === null
    ? null
    : { scope: "convocation", period: lock.period, institutional_pause: lock.institutionalPause, delivery_on: lock.deliveryOn }
}

function systemValue(subject: SubjectRecord, key: string): string | number | null {
  if (key === "horas_ac") return subject.hoursAc
  if (key === "horas_pae") return subject.hoursPae
  if (key === "horas_aa") return subject.hoursAa
  if (key === "creditos") return subject.credits
  return subject.totalHours
}

function phpSum(subjects: SubjectRecord[], key: string): unknown {
  let total = 0
  for (const subject of subjects) {
    const value = systemValue(subject, key)
    if (!phpIsNumeric(value ?? undefined)) continue
    if (typeof value === "string") {
      total += Number(value.trim())
    } else if (value !== null) {
      total += value
    }
  }
  return total
}

function subjectPayload(subject: SubjectRecord): Record<string, unknown> {
  return {
    id: subject.id,
    code: subject.code,
    name: subject.name,
    cycle: subject.cycle,
    position: subject.position,
    organization_unit: subject.organizationUnit,
    organization_unit_label: subject.organizationUnit === null ? null : (CURRICULAR_UNITS[subject.organizationUnit] ?? null),
    modality: subject.modality,
    modality_label: studyModalityLabel(subject.modality),
    credits: subject.credits,
    total_hours: subject.totalHours,
    active: subject.active,
    generates_syllabus: subject.generatesSyllabus,
    system_values: {
      horas_ac: subject.hoursAc,
      horas_pae: subject.hoursPae,
      horas_aa: subject.hoursAa,
      creditos: subject.credits,
      horas_totales: subject.totalHours,
    },
    display_fields: FIXED_FIELDS.map((field) => ({ id: field.system_key, label: field.label, value: systemValue(subject, field.system_key) })),
  }
}

export async function authorizedCareer(request: Request, deps: AcademicStructureDeps, requestedCareerId: string | null = null): Promise<CareerRecord | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  return resolveCareerScope(session, requestedCareerId, (careerId) => deps.academic.activeCareer(careerId), forbidden)
}

export async function curriculumBuilder(
  request: Request,
  curriculumId: string,
  deps: CurriculumReadDeps,
  requestedCareerId: string | null = null,
): Promise<Response> {
  if (!routeAllows(request)) return unmatchedRoute(request)
  const career = await authorizedCareer(request, deps, requestedCareerId)
  if (career instanceof Response) return career
  const malla = isUuid(curriculumId) ? await deps.mallas.malla(career.id, curriculumId) : null
  if (malla === null) return fromController(aborted(404))

  const lock = await deps.academic.careerLock(career.id)
  const subjects = await deps.academic.curriculumSubjects(malla.id)
  const requirements = await deps.academic.requirements(subjects.map((subject) => subject.id))

  return apiJson({
    career: {
      id: career.id,
      name: career.name,
      modality: career.modality === null ? null : { value: career.modality, label: studyModalityLabel(career.modality) as string },
    },
    malla: { id: malla.id, code: malla.code, state: malla.state },
    curriculum: {
      id: malla.id,
      cycle_count: malla.cycleCount,
      editable: lock === null,
      lock_reason: lock === null ? null : CONVOCATION_LOCK_REASON,
      lock: lockPayload(lock),
    },
    fixedFields: FIXED_FIELDS.map((field) => ({
      id: field.system_key,
      key: field.key,
      label: field.label,
      type: field.type,
      system_key: field.system_key,
      system_label: SYSTEM_LABELS[field.system_key],
      position: field.position,
      visible_on_card: true,
      totalizable: field.totalizable,
    })),
    fixedFieldTotals: FIXED_FIELDS.map((field) => ({ id: field.system_key, label: field.label, value: phpSum(subjects, field.system_key) })),
    subjects: subjects.map(subjectPayload),
    requirements: requirements.map((requirement) => ({
      id: requirement.id,
      subject_id: requirement.subjectId,
      requirement_id: requirement.requirementId,
    })),
    modalityOptions: modalityOptions(),
    organizationUnitOptions: Object.entries(CURRICULAR_UNITS).map(([value, label]) => ({ value, label })),
    options: baseOptions(),
  })
}

function phpCompare(left: string, right: string): number {
  if (phpIsNumeric(left) && phpIsNumeric(right)) return Math.sign(Number(left.trim()) - Number(right.trim()))
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
}

export async function teacherAssignments(request: Request, deps: AcademicStructureDeps, requestedCareerId: string | null = null): Promise<Response> {
  const career = await authorizedCareer(request, deps, requestedCareerId)
  if (career instanceof Response) return career

  const lock = await deps.academic.careerLock(career.id)
  const assignments = await deps.academic.teacherAssignments(career.id)
  const teachers = uniqueById(await deps.academic.careerTeachers(career.id))
    .map((teacher, index) => ({ teacher, index }))
    .sort((left, right) => phpCompare(left.teacher.name, right.teacher.name) || left.index - right.index)
    .map(({ teacher }) => teacher)
  const pending = uniqueById(await deps.academic.pendingTeachers(career.id))
  const parallels = await deps.academic.unassignedParallels(career.id)
  const teacherUsers = await deps.academic.teacherUsers(career.id)

  return apiJson({
    career: { id: career.id, name: career.name, lock_reason: lock === null ? null : CONVOCATION_LOCK_REASON, lock: lockPayload(lock) },
    teacherAssignments: assignments.map((assignment) => ({
      id: assignment.id,
      user_id: assignment.userId,
      parallel_id: assignment.parallelId,
      user_name: assignment.userName,
      user_email: assignment.userEmail,
      parallel_code: assignment.parallelCode,
      subject_name: assignment.subjectName,
      active: assignment.active,
      editable: true,
    })),
    careerTeachers: teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      pending_activation: !teacher.verified,
      invitation_expired: !teacher.verified && !teacher.hasActiveInvitation,
      active: teacher.active,
    })),
    pendingTeachers: pending.map((teacher) => ({ id: teacher.id, name: teacher.name, email: teacher.email })),
    options: { ...baseOptions(), parallels, teacherUsers },
    canCreateTeacher: true,
  })
}
