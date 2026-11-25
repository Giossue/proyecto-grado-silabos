import { and, asc, count, desc, eq, exists, inArray, isNotNull, ne, sql } from "drizzle-orm"
import { db } from "@/db"
import { jsonText } from "@/db/expressions"
import { archivos, asignacionesRol, carreras, convocatoriasCarreras, convocatoriasUniversidad, facultades, periodosAcademicos, usuarios } from "@/db/schema"
import { phpJsonDecode } from "../configuration/phpValues"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { GovernanceCareer, GovernanceFaculty, GovernancePeriod, GovernanceRepository } from "./governance"

export function governanceRepositoryOn(executor: Executor): GovernanceRepository {
  return {
    processes: () =>
      executor
        .select({
          id: convocatoriasUniversidad.convocatoriaUniversidadId,
          periodId: convocatoriasUniversidad.periodoAcademicoId,
          state: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
        })
        .from(convocatoriasUniversidad),
    async faculties(): Promise<GovernanceFaculty[]> {
      const found = await executor
        .select({
          id: facultades.facultadId,
          name: facultades.nombreFacultad,
          campus: facultades.campusFacultad,
          libraries: jsonText(facultades.bibliotecasKohaFacultad),
          active: facultades.facultadActiva,
          hasLogo: isNotNull(archivos.archivoId).mapWith(Boolean),
          disk: archivos.disco,
          path: archivos.rutaArchivo,
          classification: archivos.categoria,
        })
        .from(facultades)
        .leftJoin(archivos, eq(archivos.archivoId, facultades.logoArchivoId))
        .orderBy(asc(facultades.nombreFacultad))
      return found.map((row) => ({
        id: row.id,
        name: row.name,
        campus: row.campus,
        libraries: phpJsonDecode(row.libraries),
        active: row.active,
        logo: row.hasLogo ? { disk: row.disk ?? "private", path: row.path, classification: row.classification } : null,
      }))
    },
    async careers(): Promise<GovernanceCareer[]> {
      const coordination = executor
        .select({ id: usuarios.usuarioId, name: usuarios.nombreUsuario })
        .from(asignacionesRol)
        .leftJoin(usuarios, eq(usuarios.usuarioId, asignacionesRol.usuarioId))
        .where(and(eq(asignacionesRol.carreraId, carreras.carreraId), eq(asignacionesRol.rol, "coordinador"), eq(asignacionesRol.asignacionRolActiva, true)))
        .limit(1)
        .as("coordinacion")
      const found = await executor
        .select({
          id: carreras.carreraId,
          facultyId: carreras.facultadId,
          modality: carreras.modalidadCarrera,
          code: carreras.codigoCarrera,
          name: carreras.nombreCarrera,
          active: carreras.carreraActiva,
          campus: facultades.campusFacultad,
          coordinatorId: coordination.id,
          coordinatorName: coordination.name,
        })
        .from(carreras)
        .leftJoin(facultades, eq(facultades.facultadId, carreras.facultadId))
        .leftJoinLateral(coordination, sql`true`)
        .orderBy(asc(carreras.nombreCarrera))
      return found.map((row) => ({
        id: row.id,
        facultyId: row.facultyId,
        coordinator: row.coordinatorId === null || row.coordinatorName === null ? null : { id: row.coordinatorId, name: row.coordinatorName },
        modality: row.modality,
        campus: row.campus,
        code: row.code,
        name: row.name,
        active: row.active,
      }))
    },
    async periods(): Promise<GovernancePeriod[]> {
      const found = await executor
        .select({
          id: periodosAcademicos.periodoAcademicoId,
          code: periodosAcademicos.codigoPeriodoAcademico,
          startsOn: periodosAcademicos.fechaInicioPeriodo,
          endsOn: periodosAcademicos.fechaFinPeriodo,
          weeks: periodosAcademicos.cantidadSemanasLectivas,
        })
        .from(periodosAcademicos)
        .orderBy(desc(periodosAcademicos.fechaInicioPeriodo))
      return found.map((row) => ({ id: row.id, code: row.code, startsOn: row.startsOn, endsOn: row.endsOn, teachingWeeks: row.weeks === null ? null : Number(row.weeks) }))
    },
    async facultiesWithActiveCareers(facultyIds) {
      const found = await executor
        .selectDistinct({ id: carreras.facultadId })
        .from(carreras)
        .where(and(inArray(carreras.facultadId, facultyIds), eq(carreras.carreraActiva, true)))
      return found.map((row) => row.id)
    },
    async careersInRunningConvocation(careerIds) {
      const found = await executor
        .selectDistinct({ id: convocatoriasCarreras.carreraId })
        .from(convocatoriasCarreras)
        .where(
          and(
            inArray(convocatoriasCarreras.carreraId, careerIds),
            ne(convocatoriasCarreras.estadoConvocatoriaCarrera, "cerrada"),
            exists(
              executor
                .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
                .from(convocatoriasUniversidad)
                .where(
                  and(
                    eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId),
                    ne(convocatoriasUniversidad.estadoConvocatoriaUniversidad, "cerrado"),
                  ),
                ),
            ),
          ),
        )
      return found.map((row) => row.id)
    },
    async careerRoleCounts(careerIds) {
      if (careerIds.length === 0) return []
      const found = await executor
        .select({ careerId: asignacionesRol.carreraId, role: asignacionesRol.rol, total: count() })
        .from(asignacionesRol)
        .where(and(inArray(asignacionesRol.carreraId, careerIds), eq(asignacionesRol.asignacionRolActiva, true)))
        .groupBy(asignacionesRol.carreraId, asignacionesRol.rol)
      return found.map((row) => ({ careerId: row.careerId as string, role: row.role, total: row.total }))
    },
  }
}

export function createGovernanceRepository(): GovernanceRepository {
  return governanceRepositoryOn(db as unknown as Executor)
}
