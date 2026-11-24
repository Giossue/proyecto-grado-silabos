import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import { careerWriteTx, curriculumTx } from "./careerWriteStore"
import { governanceWriteDepsOn } from "./governanceWriteStore"
import type { StructureImportStore, StructureImportTransactions } from "./structureImports"

export function structureImportStoreOn(executor: Executor): StructureImportStore {
  return {
    async activeFaculties() {
      const rows = await rowsOf<{ id: string; name: string }>(
        executor,
        sql`select facultad_id::text as id, nombre_facultad as name from facultades where facultad_activa = true order by nombre_facultad asc`,
      )
      return rows.map((row) => ({ id: row.id, name: String(row.name) }))
    },
    async facultiesForImport() {
      const rows = await rowsOf<{ id: string; name: string }>(executor, sql`select facultad_id::text as id, nombre_facultad as name from facultades where facultad_activa = true`)
      return rows.map((row) => ({ id: row.id, name: String(row.name) }))
    },
    async careerCodes() {
      const rows = await rowsOf<{ code: string | null }>(executor, sql`select codigo_carrera as code from carreras`)
      return rows.map((row) => (row.code === null ? "" : String(row.code)))
    },
    async careerActive(careerId) {
      const [row] = await rowsOf<{ found: boolean }>(executor, sql`select exists (select 1 from carreras where carrera_id = ${careerId}::uuid and carrera_activa = true) as found`)
      return row?.found === true
    },
    async career(careerId) {
      const [row] = await rowsOf<{ id: string; cycles: number }>(executor, sql`select carrera_id::text as id, numero_ciclos as cycles from carreras where carrera_id = ${careerId}::uuid limit 1`)
      return row ? { id: row.id, cycleCount: Number(row.cycles) } : null
    },
    async careerSubjects(careerId) {
      const rows = await rowsOf<{ id: string; code: string | null; cycle: number | null }>(
        executor,
        sql`select asignatura_id::text as id, codigo_asignatura as code, ciclo_asignatura as cycle from asignaturas where carrera_id = ${careerId}::uuid`,
      )
      return rows.map((row) => ({ id: row.id, code: row.code === null ? "" : String(row.code), cycle: row.cycle === null ? null : Number(row.cycle) }))
    },
  }
}

export function structureImportTransactionsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): StructureImportTransactions {
  const now = options.now ?? systemNow
  return {
    now,
    governance: governanceWriteDepsOn(executor, transaction, options).transaction,
    curriculum: (work) =>
      withAfterCommit((afterCommit) =>
        transaction((inner) => work({ subjects: careerWriteTx(inner, afterCommit, now(), options), requirements: curriculumTx(inner, afterCommit, now(), options) })),
      ),
  }
}

export function createStructureImportStore(): StructureImportStore {
  return structureImportStoreOn(db as unknown as Executor)
}

export function createStructureImportTransactions(): StructureImportTransactions {
  return structureImportTransactionsOn(db as unknown as Executor, dbTransaction)
}
