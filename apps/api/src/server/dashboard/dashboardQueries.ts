import { and, desc, eq, exists, inArray, ne, sql, type AnyColumn, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { convocatoriasCarreras, convocatoriasUniversidad, docentesVigentesSilabo, periodosAcademicos, silabos, usuarios } from "@/db/schema"
import { libraryReviewCounts } from "../library/reviewQueries"
import { institutionTimezone } from "../shared/clock"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { ConvocationRecord, DashboardRepository, ProcessRecord, TeacherSyllabus } from "./dashboard"

const localDate = (column: AnyColumn) => sql<string>`to_char(${column} at time zone ${institutionTimezone()}, 'YYYY-MM-DD')`

const PROCESS = {
  id: convocatoriasUniversidad.convocatoriaUniversidadId,
  state: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
  period: periodosAcademicos.codigoPeriodoAcademico,
  startsOn: localDate(convocatoriasUniversidad.fechaInicio),
  dueOn: localDate(convocatoriasUniversidad.fechaEntrega),
  periodEndsOn: periodosAcademicos.fechaFinPeriodo,
}

const CONVOCATION = { id: convocatoriasCarreras.convocatoriaCarreraId, state: convocatoriasCarreras.estadoConvocatoriaCarrera }
const IN_PROGRESS = inArray(convocatoriasUniversidad.estadoConvocatoriaUniversidad, ["abierto", "pausado"])

function processes(executor: Executor) {
  return executor
    .select(PROCESS)
    .from(convocatoriasUniversidad)
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, convocatoriasUniversidad.periodoAcademicoId))
}

function currentTeacher(executor: Executor, userId: string): SQL {
  return exists(
    executor
      .select({ id: docentesVigentesSilabo.silaboId })
      .from(docentesVigentesSilabo)
      .innerJoin(usuarios, eq(usuarios.usuarioId, docentesVigentesSilabo.usuarioId))
      .where(and(eq(docentesVigentesSilabo.silaboId, silabos.silaboId), eq(docentesVigentesSilabo.usuarioId, userId), eq(usuarios.usuarioActivo, true))),
  )
}

function careerOf(careerId: string | null): SQL | undefined {
  return careerId === null ? undefined : eq(convocatoriasCarreras.carreraId, careerId)
}

async function inProgressProcess(executor: Executor): Promise<ProcessRecord | null> {
  const [row] = await processes(executor).where(IN_PROGRESS).limit(1)
  return row ?? null
}

export function createDashboardRepository(executor: Executor = db): DashboardRepository {
  return {
    inProgressProcess: () => inProgressProcess(executor),
    async latestProcess() {
      const current = await inProgressProcess(executor)
      if (current !== null) return current
      const [row] = await processes(executor).orderBy(desc(periodosAcademicos.fechaInicioPeriodo)).limit(1)
      return row ?? null
    },
    async convocation(careerId, processId): Promise<ConvocationRecord | null> {
      const [row] = await executor
        .select(CONVOCATION)
        .from(convocatoriasCarreras)
        .where(
          and(
            eq(convocatoriasCarreras.carreraId, careerId),
            eq(convocatoriasCarreras.convocatoriaUniversidadId, processId),
            exists(
              executor
                .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
                .from(convocatoriasUniversidad)
                .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId)),
            ),
          ),
        )
        .limit(1)
      return row ?? null
    },
    async teacherOpenSyllabi(userId, careerId): Promise<TeacherSyllabus[]> {
      const found = await executor
        .select({ process: PROCESS, convocation: CONVOCATION, dueEpoch: sql<string>`extract(epoch from ${convocatoriasUniversidad.fechaEntrega})::bigint::text` })
        .from(silabos)
        .innerJoin(convocatoriasCarreras, eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId))
        .innerJoin(convocatoriasUniversidad, eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId))
        .innerJoin(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, convocatoriasUniversidad.periodoAcademicoId))
        .where(and(ne(silabos.estadoSilabo, "aprobado"), currentTeacher(executor, userId), careerOf(careerId), IN_PROGRESS))
      return found.map((row) => ({ convocation: row.convocation, process: row.process, dueAt: Number(row.dueEpoch) }))
    },
    async finalizedTeacherConvocation(userId, processId, careerId): Promise<ConvocationRecord | null> {
      const [row] = await executor
        .select(CONVOCATION)
        .from(silabos)
        .innerJoin(convocatoriasCarreras, eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId))
        .innerJoin(convocatoriasUniversidad, eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId))
        .where(and(currentTeacher(executor, userId), eq(convocatoriasCarreras.convocatoriaUniversidadId, processId), careerOf(careerId)))
        .limit(1)
      return row ?? null
    },
    libraryCounts: libraryReviewCounts,
  }
}
