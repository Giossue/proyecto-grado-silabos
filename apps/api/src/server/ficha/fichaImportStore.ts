import { type Db, inTransactionAfterCommit } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { uuidList } from "../../prisma/sql"
import { phpJsonDecode } from "../configuration/phpValues"
import { careerDataLocked, subjectProfileTx } from "../configuration/subjectProfileWriteStore"
import { createTemplateStore } from "../shared/templateStore"
import { systemNow } from "../shared/clock"
import type { WriteOptions } from "../notifications/queries"
import type { AfterCommit } from "../queue/afterCommit"
import type { FichaApplyTx, FichaImportDeps, FichaImportStore, FichaReader } from "./fichaImports"

export function fichaReader(db: Db): FichaReader {
  return {
    store: createTemplateStore(db),
    async activeCareer(careerId) {
      const row = await db.carreras.findFirst({ where: { carrera_activa: true, carrera_id: careerId }, select: { carrera_id: true, nombre_carrera: true } })
      return row ? { id: row.carrera_id, name: row.nombre_carrera } : null
    },
    async subjects(careerId) {
      const rows = await db.asignaturas.findMany({
        where: { carrera_id: careerId, asignatura_activa: true, genera_silabo_asignatura: true },
        select: { asignatura_id: true, codigo_asignatura: true, nombre_asignatura: true, ciclo_asignatura: true },
        orderBy: [{ ciclo_asignatura: "asc" }, { orden_asignatura_en_ciclo: "asc" }, { codigo_asignatura: "asc" }, { asignatura_id: "asc" }],
      })
      return rows.map((row) => ({ id: row.asignatura_id, code: row.codigo_asignatura, name: row.nombre_asignatura, cycle: row.ciclo_asignatura }))
    },
  }
}

export function fichaImportStore(db: Db): FichaImportStore {
  return {
    ...fichaReader(db),
    async careerActive(careerId) {
      const row = await db.carreras.findFirst({ where: { carrera_id: careerId }, select: { carrera_activa: true } })
      return row?.carrera_activa === true
    },
    careerLocked: (careerId) => careerDataLocked(db, careerId),
    async currentValues(subjectIds, fieldIds) {
      if (subjectIds.length === 0 || fieldIds.length === 0) return []
      const rows = await db.$queryRaw<{ subject_id: string | null; field_id: string; value: string | null }[]>`select valores_campo.asignatura_id::text as subject_id,
          valores_campo.definicion_campo_id::text as field_id, valores_campo.valor_campo::text as value
        from valores_campo where valores_campo.asignatura_id in (${uuidList(subjectIds)}) and valores_campo.definicion_campo_id in (${uuidList(fieldIds)})`
      return rows.map((row) => ({ subjectId: row.subject_id ?? "", fieldId: row.field_id, value: phpJsonDecode(row.value) }))
    },
  }
}

function fichaApplyTx(db: Db, afterCommit: AfterCommit, now: number, options: WriteOptions): FichaApplyTx {
  const profile = subjectProfileTx(db, afterCommit, now, options)
  return {
    ...fichaReader(db),
    async lockCareer(careerId) {
      await db.$queryRaw`select carreras.carrera_id from carreras where carreras.carrera_id = ${careerId}::uuid limit 1 for update`
    },
    careerLocked: profile.careerLocked,
    async storedValue(subjectId, fieldId) {
      const [row] = await db.$queryRaw<{ value: string | null }[]>`select valores_campo.valor_campo::text as value from valores_campo
        where valores_campo.asignatura_id = ${subjectId}::uuid and valores_campo.definicion_campo_id = ${fieldId}::uuid limit 1`
      return row === undefined ? null : phpJsonDecode(row.value)
    },
    saveValue: profile.saveValue,
    keepContent: profile.keepContent,
  }
}

export function createFichaImportDeps(prisma: PrismaService, options: WriteOptions = {}): Pick<FichaImportDeps, "store" | "now" | "transaction"> {
  const now = options.now ?? systemNow
  return {
    store: fichaImportStore(prisma),
    now,
    transaction: (work) => inTransactionAfterCommit(prisma, (tx, afterCommit) => work(fichaApplyTx(tx, afterCommit, now(), options))),
  }
}
