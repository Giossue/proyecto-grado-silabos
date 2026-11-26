import { profileProgress } from "../configuration/subjectProfileFields"
import type { TemplateStore } from "../shared/templateStore"
import { TemplateValidationError } from "../configuration/templateRuntime"
import { apiJson, validationError } from "../http/responses"
import {
  authorizedCareer,
  baseOptions,
  CONVOCATION_LOCK_REASON,
  lockPayload,
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
  campus: string | null
  modality: string | null
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

export type ScheduledSubjectsDeps = AcademicStructureDeps & { scheduled: ScheduledSubjectsRepository; templates: TemplateStore }

type Progress = Map<string, { filled: number; total: number }>

async function progressOf(templates: TemplateStore, subjectIds: string[]): Promise<Progress> {
  const template = await templates.template()
  if (template === null) return new Map(subjectIds.map((id) => [id, { filled: 0, total: 0 }]))
  return profileProgress({ template, definition: template.definition, store: templates }, subjectIds)
}

export async function scheduledSubjects(request: Request, deps: ScheduledSubjectsDeps): Promise<Response> {
  const career = await authorizedCareer(request, deps)
  if (career instanceof Response) return career
  return scheduledSubjectsResponse(request, career, deps)
}

export async function scheduledSubjectsResponse(request: Request, career: CareerRecord, deps: ScheduledSubjectsDeps): Promise<Response> {
  try {
    const lock = await deps.academic.careerLock(career.id)
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
          campus_name: subject.campus,
          modality_name: subject.modality,
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
      career: { id: career.id, name: career.name, lock_reason: lock === null ? null : CONVOCATION_LOCK_REASON, lock: lockPayload(lock) },
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
