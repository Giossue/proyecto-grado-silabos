import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { CareerReadinessFacts, SetupRepository } from "./setupChecklist"

const SCHEDULED_SUBJECT = sql`asignatura.asignatura_activa = true and asignatura.genera_silabo_asignatura = true`

async function exists(executor: Executor, query: ReturnType<typeof sql>): Promise<boolean> {
  const [row] = await rowsOf<{ found: boolean }>(executor, sql`select exists (${query}) as found`)
  return row?.found === true
}

async function count(executor: Executor, query: ReturnType<typeof sql>): Promise<number> {
  const [row] = await rowsOf<{ total: string }>(executor, query)
  return Number(row?.total ?? 0)
}

export function setupRepositoryOn(executor: Executor): SetupRepository {
  return {
    activeFacultyExists: () => exists(executor, sql`select 1 from facultades where facultad_activa = true`),
    activeCareerCount: () => count(executor, sql`select count(*) as total from carreras where carrera_activa = true`),
    activeCareersWithoutCoordinator: () =>
      count(
        executor,
        sql`select count(*) as total from carreras where carrera_activa = true and carrera_id not in (
          select carrera_id from asignaciones_rol where rol = 'coordinador' and asignacion_rol_activa = true)`,
      ),
    activeUserWithRole: (role) =>
      exists(
        executor,
        sql`select 1 from usuarios where usuario_activo = true and exists (select 1 from asignaciones_rol asignacion
          where asignacion.usuario_id = usuarios.usuario_id and asignacion.asignacion_rol_activa = true and asignacion.rol = ${role})`,
      ),
    processExists: () => exists(executor, sql`select 1 from convocatorias_universidad`),
    templateHasFields: (templateId) =>
      exists(executor, sql`select 1 from definiciones_campo where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = true`),
    async processSyllabusCounts(processId) {
      const [row] = await rowsOf<{ total: string; approved: string; not_started: string }>(
        executor,
        sql`select count(*) as total, count(*) filter (where silabos.estado_silabo = 'aprobado') as approved,
            count(*) filter (where silabos.estado_silabo = 'sin_iniciar') as not_started
          from silabos where exists (select 1 from convocatorias_carreras convocatoria
            where convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id and convocatoria.convocatoria_universidad_id = ${processId}::uuid
              and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id))`,
      )
      return { total: Number(row?.total ?? 0), approved: Number(row?.approved ?? 0), notStarted: Number(row?.not_started ?? 0) }
    },
    careersWithoutConvocation: (processId) =>
      count(
        executor,
        sql`select count(*) as total from carreras where carrera_activa = true and carrera_id not in (
          select convocatoria.carrera_id from convocatorias_carreras convocatoria where convocatoria.convocatoria_universidad_id = ${processId}::uuid
            and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id))`,
      ),
    async careerReadiness(careerId): Promise<CareerReadinessFacts | null> {
      const [career] = await rowsOf<{ subjects: string; faculty_id: string | null; has_logo: boolean; disk: string | null; path: string | null; classification: string | null }>(
        executor,
        sql`select (select count(*) from asignaturas where asignaturas.carrera_id = carrera.carrera_id) as subjects,
            facultad.facultad_id::text as faculty_id, archivo.archivo_id is not null as has_logo, archivo.disco as disk,
            archivo.ruta_archivo as path, archivo.categoria as classification
          from carreras carrera
            left join facultades facultad on facultad.facultad_id = carrera.facultad_id
            left join archivos archivo on archivo.archivo_id = facultad.logo_archivo_id
          where carrera.carrera_id = ${careerId}::uuid limit 1`,
      )
      if (!career) return null
      const subjects = await rowsOf<{ id: string; with_parallels: boolean }>(
        executor,
        sql`select asignatura.asignatura_id::text as id,
            exists (select 1 from paralelos paralelo where paralelo.asignatura_id = asignatura.asignatura_id) as with_parallels
          from asignaturas asignatura where ${SCHEDULED_SUBJECT} and asignatura.carrera_id = ${careerId}::uuid`,
      )
      const [parallels] = await rowsOf<{ total: string; with_teacher: string }>(
        executor,
        sql`select count(*) as total, count(*) filter (where exists (
            select 1 from asignaciones_paralelo asignacion
              inner join asignaciones_rol rol on rol.asignacion_rol_id = asignacion.asignacion_rol_id
              inner join usuarios usuario on usuario.usuario_id = rol.usuario_id
            where asignacion.paralelo_id = paralelo.paralelo_id and asignacion.asignacion_paralelo_activa = true
              and rol.asignacion_rol_activa = true and rol.rol = 'docente' and rol.carrera_id = ${careerId}::uuid
              and usuario.usuario_activo = true and usuario.correo_verificado_en is not null)) as with_teacher
          from paralelos paralelo where exists (select 1 from asignaturas asignatura
            where asignatura.asignatura_id = paralelo.asignatura_id and ${SCHEDULED_SUBJECT} and asignatura.carrera_id = ${careerId}::uuid)`,
      )
      return {
        subjectsCount: Number(career.subjects),
        faculty:
          career.faculty_id === null
            ? null
            : { id: career.faculty_id, logo: career.has_logo ? { disk: career.disk ?? "private", path: career.path, classification: career.classification } : null },
        scheduledSubjectIds: subjects.map((subject) => subject.id),
        scheduledWithParallels: subjects.filter((subject) => subject.with_parallels).length,
        parallelTotal: Number(parallels?.total ?? 0),
        parallelsWithTeacher: Number(parallels?.with_teacher ?? 0),
      }
    },
    careerHasActiveTeacher: (careerId) =>
      exists(
        executor,
        sql`select 1 from asignaciones_rol rol inner join usuarios usuario on usuario.usuario_id = rol.usuario_id
          where rol.asignacion_rol_activa = true and rol.rol = 'docente' and rol.carrera_id = ${careerId}::uuid
            and usuario.usuario_activo = true and usuario.correo_verificado_en is not null`,
      ),
  }
}

export function createSetupRepository(): SetupRepository {
  return setupRepositoryOn(db as unknown as Executor)
}
