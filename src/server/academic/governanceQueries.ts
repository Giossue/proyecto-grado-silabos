import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { uuidList } from "../laravel/sql"
import { phpJsonDecode } from "../configuration/phpValues"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { GovernanceCareer, GovernanceFaculty, GovernancePeriod, GovernanceProcess, GovernanceRepository } from "./governance"

type FacultyRow = {
  id: string
  name: string
  campus: string
  libraries: string | null
  active: boolean
  has_logo: boolean
  disk: string | null
  path: string | null
  classification: string | null
}

type CareerRow = {
  id: string
  faculty_id: string
  coordinator_id: string | null
  coordinator_name: string | null
  modality: string | null
  campus: string | null
  code: string
  name: string
  active: boolean
}

export function governanceRepositoryOn(executor: Executor): GovernanceRepository {
  return {
    processes: () =>
      rowsOf<GovernanceProcess>(
        executor,
        sql`select convocatoria_universidad_id::text as "id", periodo_academico_id::text as "periodId", estado_convocatoria_universidad as "state"
          from convocatorias_universidad`,
      ),
    async faculties(): Promise<GovernanceFaculty[]> {
      const found = await rowsOf<FacultyRow>(
        executor,
        sql`select facultad.facultad_id::text as id, facultad.nombre_facultad as name, facultad.campus_facultad as campus,
            facultad.bibliotecas_koha_facultad::text as libraries, facultad.facultad_activa as active,
            archivo.archivo_id is not null as has_logo, archivo.disco as disk, archivo.ruta_archivo as path, archivo.categoria as classification
          from facultades facultad left join archivos archivo on archivo.archivo_id = facultad.logo_archivo_id
          order by facultad.nombre_facultad asc`,
      )
      return found.map((row) => ({
        id: row.id,
        name: row.name,
        campus: row.campus,
        libraries: phpJsonDecode(row.libraries),
        active: row.active,
        logo: row.has_logo ? { disk: row.disk ?? "private", path: row.path, classification: row.classification } : null,
      }))
    },
    async careers(): Promise<GovernanceCareer[]> {
      const found = await rowsOf<CareerRow>(
        executor,
        sql`select carrera.carrera_id::text as id, carrera.facultad_id::text as faculty_id, carrera.modalidad_carrera as modality,
            carrera.codigo_carrera as code, carrera.nombre_carrera as name, carrera.carrera_activa as active, facultad.campus_facultad as campus,
            coordinacion.usuario_id::text as coordinator_id, coordinacion.nombre_usuario as coordinator_name
          from carreras carrera
            left join facultades facultad on facultad.facultad_id = carrera.facultad_id
            left join lateral (
              select usuario.usuario_id, usuario.nombre_usuario from asignaciones_rol asignacion
                left join usuarios usuario on usuario.usuario_id = asignacion.usuario_id
              where asignacion.carrera_id = carrera.carrera_id and asignacion.rol = 'coordinador' and asignacion.asignacion_rol_activa = true
              limit 1
            ) coordinacion on true
          order by carrera.nombre_carrera asc`,
      )
      return found.map((row) => ({
        id: row.id,
        facultyId: row.faculty_id,
        coordinator: row.coordinator_id === null || row.coordinator_name === null ? null : { id: row.coordinator_id, name: row.coordinator_name },
        modality: row.modality,
        campus: row.campus,
        code: row.code,
        name: row.name,
        active: row.active,
      }))
    },
    async periods(): Promise<GovernancePeriod[]> {
      const found = await rowsOf<{ id: string; code: string; starts_on: string; ends_on: string; weeks: number | null }>(
        executor,
        sql`select periodo_academico_id::text as id, codigo_periodo_academico as code, to_char(fecha_inicio_periodo, 'YYYY-MM-DD') as starts_on,
            to_char(fecha_fin_periodo, 'YYYY-MM-DD') as ends_on, cantidad_semanas_lectivas as weeks
          from periodos_academicos order by fecha_inicio_periodo desc`,
      )
      return found.map((row) => ({ id: row.id, code: row.code, startsOn: row.starts_on, endsOn: row.ends_on, teachingWeeks: row.weeks === null ? null : Number(row.weeks) }))
    },
    async facultiesWithActiveCareers(facultyIds) {
      const found = await rowsOf<{ id: string }>(
        executor,
        sql`select distinct facultad_id::text as id from carreras where facultad_id in (${uuidList(facultyIds)}) and carrera_activa = true`,
      )
      return found.map((row) => row.id)
    },
    async careersInRunningConvocation(careerIds) {
      const found = await rowsOf<{ id: string }>(
        executor,
        sql`select distinct convocatoria.carrera_id::text as id from convocatorias_carreras convocatoria
          where convocatoria.carrera_id in (${uuidList(careerIds)}) and convocatoria.estado_convocatoria_carrera != 'cerrada'
            and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
              and proceso.estado_convocatoria_universidad != 'cerrado')`,
      )
      return found.map((row) => row.id)
    },
    async careerRoleCounts(careerIds) {
      if (careerIds.length === 0) return []
      const found = await rowsOf<{ career_id: string; role: string; total: string }>(
        executor,
        sql`select carrera_id::text as career_id, rol as role, count(*) as total from asignaciones_rol
          where carrera_id in (${uuidList(careerIds)}) and asignacion_rol_activa = true group by carrera_id, rol`,
      )
      return found.map((row) => ({ careerId: row.career_id, role: row.role, total: Number(row.total) }))
    },
  }
}

export function createGovernanceRepository(): GovernanceRepository {
  return governanceRepositoryOn(db as unknown as Executor)
}
