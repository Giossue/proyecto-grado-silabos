import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { phpIsNumeric } from "../laravel/validation"
import { phpFloat } from "../laravel/phpJson"
import { laravelJson } from "../laravel/responses"
import { createAcademicStructureRepository } from "./structureQueries"

export const FORBIDDEN = "No tiene permiso para hacer esto."
export const CONVOCATION_LOCK_REASON = "Convocatoria activa"
const UUID = /^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/

export const STUDY_MODALITIES = ["Presencial", "Semipresencial", "En línea", "A distancia", "Híbrida"]
export const CURRICULAR_UNITS: Record<string, string> = {
  basica: "Unidad básica",
  profesional: "Unidad profesional",
  integracion_curricular: "Unidad de integración curricular",
}
export const SHIFTS = ["matutina", "vespertina", "nocturna"]

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

export type CareerRecord = { id: string; name: string; modality: string | null; cycleCount: number }

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

export type RequirementRecord = { id: string; subjectId: string; requirementId: string; type: string }

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

export type CareerTeacherRecord = { id: string; name: string; email: string; verified: boolean; hasActiveInvitation: boolean }

export type PersonRecord = { id: string; name: string; email: string }

export interface AcademicStructureRepository {
  activeCareer(careerId: string): Promise<CareerRecord | null>
  careerLock(careerId: string): Promise<CareerLock | null>
  curriculumSubjects(careerId: string): Promise<SubjectRecord[]>
  requirements(subjectIds: string[]): Promise<RequirementRecord[]>
  teacherAssignments(careerId: string): Promise<TeacherAssignmentRecord[]>
  careerTeachers(careerId: string): Promise<CareerTeacherRecord[]>
  pendingTeachers(careerId: string): Promise<PersonRecord[]>
  unassignedParallels(careerId: string): Promise<{ id: string; label: string }[]>
  teacherUsers(careerId: string): Promise<PersonRecord[]>
}

export type AcademicStructureDeps = { bridge: BridgeDeps; academic: AcademicStructureRepository }

export function defaultAcademicStructureDeps(): AcademicStructureDeps {
  return { bridge: defaultBridgeDeps(), academic: createAcademicStructureRepository() }
}

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export function forbidden(): Response {
  return laravelJson({ message: FORBIDDEN }, 403)
}

export async function careerContext(session: LaravelSession, activeCareer: (careerId: string) => Promise<CareerRecord | null>): Promise<CareerRecord | null> {
  const role = session.activeRole
  if (!session.user.active || role?.role !== "coordinador" || role.careerId === null) return null
  return activeCareer(role.careerId)
}

export function modalityOptions(): { value: string; label: string }[] {
  return STUDY_MODALITIES.map((value) => ({ value, label: value }))
}

export function shiftOptions(): { value: string; label: string }[] {
  return SHIFTS.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))
}

export function baseOptions(): Record<string, unknown> {
  return {
    faculties: [],
    careers: [],
    periods: [],
    campusOptions: [],
    modalityOptions: modalityOptions(),
    shiftOptions: shiftOptions(),
    currentCurricula: [],
    activeSubjects: [],
    scheduledSubjects: [],
    parallels: [],
    teacherUsers: [],
  }
}

function lockPayload(lock: CareerLock | null): Record<string, unknown> | null {
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
  let isFloat = false
  for (const subject of subjects) {
    const value = systemValue(subject, key)
    if (!phpIsNumeric(value ?? undefined)) continue
    if (typeof value === "string") {
      const parsed = Number(value.trim())
      isFloat = isFloat || !/^\s*[+-]?\d+\s*$/.test(value)
      total += parsed
    } else if (value !== null) {
      total += value
    }
  }
  return isFloat ? phpFloat(total) : total
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
    modality_label: subject.modality,
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

async function authorizedCareer(request: Request, deps: AcademicStructureDeps): Promise<CareerRecord | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const career = await careerContext(session, (careerId) => deps.academic.activeCareer(careerId))
  return career ?? forbidden()
}

export async function curriculumBuilder(
  request: Request,
  curriculumId: string,
  deps: AcademicStructureDeps = defaultAcademicStructureDeps(),
): Promise<Response> {
  if (!isUuid(curriculumId)) return deps.bridge.forward(request)
  const career = await authorizedCareer(request, deps)
  if (career instanceof Response) return career
  if (curriculumId !== career.id) return deps.bridge.forward(request)

  const lock = await deps.academic.careerLock(career.id)
  const subjects = await deps.academic.curriculumSubjects(career.id)
  const requirements = await deps.academic.requirements(subjects.map((subject) => subject.id))

  return laravelJson({
    career: {
      id: career.id,
      name: career.name,
      modality: career.modality === null ? null : { value: career.modality, label: career.modality },
    },
    curriculum: {
      id: career.id,
      cycle_count: career.cycleCount,
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
      type: requirement.type,
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

export async function teacherAssignments(request: Request, deps: AcademicStructureDeps = defaultAcademicStructureDeps()): Promise<Response> {
  const career = await authorizedCareer(request, deps)
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

  return laravelJson({
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
    })),
    pendingTeachers: pending.map((teacher) => ({ id: teacher.id, name: teacher.name, email: teacher.email })),
    options: { ...baseOptions(), parallels, teacherUsers },
    canCreateTeacher: true,
  })
}
