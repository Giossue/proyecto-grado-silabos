import { and, count, desc, eq, inArray, notExists, sql } from "drizzle-orm"
import { db } from "@/db"
import { hasRows } from "@/db/expressions"
import { asignacionesRol, carreras, convocatoriasCarreras, convocatoriasUniversidad, definicionesCampo, periodosAcademicos, silabos } from "@/db/schema"
import { institutionDateSql } from "../http/sql"
import { uuid7 } from "../http/uuid7"
import type { ProcessRepository, ProcessTx } from "./processes"
import type { Executor } from "./teacherSyllabusQueries"

const PROCESS = {
  id: convocatoriasUniversidad.convocatoriaUniversidadId,
  state: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
  period: periodosAcademicos.codigoPeriodoAcademico,
  periodId: convocatoriasUniversidad.periodoAcademicoId,
  periodEndsOn: periodosAcademicos.fechaFinPeriodo,
  startsOn: sql<string>`${institutionDateSql(sql`${convocatoriasUniversidad.fechaInicio}`)}`,
  dueOn: sql<string>`${institutionDateSql(sql`${convocatoriasUniversidad.fechaEntrega}`)}`,
  convocationsCount: sql<number>`(select count(*) from convocatorias_carreras where ${convocatoriasUniversidad.convocatoriaUniversidadId} = convocatorias_carreras.convocatoria_universidad_id
    and exists (select 1 from convocatorias_universidad vigente where vigente.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id))`.mapWith(Number),
  extensions: convocatoriasUniversidad.cantidadProrrogas,
}

function processes(executor: Executor) {
  return executor
    .select(PROCESS)
    .from(convocatoriasUniversidad)
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, convocatoriasUniversidad.periodoAcademicoId))
}

function processTx(executor: Executor): ProcessTx {
  return {
    async lockProcess(id) {
      const [row] = await executor
        .select({ state: convocatoriasUniversidad.estadoConvocatoriaUniversidad })
        .from(convocatoriasUniversidad)
        .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, id))
        .limit(1)
        .for("update")
      return row?.state ?? null
    },
    async pause(id) {
      const process = eq(convocatoriasUniversidad.convocatoriaUniversidadId, id)
      await executor.update(convocatoriasUniversidad).set({ estadoConvocatoriaUniversidad: "pausado" }).where(process)
      await executor.update(convocatoriasUniversidad).set({ pausadoEn: sql`clock_timestamp()` }).where(process)
    },
    async lockInProgress() {
      const [row] = await executor
        .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId, periodId: convocatoriasUniversidad.periodoAcademicoId })
        .from(convocatoriasUniversidad)
        .where(inArray(convocatoriasUniversidad.estadoConvocatoriaUniversidad, ["abierto", "pausado"]))
        .limit(1)
        .for("update")
      if (!row) return null
      const [period] = await executor
        .select({ code: periodosAcademicos.codigoPeriodoAcademico })
        .from(periodosAcademicos)
        .where(eq(periodosAcademicos.periodoAcademicoId, row.periodId))
        .limit(1)
      return { id: row.id, period: period?.code ?? null }
    },
    periodHasProcess: (periodId) =>
      hasRows(
        executor
          .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
          .from(convocatoriasUniversidad)
          .where(eq(convocatoriasUniversidad.periodoAcademicoId, periodId))
          .limit(1),
      ),
    async createProcess(periodId, startsAt, dueAt) {
      const id = uuid7()
      await executor.insert(convocatoriasUniversidad).values({
        periodoAcademicoId: periodId,
        fechaInicio: startsAt,
        fechaEntrega: dueAt,
        estadoConvocatoriaUniversidad: "abierto",
        convocatoriaUniversidadId: id,
      })
      return id
    },
  }
}

export function processRepositoryOn(executor: Executor, transaction: <T>(work: (tx: ProcessTx) => Promise<T>) => Promise<T>): ProcessRepository {
  return {
    list: () => processes(executor).orderBy(desc(convocatoriasUniversidad.fechaInicio)),
    templateHasFields: (templateId) =>
      hasRows(
        executor
          .select({ id: definicionesCampo.definicionCampoId })
          .from(definicionesCampo)
          .where(and(eq(definicionesCampo.plantillaId, templateId), eq(definicionesCampo.vigenteEnPlantilla, true)))
          .limit(1),
      ),
    periods: () =>
      executor
        .select({ id: periodosAcademicos.periodoAcademicoId, codigo: periodosAcademicos.codigoPeriodoAcademico })
        .from(periodosAcademicos)
        .orderBy(desc(periodosAcademicos.fechaInicioPeriodo)),
    async find(id) {
      const [row] = await processes(executor).where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, id)).limit(1)
      return row ?? null
    },
    counts: (processId) =>
      executor
        .select({ state: silabos.estadoSilabo, total: count() })
        .from(silabos)
        .innerJoin(convocatoriasCarreras, eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId))
        .where(eq(convocatoriasCarreras.convocatoriaUniversidadId, processId))
        .groupBy(silabos.estadoSilabo),
    async periodEndsOn(periodId) {
      const [row] = await executor
        .select({ endsOn: periodosAcademicos.fechaFinPeriodo })
        .from(periodosAcademicos)
        .where(eq(periodosAcademicos.periodoAcademicoId, periodId))
        .limit(1)
      return row?.endsOn ?? null
    },
    activeCareerCount: () => executor.$count(carreras, eq(carreras.carreraActiva, true)),
    activeCareersWithoutCoordinator: () =>
      executor.$count(
        carreras,
        and(
          eq(carreras.carreraActiva, true),
          notExists(
            executor
              .select({ id: asignacionesRol.asignacionRolId })
              .from(asignacionesRol)
              .where(and(eq(asignacionesRol.carreraId, carreras.carreraId), eq(asignacionesRol.rol, "coordinador"), eq(asignacionesRol.asignacionRolActiva, true))),
          ),
        ),
      ),
    transaction,
  }
}

export function createProcessRepository(): ProcessRepository {
  return processRepositoryOn(db, (work) => db.transaction((tx) => work(processTx(tx))))
}

export { processTx }
