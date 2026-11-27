import type { AppSession } from "../auth/types"
import { careerProfileLockReason } from "../configuration/subjectProfile"
import { profileProgress } from "../configuration/subjectProfileFields"
import type { TemplateStore } from "../shared/templateStore"
import { TemplateValidationError } from "../configuration/templateRuntime"
import { apiJson, validationError } from "../http/responses"
import {
  authorizedCareerSession,
  baseOptions,
  CONVOCATION_LOCK_REASON,
  lockPayload,
  studyModalityLabel,
  type AcademicStructureDeps,
  type CareerRecord,
} from "./structure"

export type ScheduledSubjectRecord = {
  id: string
  code: string
  name: string
  cycle: number | null
  active: boolean
  generatesSyllabus: boolean
  modality: string | null
  /** Name of the malla of the subject; the list only holds subjects of mallas that are not closed. */
  mallaName?: string | null
  /** Code of that malla: with the subject code it names the subject in page addresses. */
  mallaCode?: string | null
}

export type CareerParallelRecord = { id: string; subjectId: string; code: string; shift: string | null }

export interface ScheduledSubjectsRepository {
  careerParallels(careerId: string): Promise<CareerParallelRecord[]>
  parallelsWithSyllabus(parallelIds: string[]): Promise<string[]>
  parallelsWithTeacher(parallelIds: string[]): Promise<string[]>
  parallelsWithSentSyllabus(parallelIds: string[]): Promise<string[]>
  parallelsWithStartedSyllabus(parallelIds: string[]): Promise<string[]>
  careerSubjects(careerId: string): Promise<ScheduledSubjectRecord[]>
}

export type ScheduledSubjectsDeps = AcademicStructureDeps & {
  scheduled: ScheduledSubjectsRepository
  templates: TemplateStore
  careerProfileEditable: (careerId: string) => Promise<boolean>
}

type Progress = Map<string, { filled: number; total: number }>

async function progressOf(templates: TemplateStore, subjectIds: string[]): Promise<Progress> {
  const template = await templates.template()
  if (template === null) return new Map(subjectIds.map((id) => [id, { filled: 0, total: 0 }]))
  return profileProgress({ template, definition: template.definition, store: templates }, subjectIds)
}

export async function scheduledSubjects(request: Request, deps: ScheduledSubjectsDeps, requestedCareerId: string | null = null): Promise<Response> {
  const authorized = await authorizedCareerSession(request, deps, requestedCareerId)
  if (authorized instanceof Response) return authorized
  return scheduledSubjectsResponse(request, authorized.career, deps, authorized.session)
}

export async function scheduledSubjectsResponse(request: Request, career: CareerRecord, deps: ScheduledSubjectsDeps, session: AppSession): Promise<Response> {
  try {
    const lock = await deps.academic.careerLock(career.id)
    const profileLockReason = await careerProfileLockReason(session, career.id, deps.careerProfileEditable)
    const parallels = await deps.scheduled.careerParallels(career.id)
    const ids = parallels.map((parallel) => parallel.id)
    const withSyllabus = new Set(await deps.scheduled.parallelsWithSyllabus(ids))
    const sent = new Set(await deps.scheduled.parallelsWithSentSyllabus(ids))
    const started = new Set(await deps.scheduled.parallelsWithStartedSyllabus(ids))
    const subjects = await deps.scheduled.careerSubjects(career.id)
    const complete = await progressOf(
      deps.templates,
      subjects.map((subject) => subject.id),
    )
    const active = subjects.filter((subject) => subject.active)
    const progress = await progressOf(
      deps.templates,
      active.map((subject) => subject.id),
    )

    const rows = subjects.flatMap((subject) => {
      const group = parallels.filter((parallel) => parallel.subjectId === subject.id)
      if (group.length === 0 && !subject.active) return []
      const done = complete.get(subject.id)
      return [
        {
          subject_id: subject.id,
          label: `${subject.code} · ${subject.name}`,
          subject_code: subject.code,
          subject_name: subject.name,
          subject_cycle: subject.cycle,
          profile_complete: done === undefined ? false : done.filled === done.total,
          generates_syllabus: subject.generatesSyllabus,
          modality_name: studyModalityLabel(subject.modality),
          malla_name: subject.mallaName ?? null,
          parallels: group.map((parallel) => ({
            id: parallel.id,
            code: parallel.code,
            shift: parallel.shift,
            editable: true,
            deletable: !withSyllabus.has(parallel.id),
            sent_syllabus: sent.has(parallel.id),
            started_syllabus: started.has(parallel.id),
          })),
          editable: true,
        },
      ]
    })

    return apiJson({
      career: { id: career.id, name: career.name, lock_reason: lock === null ? null : CONVOCATION_LOCK_REASON, lock: lockPayload(lock), profile_lock_reason: profileLockReason },
      scheduledSubjects: rows,
      options: {
        ...baseOptions(),
        activeSubjects: active.map((subject) => {
          const counts = progress.get(subject.id)
          return {
            id: subject.id,
            codigo_asignatura: subject.code,
            nombre: subject.name,
            ciclo: subject.cycle,
            malla_name: subject.mallaName ?? null,
            malla_code: subject.mallaCode ?? null,
            generates_syllabus: subject.generatesSyllabus,
            profile_complete: (counts?.filled ?? 0) === (counts?.total ?? 0),
            profile_filled: counts?.filled ?? 0,
            profile_total: counts?.total ?? 0,
          }
        }),
      },
    })
  } catch (error) {
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}
