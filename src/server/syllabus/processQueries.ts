import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { institutionDateSql } from "../laravel/sql"
import { insertAuditEvent } from "../operations/recordAuditEvent"
import type { ProcessRepository, ProcessRow, ProcessTx } from "./processes"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

type Row = { id: string; state: string; period: string; period_id: string; period_ends_on: string; starts_on: string; due_on: string; convocations_count: string; extensions: number }

const PROCESS_COLUMNS = sql`proceso.convocatoria_universidad_id::text as id, proceso.estado_convocatoria_universidad as state, periodo.codigo_periodo_academico as period,
  proceso.periodo_academico_id::text as period_id, to_char(periodo.fecha_fin_periodo, 'YYYY-MM-DD') as period_ends_on,
  ${institutionDateSql(sql.raw("proceso.fecha_inicio"))} as starts_on, ${institutionDateSql(sql.raw("proceso.fecha_entrega"))} as due_on,
  (select count(*) from convocatorias_carreras where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
    and exists (select 1 from convocatorias_universidad vigente where vigente.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)) as convocations_count,
  proceso.cantidad_prorrogas as extensions`

function toProcess(row: Row): ProcessRow {
  return {
    id: row.id,
    state: row.state,
    period: row.period,
    periodId: row.period_id,
    periodEndsOn: row.period_ends_on,
    startsOn: row.starts_on,
    dueOn: row.due_on,
    convocationsCount: Number(row.convocations_count),
    extensions: Number(row.extensions),
  }
}

function processTx(executor: Executor): ProcessTx {
  return {
    async lockProcess(id) {
      const [row] = await rowsOf<{ state: string }>(
        executor,
        sql`select estado_convocatoria_universidad as state from convocatorias_universidad where convocatoria_universidad_id = ${id}::uuid limit 1 for update`,
      )
      return row?.state ?? null
    },
    async pause(id) {
      await executor.execute(sql`update convocatorias_universidad set estado_convocatoria_universidad = 'pausado' where convocatoria_universidad_id = ${id}::uuid`)
      await executor.execute(sql`update convocatorias_universidad set pausado_en = clock_timestamp() where convocatoria_universidad_id = ${id}::uuid`)
    },
    async recordAudit(event) {
      await insertAuditEvent(executor, event)
    },
  }
}

export function processRepositoryOn(executor: Executor, transaction: <T>(work: (tx: ProcessTx) => Promise<T>) => Promise<T>): ProcessRepository {
  return {
    async list() {
      const found = await rowsOf<Row>(
        executor,
        sql`select ${PROCESS_COLUMNS} from convocatorias_universidad proceso
          inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
          order by proceso.fecha_inicio desc`,
      )
      return found.map(toProcess)
    },
    async templateHasFields(templateId) {
      const [row] = await rowsOf<{ found: boolean }>(
        executor,
        sql`select exists (select 1 from definiciones_campo where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = true) as found`,
      )
      return row?.found === true
    },
    async periods() {
      return rowsOf<{ id: string; codigo: string }>(
        executor,
        sql`select periodo_academico_id::text as id, codigo_periodo_academico as codigo from periodos_academicos order by fecha_inicio_periodo desc`,
      )
    },
    async find(id) {
      const [row] = await rowsOf<Row>(
        executor,
        sql`select ${PROCESS_COLUMNS} from convocatorias_universidad proceso
          inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
          where proceso.convocatoria_universidad_id = ${id}::uuid limit 1`,
      )
      return row ? toProcess(row) : null
    },
    async counts(processId) {
      const found = await rowsOf<{ state: string; total: string }>(
        executor,
        sql`select silabos.estado_silabo as state, count(*) as total from silabos
          inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
          where convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid group by silabos.estado_silabo`,
      )
      return found.map((row) => ({ state: row.state, total: Number(row.total) }))
    },
    transaction,
  }
}

export function createProcessRepository(): ProcessRepository {
  return processRepositoryOn(db as unknown as Executor, (work) => db.transaction((tx) => work(processTx(tx as unknown as Executor))))
}

export { processTx }
