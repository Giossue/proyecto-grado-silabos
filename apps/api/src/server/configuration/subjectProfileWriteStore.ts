import { type Db, inTransactionAfterCommit } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { jsonbValue } from "../../prisma/sql"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../shared/clock"
import { createTemplateStore } from "../shared/templateStore"
import { notificationScope, type WriteOptions } from "../notifications/queries"
import type { AfterCommit } from "../queue/dispatch"
import { keepContent } from "../syllabus/finalizedChangeNotice"
import { InProgressWork } from "../syllabus/inProgressWork"
import { phpShape } from "./phpValues"
import type { SubjectProfileTx, SubjectProfileWriteDeps } from "./subjectProfileWrites"

export async function careerDataLocked(db: Db, careerId: string): Promise<boolean> {
  const [row] = await db.$queryRaw<{ locked: boolean }[]>`select exists (select 1 from convocatorias_carreras convocatoria where convocatoria.carrera_id = ${careerId}::uuid
        and convocatoria.estado_convocatoria_carrera = 'abierta'
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
          and proceso.estado_convocatoria_universidad in ('abierto', 'pausado'))) as locked`
  return row?.locked === true
}

async function subjectValue(db: Db, subjectId: string, fieldId: string): Promise<{ id: string } | undefined> {
  const [row] = await db.$queryRaw<{ id: string }[]>`select valor_campo_id::text as id from valores_campo
    where asignatura_id = ${subjectId}::uuid and definicion_campo_id = ${fieldId}::uuid limit 1`
  return row
}

export function subjectProfileTx(db: Db, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): SubjectProfileTx {
  const work = new InProgressWork(db, afterCommit, notificationScope(db, afterCommit, now, options.mail))
  return {
    store: createTemplateStore(db),
    async lockSubject(subjectId) {
      const [row] = await db.$queryRaw<{ careerId: string }[]>`select carrera_id::text as "careerId" from asignaturas where asignatura_id = ${subjectId}::uuid limit 1 for update`
      return row ? { careerId: row.careerId } : null
    },
    careerLocked: (careerId) => careerDataLocked(db, careerId),
    async deleteValue(subjectId, fieldId) {
      const row = await subjectValue(db, subjectId, fieldId)
      if (row) await db.$executeRaw`delete from valores_campo where valor_campo_id = ${row.id}::uuid`
    },
    async saveValue(subjectId, fieldId, document) {
      const encoded = JSON.stringify(phpShape(document))
      const row = await subjectValue(db, subjectId, fieldId)
      if (row) await db.$executeRaw`update valores_campo set valor_campo = ${jsonbValue(encoded)} where valor_campo_id = ${row.id}::uuid`
      else
        await db.$executeRaw`insert into valores_campo (valor_campo_id, asignatura_id, definicion_campo_id, valor_campo)
          values (${uuid7()}::uuid, ${subjectId}::uuid, ${fieldId}::uuid, ${jsonbValue(encoded)})`
    },
    keepContent: (confirmed, careerId, subjectIds, change) => keepContent(work, confirmed, careerId, change, subjectIds),
  }
}

export function subjectProfileWriteDepsOn(prisma: PrismaService, options: WriteOptions = {}): Pick<SubjectProfileWriteDeps, "transaction" | "store"> {
  const now = options.now ?? systemNow
  return {
    store: createTemplateStore(prisma),
    transaction: (work) => inTransactionAfterCommit(prisma, (tx, afterCommit) => work(subjectProfileTx(tx, afterCommit, now(), options))),
  }
}

export function createSubjectProfileWriteDeps(prisma: PrismaService): Pick<SubjectProfileWriteDeps, "transaction" | "store"> {
  return subjectProfileWriteDepsOn(prisma)
}
