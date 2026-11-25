import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { profileProgress } from "../configuration/subjectProfileFields"
import { createTemplateStore, type TemplateStore } from "../configuration/templateStore"
import { TemplateValidationError } from "../configuration/templateRuntime"
import { apiJson, validationError } from "../http/responses"
import {
  authorizedCareer,
  baseOptions,
  CONVOCATION_LOCK_REASON,
  defaultAcademicStructureDeps,
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

async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[]
}

function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

const SYLLABUS_SCOPE = sql`exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
  and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id))`

const IN_PROGRESS = sql`exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
  and estado_convocatoria_carrera in ('abierta', 'pausada')
  and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id
    and estado_convocatoria_universidad in ('abierto', 'pausado'))
  and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id))`

async function parallelIds(parallels: string[], condition: SQL): Promise<string[]> {
  if (parallels.length === 0) return []
  const found = await rows<{ id: string }>(sql`select silabos.paralelo_id::text as id from silabos
    where silabos.paralelo_id in (${uuidList(parallels)}) and ${condition} and ${SYLLABUS_SCOPE}`)
  return [...new Set(found.map((row) => row.id))]
}

export function createScheduledSubjectsRepository(): ScheduledSubjectsRepository {
  return {
    async careerParallels(careerId) {
      const found = await rows<{ id: string; asignatura_id: string; codigo: string; jornada: string | null }>(sql`select paralelos.paralelo_id::text as id,
          paralelos.asignatura_id::text as asignatura_id, paralelos.codigo_paralelo as codigo, paralelos.jornada_paralelo as jornada
        from paralelos where exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id and carrera_id = ${careerId}::uuid)
        order by codigo_paralelo asc`)
      return found.map((row) => ({ id: row.id, subjectId: row.asignatura_id, code: row.codigo, shift: row.jornada }))
    },
    parallelsWithSyllabus: (parallels) =>
      parallelIds(
        parallels,
        sql`(silabos.estado_silabo != 'sin_iniciar' or silabos.iniciado_en is not null
          or exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
            and estado_convocatoria_carrera = 'cerrada'
            and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id)))`,
      ),
    async parallelsWithTeacher(parallels) {
      if (parallels.length === 0) return []
      const found = await rows<{ id: string }>(sql`select paralelo_id::text as id from asignaciones_paralelo where paralelo_id in (${uuidList(parallels)})`)
      return [...new Set(found.map((row) => row.id))]
    },
    parallelsWithSentSyllabus: (parallels) => parallelIds(parallels, sql`${IN_PROGRESS} and silabos.estado_silabo in ('en_revision', 'aprobado')`),
    parallelsWithStartedSyllabus: (parallels) =>
      parallelIds(parallels, sql`${IN_PROGRESS} and (silabos.estado_silabo != 'sin_iniciar' or silabos.iniciado_en is not null)`),
    async careerSubjects(careerId) {
      const found = await rows<{
        id: string
        codigo: string
        nombre: string
        ciclo: number | null
        activo: boolean
        genera: boolean
        campus: string | null
        modalidad: string | null
      }>(sql`select asignatura.asignatura_id::text as id, asignatura.codigo_asignatura as codigo, asignatura.nombre_asignatura as nombre,
          asignatura.ciclo_asignatura as ciclo, asignatura.asignatura_activa as activo, asignatura.genera_silabo_asignatura as genera,
          facultad.campus_facultad as campus, coalesce(asignatura.modalidad_asignatura::text, carrera.modalidad_carrera::text) as modalidad
        from asignaturas asignatura
        left join carreras carrera on carrera.carrera_id = asignatura.carrera_id
        left join facultades facultad on facultad.facultad_id = carrera.facultad_id
        where asignatura.carrera_id = ${careerId}::uuid
        order by asignatura.ciclo_asignatura asc, asignatura.orden_asignatura_en_ciclo asc, asignatura.nombre_asignatura asc`)
      return found.map((row) => ({
        id: row.id,
        code: row.codigo,
        name: row.nombre,
        cycle: row.ciclo === null ? null : Number(row.ciclo),
        active: row.activo,
        generatesSyllabus: row.genera,
        campus: row.campus,
        modality: row.modalidad,
      }))
    },
  }
}

export function defaultScheduledSubjectsDeps(): ScheduledSubjectsDeps {
  return { ...defaultAcademicStructureDeps(), scheduled: createScheduledSubjectsRepository(), templates: createTemplateStore() }
}

type Progress = Map<string, { filled: number; total: number }>

async function progressOf(templates: TemplateStore, subjectIds: string[]): Promise<Progress> {
  const template = await templates.template()
  if (template === null) return new Map(subjectIds.map((id) => [id, { filled: 0, total: 0 }]))
  return profileProgress({ template, definition: template.definition, store: templates }, subjectIds)
}

export async function scheduledSubjects(request: Request, deps: ScheduledSubjectsDeps = defaultScheduledSubjectsDeps()): Promise<Response> {
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
    const withTeacher = new Set(await deps.scheduled.parallelsWithTeacher(ids))
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
            deletable: !withSyllabus.has(parallel.id) && !withTeacher.has(parallel.id),
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
