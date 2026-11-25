import "server-only"
import { and, count, eq, exists, isNotNull, notInArray, sql, type SQL } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { hasRows } from "@/db/expressions"
import {
  archivos,
  asignacionesParalelo,
  asignacionesRol,
  asignaturas,
  carreras,
  convocatoriasCarreras,
  convocatoriasUniversidad,
  definicionesCampo,
  facultades,
  paralelos,
  silabos,
  usuarios,
} from "@/db/schema"
import type { CareerReadinessFacts, SetupRepository } from "./setupChecklist"

const SCHEDULED_SUBJECT = and(eq(asignaturas.asignaturaActiva, true), eq(asignaturas.generaSilaboAsignatura, true))
const ACTIVE_CAREER = eq(carreras.carreraActiva, true)

function processAlive(executor: Executor): SQL {
  return exists(
    executor
      .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
      .from(convocatoriasUniversidad)
      .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId)),
  )
}

function activeTeacher(careerId: string): SQL | undefined {
  return and(
    eq(asignacionesRol.asignacionRolActiva, true),
    eq(asignacionesRol.rol, "docente"),
    eq(asignacionesRol.carreraId, careerId),
    eq(usuarios.usuarioActivo, true),
    isNotNull(usuarios.correoVerificadoEn),
  )
}

export function setupRepositoryOn(executor: Executor): SetupRepository {
  return {
    activeFacultyExists: () => hasRows(executor.select({ id: facultades.facultadId }).from(facultades).where(eq(facultades.facultadActiva, true)).limit(1)),
    activeCareerCount: () => executor.$count(carreras, ACTIVE_CAREER),
    activeCareersWithoutCoordinator: () =>
      executor.$count(
        carreras,
        and(
          ACTIVE_CAREER,
          notInArray(
            carreras.carreraId,
            executor
              .select({ id: asignacionesRol.carreraId })
              .from(asignacionesRol)
              .where(and(eq(asignacionesRol.rol, "coordinador"), eq(asignacionesRol.asignacionRolActiva, true))),
          ),
        ),
      ),
    activeUserWithRole: (role) =>
      hasRows(
        executor
          .select({ id: usuarios.usuarioId })
          .from(usuarios)
          .where(
            and(
              eq(usuarios.usuarioActivo, true),
              exists(
                executor
                  .select({ id: asignacionesRol.asignacionRolId })
                  .from(asignacionesRol)
                  .where(and(eq(asignacionesRol.usuarioId, usuarios.usuarioId), eq(asignacionesRol.asignacionRolActiva, true), eq(asignacionesRol.rol, role))),
              ),
            ),
          )
          .limit(1),
      ),
    processExists: () => hasRows(executor.select({ id: convocatoriasUniversidad.convocatoriaUniversidadId }).from(convocatoriasUniversidad).limit(1)),
    templateHasFields: (templateId) =>
      hasRows(
        executor
          .select({ id: definicionesCampo.definicionCampoId })
          .from(definicionesCampo)
          .where(and(eq(definicionesCampo.plantillaId, templateId), eq(definicionesCampo.vigenteEnPlantilla, true)))
          .limit(1),
      ),
    async processSyllabusCounts(processId) {
      const [row] = await executor
        .select({
          total: count(),
          approved: sql<number>`count(*) filter (where ${silabos.estadoSilabo} = 'aprobado')`.mapWith(Number),
          notStarted: sql<number>`count(*) filter (where ${silabos.estadoSilabo} = 'sin_iniciar')`.mapWith(Number),
        })
        .from(silabos)
        .where(
          exists(
            executor
              .select({ id: convocatoriasCarreras.convocatoriaCarreraId })
              .from(convocatoriasCarreras)
              .where(
                and(
                  eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId),
                  eq(convocatoriasCarreras.convocatoriaUniversidadId, processId),
                  processAlive(executor),
                ),
              ),
          ),
        )
      return { total: row?.total ?? 0, approved: row?.approved ?? 0, notStarted: row?.notStarted ?? 0 }
    },
    careersWithoutConvocation: (processId) =>
      executor.$count(
        carreras,
        and(
          ACTIVE_CAREER,
          notInArray(
            carreras.carreraId,
            executor
              .select({ id: convocatoriasCarreras.carreraId })
              .from(convocatoriasCarreras)
              .where(and(eq(convocatoriasCarreras.convocatoriaUniversidadId, processId), processAlive(executor))),
          ),
        ),
      ),
    async careerReadiness(careerId): Promise<CareerReadinessFacts | null> {
      const [career] = await executor
        .select({
          subjects: executor.$count(asignaturas, eq(asignaturas.carreraId, carreras.carreraId)),
          facultyId: facultades.facultadId,
          hasLogo: isNotNull(archivos.archivoId).mapWith(Boolean),
          disk: archivos.disco,
          path: archivos.rutaArchivo,
          classification: archivos.categoria,
        })
        .from(carreras)
        .leftJoin(facultades, eq(facultades.facultadId, carreras.facultadId))
        .leftJoin(archivos, eq(archivos.archivoId, facultades.logoArchivoId))
        .where(eq(carreras.carreraId, careerId))
        .limit(1)
      if (!career) return null
      const subjects = await executor
        .select({
          id: asignaturas.asignaturaId,
          withParallels: sql<boolean>`${exists(executor.select({ id: paralelos.paraleloId }).from(paralelos).where(eq(paralelos.asignaturaId, asignaturas.asignaturaId)))}`,
        })
        .from(asignaturas)
        .where(and(SCHEDULED_SUBJECT, eq(asignaturas.carreraId, careerId)))
      const teacher = executor
        .select({ id: asignacionesParalelo.asignacionParaleloId })
        .from(asignacionesParalelo)
        .innerJoin(asignacionesRol, eq(asignacionesRol.asignacionRolId, asignacionesParalelo.asignacionRolId))
        .innerJoin(usuarios, eq(usuarios.usuarioId, asignacionesRol.usuarioId))
        .where(and(eq(asignacionesParalelo.paraleloId, paralelos.paraleloId), eq(asignacionesParalelo.asignacionParaleloActiva, true), activeTeacher(careerId)))
      const [parallels] = await executor
        .select({ total: count(), withTeacher: sql<number>`count(*) filter (where ${exists(teacher)})`.mapWith(Number) })
        .from(paralelos)
        .where(
          exists(
            executor
              .select({ id: asignaturas.asignaturaId })
              .from(asignaturas)
              .where(and(eq(asignaturas.asignaturaId, paralelos.asignaturaId), SCHEDULED_SUBJECT, eq(asignaturas.carreraId, careerId))),
          ),
        )
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
        executor
          .select({ id: asignacionesRol.asignacionRolId })
          .from(asignacionesRol)
          .innerJoin(usuarios, eq(usuarios.usuarioId, asignacionesRol.usuarioId))
          .where(activeTeacher(careerId))
          .limit(1),
      ),
  }
}

export function createSetupRepository(): SetupRepository {
  return setupRepositoryOn(db)
}
