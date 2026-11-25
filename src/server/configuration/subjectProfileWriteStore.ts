import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { jsonbValue } from "@/db/expressions"
import { asignaturas, valoresCampo } from "@/db/schema"
import { phpJsonEncode } from "../http/phpJson"
import { uuid7 } from "../http/uuid7"
import { notificationScope, systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { keepContent } from "../syllabus/finalizedChangeNotice"
import { InProgressWork } from "../syllabus/inProgressWork"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import { phpShape } from "./phpValues"
import type { SubjectProfileTx, SubjectProfileWriteDeps } from "./subjectProfileWrites"
import { createTemplateStore } from "./templateStore"

export async function careerDataLocked(executor: Executor, careerId: string): Promise<boolean> {
  const [row] = await rowsOf<{ locked: boolean }>(
    executor,
    sql`select exists (select 1 from convocatorias_carreras convocatoria where convocatoria.carrera_id = ${careerId}::uuid
        and convocatoria.estado_convocatoria_carrera = 'abierta'
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
          and proceso.estado_convocatoria_universidad in ('abierto', 'pausado'))) as locked`,
  )
  return row?.locked === true
}

async function subjectValue(executor: Executor, subjectId: string, fieldId: string) {
  const [row] = await executor
    .select({ id: valoresCampo.valorCampoId })
    .from(valoresCampo)
    .where(and(eq(valoresCampo.asignaturaId, subjectId), eq(valoresCampo.definicionCampoId, fieldId)))
    .limit(1)
  return row
}

export function subjectProfileTx(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): SubjectProfileTx {
  const work = new InProgressWork(executor, afterCommit, notificationScope(executor, afterCommit, now, options.mail))
  return {
    store: createTemplateStore(executor),
    async lockSubject(subjectId) {
      const [row] = await executor.select({ careerId: asignaturas.carreraId }).from(asignaturas).where(eq(asignaturas.asignaturaId, subjectId)).limit(1).for("update")
      return row ? { careerId: row.careerId } : null
    },
    careerLocked: (careerId) => careerDataLocked(executor, careerId),
    async deleteValue(subjectId, fieldId) {
      const row = await subjectValue(executor, subjectId, fieldId)
      if (row) await executor.delete(valoresCampo).where(eq(valoresCampo.valorCampoId, row.id))
    },
    async saveValue(subjectId, fieldId, document) {
      const encoded = phpJsonEncode(phpShape(document))
      const row = await subjectValue(executor, subjectId, fieldId)
      if (row) await executor.update(valoresCampo).set({ valorCampo: jsonbValue(encoded) }).where(eq(valoresCampo.valorCampoId, row.id))
      else await executor.insert(valoresCampo).values({ valorCampoId: uuid7(), asignaturaId: subjectId, definicionCampoId: fieldId, valorCampo: jsonbValue(encoded) })
    },
    keepContent: (confirmed, careerId, subjectIds, change) => keepContent(work, confirmed, careerId, change, subjectIds),
  }
}

export function subjectProfileWriteDepsOn(
  executor: Executor,
  transaction: TransactionRunner,
  options: WriteOptions = {},
): Pick<SubjectProfileWriteDeps, "transaction" | "store"> {
  const now = options.now ?? systemNow
  return {
    store: createTemplateStore(executor),
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(subjectProfileTx(inner, afterCommit, now(), options)))),
  }
}

export function createSubjectProfileWriteDeps(): Pick<SubjectProfileWriteDeps, "transaction" | "store"> {
  return subjectProfileWriteDepsOn(db as unknown as Executor, dbTransaction)
}
