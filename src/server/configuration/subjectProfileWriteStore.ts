import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { phpJsonEncode } from "../laravel/phpJson"
import { uuid7 } from "../laravel/uuid7"
import { notificationScope, systemNow, type WriteOptions } from "../notifications/queries"
import { insertAuditEvent } from "../operations/recordAuditEvent"
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

export function subjectProfileTx(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): SubjectProfileTx {
  const work = new InProgressWork(executor, afterCommit, notificationScope(executor, afterCommit, now, options.mail))
  return {
    store: createTemplateStore(executor),
    async lockSubject(subjectId) {
      const [row] = await rowsOf<{ career_id: string }>(
        executor,
        sql`select carrera_id::text as career_id from asignaturas where asignatura_id = ${subjectId}::uuid limit 1 for update`,
      )
      return row ? { careerId: row.career_id } : null
    },
    careerLocked: (careerId) => careerDataLocked(executor, careerId),
    async deleteValue(subjectId, fieldId) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        sql`select valor_campo_id::text as id from valores_campo where asignatura_id = ${subjectId}::uuid and definicion_campo_id = ${fieldId}::uuid limit 1`,
      )
      if (row) await executor.execute(sql`delete from valores_campo where valor_campo_id = ${row.id}::uuid`)
    },
    async saveValue(subjectId, fieldId, document) {
      const encoded = phpJsonEncode(phpShape(document))
      const [row] = await rowsOf<{ id: string }>(
        executor,
        sql`select valor_campo_id::text as id from valores_campo where asignatura_id = ${subjectId}::uuid and definicion_campo_id = ${fieldId}::uuid limit 1`,
      )
      if (row) await executor.execute(sql`update valores_campo set valor_campo = ${encoded}::jsonb where valor_campo_id = ${row.id}::uuid`)
      else {
        await executor.execute(sql`insert into valores_campo (valor_campo_id, asignatura_id, definicion_campo_id, valor_campo)
          values (${uuid7()}::uuid, ${subjectId}::uuid, ${fieldId}::uuid, ${encoded}::jsonb)`)
      }
    },
    async recordAudit(event) {
      await insertAuditEvent(executor, event)
    },
    keepContent: (confirmed, careerId, subjectIds, change) => keepContent(work, confirmed, careerId, change, subjectIds),
  }
}

export function subjectProfileWriteDepsOn(
  executor: Executor,
  transaction: TransactionRunner,
  options: WriteOptions = {},
): Pick<SubjectProfileWriteDeps, "now" | "transaction" | "store"> {
  const now = options.now ?? systemNow
  return {
    now,
    store: createTemplateStore(executor),
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(subjectProfileTx(inner, afterCommit, now(), options)))),
  }
}

export function createSubjectProfileWriteDeps(): Pick<SubjectProfileWriteDeps, "now" | "transaction" | "store"> {
  return subjectProfileWriteDepsOn(db as unknown as Executor, dbTransaction)
}
