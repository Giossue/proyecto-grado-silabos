import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { phpJsonDecode } from "../configuration/phpValues"
import { careerDataLocked, subjectProfileTx } from "../configuration/subjectProfileWriteStore"
import { createTemplateStore } from "../configuration/templateStore"
import { systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { FichaApplyTx, FichaImportDeps, FichaImportStore, FichaReader } from "./fichaImports"

function uuidList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

export function fichaReaderOn(executor: Executor): FichaReader {
  return {
    store: createTemplateStore(executor),
    async activeCareer(careerId) {
      const [row] = await rowsOf<{ id: string; name: string }>(
        executor,
        sql`select carrera_id::text as id, nombre_carrera as name from carreras where carrera_activa = true and carrera_id = ${careerId}::uuid limit 1`,
      )
      return row ?? null
    },
    async subjects(careerId) {
      const rows = await rowsOf<{ id: string; code: string; name: string; cycle: number | null }>(
        executor,
        sql`select asignatura_id::text as id, codigo_asignatura as code, nombre_asignatura as name, ciclo_asignatura as cycle
          from asignaturas where carrera_id = ${careerId}::uuid and asignatura_activa = true and genera_silabo_asignatura = true
          order by ciclo_asignatura asc, orden_asignatura_en_ciclo asc, codigo_asignatura asc, asignatura_id asc`,
      )
      return rows.map((row) => ({ id: row.id, code: row.code, name: row.name, cycle: row.cycle === null ? null : Number(row.cycle) }))
    },
  }
}

export function fichaImportStoreOn(executor: Executor): FichaImportStore {
  return {
    ...fichaReaderOn(executor),
    async careerActive(careerId) {
      const [row] = await rowsOf<{ active: boolean }>(executor, sql`select carrera_activa as active from carreras where carrera_id = ${careerId}::uuid limit 1`)
      return row?.active === true
    },
    careerLocked: (careerId) => careerDataLocked(executor, careerId),
    async currentValues(subjectIds, fieldIds) {
      if (subjectIds.length === 0 || fieldIds.length === 0) return []
      const rows = await rowsOf<{ asignatura_id: string | null; definicion_campo_id: string; valor_campo: string | null }>(
        executor,
        sql`select asignatura_id::text as asignatura_id, definicion_campo_id::text as definicion_campo_id, valor_campo::text as valor_campo
          from valores_campo where asignatura_id in (${uuidList(subjectIds)}) and definicion_campo_id in (${uuidList(fieldIds)})`,
      )
      return rows.map((row) => ({ subjectId: row.asignatura_id ?? "", fieldId: row.definicion_campo_id, value: phpJsonDecode(row.valor_campo) }))
    },
  }
}

function fichaApplyTx(executor: Executor, afterCommit: Parameters<typeof subjectProfileTx>[1], now: number, options: WriteOptions): FichaApplyTx {
  const profile = subjectProfileTx(executor, afterCommit, now, options)
  return {
    ...fichaReaderOn(executor),
    async lockCareer(careerId) {
      await executor.execute(sql`select * from carreras where carrera_id = ${careerId}::uuid limit 1 for update`)
    },
    careerLocked: profile.careerLocked,
    async storedValue(subjectId, fieldId) {
      const [row] = await rowsOf<{ valor_campo: string | null }>(
        executor,
        sql`select valor_campo::text as valor_campo from valores_campo where asignatura_id = ${subjectId}::uuid and definicion_campo_id = ${fieldId}::uuid limit 1`,
      )
      return row === undefined ? null : phpJsonDecode(row.valor_campo)
    },
    saveValue: profile.saveValue,
    keepContent: profile.keepContent,
  }
}

export function fichaImportDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Pick<FichaImportDeps, "store" | "now" | "transaction"> {
  const now = options.now ?? systemNow
  return {
    store: fichaImportStoreOn(executor),
    now,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(fichaApplyTx(inner, afterCommit, now(), options)))),
  }
}

export function createFichaImportDeps(): Pick<FichaImportDeps, "store" | "now" | "transaction"> {
  return fichaImportDepsOn(db as unknown as Executor, dbTransaction)
}
