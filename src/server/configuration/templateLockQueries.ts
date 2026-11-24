import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { institutionDateSql } from "../laravel/sql"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { TemplateLock, TemplateLockStore } from "./templateBuilder"

export function createTemplateLockStore(executor: Executor = db as unknown as Executor): TemplateLockStore {
  return {
    async processLock(): Promise<TemplateLock | null> {
      const [row] = await rowsOf<{ period: string | null; delivery_on: string | null }>(
        executor,
        sql`select periodo.codigo_periodo_academico as period, ${institutionDateSql(sql.raw("proceso.fecha_entrega"))} as delivery_on
          from (select periodo_academico_id, fecha_entrega from convocatorias_universidad where estado_convocatoria_universidad = 'abierto' limit 1) proceso
          left join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id`,
      )
      return row === undefined ? null : { period: row.period, deliveryOn: row.delivery_on }
    },
    async changedDuringPause(templateId: string): Promise<boolean> {
      const [row] = await rowsOf<{ changed: boolean }>(
        executor,
        sql`select coalesce(
            (select plantilla_modificada_en from plantilla_silabo where plantilla_id = ${templateId}::uuid)
              > (select pausado_en from convocatorias_universidad where estado_convocatoria_universidad = 'pausado' limit 1),
            false) as changed`,
      )
      return row?.changed === true
    },
  }
}
