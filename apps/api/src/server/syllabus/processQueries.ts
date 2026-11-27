import { Prisma } from "../../generated/prisma/client"
import { inTransaction, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { hasRows, institutionDateSql } from "../../prisma/sql"
import { uuid7 } from "../http/uuid7"
import type { ProcessRepository, ProcessRow, ProcessTx } from "./processes"
import { rowsOf } from "./teacherSyllabusQueries"

const PROCESS_COLUMNS = Prisma.sql`convocatorias_universidad.convocatoria_universidad_id::text as id, convocatorias_universidad.estado_convocatoria_universidad as state,
  periodos_academicos.codigo_periodo_academico as period, convocatorias_universidad.periodo_academico_id::text as "periodId",
  periodos_academicos.fecha_fin_periodo::text as "periodEndsOn",
  ${institutionDateSql(Prisma.raw("convocatorias_universidad.fecha_inicio"))} as "startsOn",
  ${institutionDateSql(Prisma.raw("convocatorias_universidad.fecha_entrega"))} as "dueOn",
  ((select count(*) from convocatorias_carreras where convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
    and exists (select 1 from convocatorias_universidad vigente where vigente.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)))::int as "convocationsCount",
  convocatorias_universidad.cantidad_prorrogas as extensions`

function processes(executor: Db, tail: Prisma.Sql): Promise<ProcessRow[]> {
  return rowsOf<ProcessRow>(
    executor,
    Prisma.sql`select ${PROCESS_COLUMNS} from convocatorias_universidad
      inner join periodos_academicos on periodos_academicos.periodo_academico_id = convocatorias_universidad.periodo_academico_id ${tail}`,
  )
}

function processTx(executor: Db): ProcessTx {
  return {
    async lockProcess(id) {
      const [row] = await rowsOf<{ state: string }>(
        executor,
        Prisma.sql`select convocatorias_universidad.estado_convocatoria_universidad as state from convocatorias_universidad
          where convocatorias_universidad.convocatoria_universidad_id = ${id}::uuid limit 1 for update`,
      )
      return row?.state ?? null
    },
    async pause(id) {
      await executor.$executeRaw`update convocatorias_universidad set estado_convocatoria_universidad = ${"pausado"} where convocatorias_universidad.convocatoria_universidad_id = ${id}::uuid`
      await executor.$executeRaw`update convocatorias_universidad set pausado_en = clock_timestamp() where convocatorias_universidad.convocatoria_universidad_id = ${id}::uuid`
    },
    async lockInProgress() {
      const [row] = await rowsOf<{ id: string; periodId: string }>(
        executor,
        Prisma.sql`select convocatorias_universidad.convocatoria_universidad_id::text as id, convocatorias_universidad.periodo_academico_id::text as "periodId"
          from convocatorias_universidad where convocatorias_universidad.estado_convocatoria_universidad in (${"abierto"}, ${"pausado"}) limit 1 for update`,
      )
      if (!row) return null
      const [period] = await rowsOf<{ code: string }>(
        executor,
        Prisma.sql`select periodos_academicos.codigo_periodo_academico as code from periodos_academicos where periodos_academicos.periodo_academico_id = ${row.periodId}::uuid limit 1`,
      )
      return { id: row.id, period: period?.code ?? null }
    },
    periodHasProcess: (periodId) =>
      hasRows(
        rowsOf(
          executor,
          Prisma.sql`select convocatorias_universidad.convocatoria_universidad_id from convocatorias_universidad
            where convocatorias_universidad.periodo_academico_id = ${periodId}::uuid limit 1`,
        ),
      ),
    async createProcess(periodId, startsAt, dueAt) {
      const id = uuid7()
      await executor.$executeRaw`insert into convocatorias_universidad (convocatoria_universidad_id, fecha_inicio, fecha_entrega, estado_convocatoria_universidad, periodo_academico_id)
        values (${id}::uuid, ${startsAt}::timestamptz, ${dueAt}::timestamptz, ${"abierto"}, ${periodId}::uuid)`
      return id
    },
  }
}

export function processRepositoryOn(executor: Db, transaction: <T>(work: (tx: ProcessTx) => Promise<T>) => Promise<T>): ProcessRepository {
  return {
    list: () => processes(executor, Prisma.sql`order by convocatorias_universidad.fecha_inicio desc`),
    templateHasFields: (templateId) =>
      hasRows(
        rowsOf(
          executor,
          Prisma.sql`select definiciones_campo.definicion_campo_id from definiciones_campo
            where (definiciones_campo.plantilla_id = ${templateId}::uuid and definiciones_campo.vigente_en_plantilla = true) limit 1`,
        ),
      ),
    periods: () =>
      rowsOf<{ id: string; codigo: string }>(
        executor,
        Prisma.sql`select periodos_academicos.periodo_academico_id::text as id, periodos_academicos.codigo_periodo_academico as codigo
          from periodos_academicos order by periodos_academicos.fecha_inicio_periodo desc`,
      ),
    async find(id) {
      const [row] = await processes(executor, Prisma.sql`where convocatorias_universidad.convocatoria_universidad_id = ${id}::uuid limit 1`)
      return row ?? null
    },
    counts: (processId) =>
      rowsOf<{ state: string; total: number }>(
        executor,
        Prisma.sql`select silabos.estado_silabo as state, count(*)::int as total from silabos
          inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
          where convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid group by silabos.estado_silabo`,
      ),
    async periodEndsOn(periodId) {
      const [row] = await rowsOf<{ endsOn: string }>(
        executor,
        Prisma.sql`select periodos_academicos.fecha_fin_periodo::text as "endsOn" from periodos_academicos where periodos_academicos.periodo_academico_id = ${periodId}::uuid limit 1`,
      )
      return row?.endsOn ?? null
    },
    transaction,
  }
}

export function createProcessRepository(prisma: PrismaService): ProcessRepository {
  return processRepositoryOn(prisma, (work) => inTransaction(prisma, (tx) => work(processTx(tx))))
}

export { processTx }
