import "server-only"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { convocatoriasUniversidad, periodosAcademicos } from "@/db/schema"
import { institutionDateSql } from "../http/sql"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { TemplateLock, TemplateLockStore } from "./templateBuilder"

export function createTemplateLockStore(executor: Executor = db as unknown as Executor): TemplateLockStore {
  return {
    async processLock(): Promise<TemplateLock | null> {
      const [row] = await executor
        .select({ period: periodosAcademicos.codigoPeriodoAcademico, deliveryOn: institutionDateSql(sql`${convocatoriasUniversidad.fechaEntrega}`).mapWith(String) })
        .from(convocatoriasUniversidad)
        .leftJoin(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, convocatoriasUniversidad.periodoAcademicoId))
        .where(eq(convocatoriasUniversidad.estadoConvocatoriaUniversidad, "abierto"))
        .limit(1)
      return row === undefined ? null : { period: row.period, deliveryOn: row.deliveryOn }
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
