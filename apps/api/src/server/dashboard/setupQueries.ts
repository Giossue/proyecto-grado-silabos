import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { hasRows } from "../../prisma/sql"
import { openCurriculum } from "../syllabus/syllabusSql"
import type { CareerReadinessFacts, SetupRepository } from "./setupChecklist"

// Readiness looks at the subjects of every malla of the career that is not closed.
const OPEN_CURRICULUM = openCurriculum("asignaturas")
const SCHEDULED_SUBJECT = Prisma.sql`asignaturas.asignatura_activa = true and asignaturas.genera_silabo_asignatura = true and ${OPEN_CURRICULUM}`
const ACTIVE_CAREER = Prisma.sql`carreras.carrera_activa = true`
const PROCESS_ALIVE = Prisma.sql`exists (select convocatorias_universidad.convocatoria_universidad_id from convocatorias_universidad
  where convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

function activeTeacher(careerId: string): Prisma.Sql {
  return Prisma.sql`asignaciones_rol.asignacion_rol_activa = true and asignaciones_rol.rol = 'docente' and asignaciones_rol.carrera_id = ${careerId}::uuid
    and usuarios.usuario_activo = true`
}

async function total(query: PromiseLike<{ total: number }[]>): Promise<number> {
  const [row] = await query
  return Number(row?.total ?? 0)
}

type CareerRow = { subjects: number; facultyId: string | null; hasLogo: boolean; disk: string | null; path: string | null; classification: string | null }

export function setupRepositoryOn(db: Db): SetupRepository {
  return {
    activeFacultyExists: () => hasRows(db.$queryRaw`select facultades.facultad_id from facultades where facultades.facultad_activa = true limit 1`),
    activeCareerCount: () => total(db.$queryRaw<{ total: number }[]>`select count(*)::int as total from carreras where ${ACTIVE_CAREER}`),
    activeCareersWithoutCoordinator: () =>
      total(
        db.$queryRaw<{ total: number }[]>`select count(*)::int as total from carreras
          where ${ACTIVE_CAREER} and carreras.carrera_id not in (select asignaciones_rol.carrera_id from asignaciones_rol
            where asignaciones_rol.rol = 'coordinador' and asignaciones_rol.asignacion_rol_activa = true)`,
      ),
    activeUserWithRole: (role) =>
      hasRows(
        db.$queryRaw`select usuarios.usuario_id from usuarios
          where usuarios.usuario_activo = true and exists (select asignaciones_rol.asignacion_rol_id from asignaciones_rol
            where asignaciones_rol.usuario_id = usuarios.usuario_id and asignaciones_rol.asignacion_rol_activa = true and asignaciones_rol.rol = ${role})
          limit 1`,
      ),
    processExists: () => hasRows(db.$queryRaw`select convocatorias_universidad.convocatoria_universidad_id from convocatorias_universidad limit 1`),
    templateHasFields: (templateId) =>
      hasRows(
        db.$queryRaw`select definiciones_campo.definicion_campo_id from definiciones_campo
          where definiciones_campo.plantilla_id = ${templateId}::uuid and definiciones_campo.vigente_en_plantilla = true limit 1`,
      ),
    async processSyllabusCounts(processId) {
      const [row] = await db.$queryRaw<{ total: number; approved: number; notStarted: number }[]>`select count(*)::int as total,
          (count(*) filter (where silabos.estado_silabo = 'aprobado'))::int as approved,
          (count(*) filter (where silabos.estado_silabo = 'sin_iniciar'))::int as "notStarted"
        from silabos
        where exists (select convocatorias_carreras.convocatoria_carrera_id from convocatorias_carreras
          where convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
            and convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and ${PROCESS_ALIVE})`
      return { total: row?.total ?? 0, approved: row?.approved ?? 0, notStarted: row?.notStarted ?? 0 }
    },
    careersWithoutConvocation: (processId) =>
      total(
        db.$queryRaw<{ total: number }[]>`select count(*)::int as total from carreras
          where ${ACTIVE_CAREER} and carreras.carrera_id not in (select convocatorias_carreras.carrera_id from convocatorias_carreras
            where convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and ${PROCESS_ALIVE})`,
      ),
    async careerReadiness(careerId): Promise<CareerReadinessFacts | null> {
      const [career] = await db.$queryRaw<CareerRow[]>`select (select count(*) from asignaturas where asignaturas.carrera_id = carreras.carrera_id and ${OPEN_CURRICULUM})::int as subjects,
          facultades.facultad_id::text as "facultyId", archivos.archivo_id is not null as "hasLogo", archivos.disco as disk,
          archivos.ruta_archivo as path, archivos.categoria as classification
        from carreras
          left join facultades on facultades.facultad_id = carreras.facultad_id
          left join archivos on archivos.archivo_id = facultades.logo_archivo_id
        where carreras.carrera_id = ${careerId}::uuid
        limit 1`
      if (!career) return null
      const subjects = await db.$queryRaw<{ id: string; withParallels: boolean }[]>`select asignaturas.asignatura_id::text as id,
          exists (select paralelos.paralelo_id from paralelos where paralelos.asignatura_id = asignaturas.asignatura_id) as "withParallels"
        from asignaturas
        where ${SCHEDULED_SUBJECT} and asignaturas.carrera_id = ${careerId}::uuid`
      const [parallels] = await db.$queryRaw<{ total: number; withTeacher: number }[]>`select count(*)::int as total,
          (count(*) filter (where exists (select asignaciones_paralelo.asignacion_paralelo_id from asignaciones_paralelo
            inner join asignaciones_rol on asignaciones_rol.asignacion_rol_id = asignaciones_paralelo.asignacion_rol_id
            inner join usuarios on usuarios.usuario_id = asignaciones_rol.usuario_id
            where asignaciones_paralelo.paralelo_id = paralelos.paralelo_id and asignaciones_paralelo.asignacion_paralelo_activa = true
              and ${activeTeacher(careerId)})))::int as "withTeacher"
        from paralelos
        where exists (select asignaturas.asignatura_id from asignaturas
          where asignaturas.asignatura_id = paralelos.asignatura_id and ${SCHEDULED_SUBJECT} and asignaturas.carrera_id = ${careerId}::uuid)`
      return {
        subjectsCount: Number(career.subjects),
        faculty:
          career.facultyId === null
            ? null
            : { id: career.facultyId, logo: career.hasLogo ? { disk: career.disk ?? "private", path: career.path, classification: career.classification } : null },
        scheduledSubjectIds: subjects.map((subject) => subject.id),
        scheduledWithParallels: subjects.filter((subject) => subject.withParallels).length,
        parallelTotal: parallels?.total ?? 0,
        parallelsWithTeacher: parallels?.withTeacher ?? 0,
      }
    },
    careerHasActiveTeacher: (careerId) =>
      hasRows(
        db.$queryRaw`select asignaciones_rol.asignacion_rol_id from asignaciones_rol
          inner join usuarios on usuarios.usuario_id = asignaciones_rol.usuario_id
          where ${activeTeacher(careerId)} limit 1`,
      ),
  }
}
