import { and, asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { hasRows } from "@/db/expressions"
import { asignaturas, carreras, facultades } from "@/db/schema"
import { systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import { careerWriteTx, curriculumTx } from "./careerWriteStore"
import { governanceWriteDepsOn } from "./governanceWriteStore"
import type { StructureImportStore, StructureImportTransactions } from "./structureImports"

export function structureImportStoreOn(executor: Executor): StructureImportStore {
  const activeFaculties = () =>
    executor.select({ id: facultades.facultadId, name: facultades.nombreFacultad }).from(facultades).where(eq(facultades.facultadActiva, true))
  return {
    async activeFaculties() {
      const rows = await activeFaculties().orderBy(asc(facultades.nombreFacultad))
      return rows.map((row) => ({ id: row.id, name: String(row.name) }))
    },
    async facultiesForImport() {
      const rows = await activeFaculties()
      return rows.map((row) => ({ id: row.id, name: String(row.name) }))
    },
    async careerCodes() {
      const rows = await executor.select({ code: carreras.codigoCarrera }).from(carreras)
      return rows.map((row) => (row.code === null ? "" : String(row.code)))
    },
    careerActive: (careerId) =>
      hasRows(executor.select({ id: carreras.carreraId }).from(carreras).where(and(eq(carreras.carreraId, careerId), eq(carreras.carreraActiva, true))).limit(1)),
    async career(careerId) {
      const [row] = await executor.select({ id: carreras.carreraId, cycles: carreras.numeroCiclos }).from(carreras).where(eq(carreras.carreraId, careerId)).limit(1)
      return row ? { id: row.id, cycleCount: Number(row.cycles) } : null
    },
    async careerSubjects(careerId) {
      const rows = await executor
        .select({ id: asignaturas.asignaturaId, code: asignaturas.codigoAsignatura, cycle: asignaturas.cicloAsignatura })
        .from(asignaturas)
        .where(eq(asignaturas.carreraId, careerId))
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
