import { and, asc, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { jsonText } from "@/db/expressions"
import { asignaturas, carreras, valoresCampo } from "@/db/schema"
import { phpJsonDecode } from "../configuration/phpValues"
import { careerDataLocked, subjectProfileTx } from "../configuration/subjectProfileWriteStore"
import { createTemplateStore } from "../configuration/templateStore"
import { systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { FichaApplyTx, FichaImportDeps, FichaImportStore, FichaReader } from "./fichaImports"

export function fichaReaderOn(executor: Executor): FichaReader {
  return {
    store: createTemplateStore(executor),
    async activeCareer(careerId) {
      const [row] = await executor
        .select({ id: carreras.carreraId, name: carreras.nombreCarrera })
        .from(carreras)
        .where(and(eq(carreras.carreraActiva, true), eq(carreras.carreraId, careerId)))
        .limit(1)
      return row ?? null
    },
    async subjects(careerId) {
      const rows = await executor
        .select({ id: asignaturas.asignaturaId, code: asignaturas.codigoAsignatura, name: asignaturas.nombreAsignatura, cycle: asignaturas.cicloAsignatura })
        .from(asignaturas)
        .where(and(eq(asignaturas.carreraId, careerId), eq(asignaturas.asignaturaActiva, true), eq(asignaturas.generaSilaboAsignatura, true)))
        .orderBy(asc(asignaturas.cicloAsignatura), asc(asignaturas.ordenAsignaturaEnCiclo), asc(asignaturas.codigoAsignatura), asc(asignaturas.asignaturaId))
      return rows.map((row) => ({ id: row.id, code: row.code, name: row.name, cycle: row.cycle === null ? null : Number(row.cycle) }))
    },
  }
}

export function fichaImportStoreOn(executor: Executor): FichaImportStore {
  return {
    ...fichaReaderOn(executor),
    async careerActive(careerId) {
      const [row] = await executor.select({ active: carreras.carreraActiva }).from(carreras).where(eq(carreras.carreraId, careerId)).limit(1)
      return row?.active === true
    },
    careerLocked: (careerId) => careerDataLocked(executor, careerId),
    async currentValues(subjectIds, fieldIds) {
      if (subjectIds.length === 0 || fieldIds.length === 0) return []
      const rows = await executor
        .select({ subjectId: valoresCampo.asignaturaId, fieldId: valoresCampo.definicionCampoId, value: jsonText(valoresCampo.valorCampo) })
        .from(valoresCampo)
        .where(and(inArray(valoresCampo.asignaturaId, subjectIds), inArray(valoresCampo.definicionCampoId, fieldIds)))
      return rows.map((row) => ({ subjectId: row.subjectId ?? "", fieldId: row.fieldId, value: phpJsonDecode(row.value) }))
    },
  }
}

function fichaApplyTx(executor: Executor, afterCommit: Parameters<typeof subjectProfileTx>[1], now: number, options: WriteOptions): FichaApplyTx {
  const profile = subjectProfileTx(executor, afterCommit, now, options)
  return {
    ...fichaReaderOn(executor),
    async lockCareer(careerId) {
      await executor.select().from(carreras).where(eq(carreras.carreraId, careerId)).limit(1).for("update")
    },
    careerLocked: profile.careerLocked,
    async storedValue(subjectId, fieldId) {
      const [row] = await executor
        .select({ value: jsonText(valoresCampo.valorCampo) })
        .from(valoresCampo)
        .where(and(eq(valoresCampo.asignaturaId, subjectId), eq(valoresCampo.definicionCampoId, fieldId)))
        .limit(1)
      return row === undefined ? null : phpJsonDecode(row.value)
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
  return fichaImportDepsOn(db, dbTransaction)
}
