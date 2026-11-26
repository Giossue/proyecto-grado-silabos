import { Prisma } from "../../generated/prisma/client"
import { inTransaction, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch } from "../../prisma/sql"
import { systemNow } from "../shared/clock"
import { notificationScope, recipientsOn, type Mail, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import type { ReviewDecisionDeps, ReviewDecisionTx } from "./reviewDecisions"
import { reviewDetailStoreOn } from "./reviewDetailQueries"
import { InProgressWork } from "./inProgressWork"
import { rowsOf } from "./teacherSyllabusQueries"

const CLOSED = "La convocatoria está cerrada: la revisión queda solo para consulta y no admite decisiones."
const SYLLABUS_ALIVE = Prisma.sql`exists (select 1 from convocatorias_carreras vivo where vivo.convocatoria_carrera_id = silabos.convocatoria_carrera_id
  and exists (select 1 from convocatorias_universidad vivo_proceso where vivo_proceso.convocatoria_universidad_id = vivo.convocatoria_universidad_id))`
const REVISION_ALIVE = Prisma.sql`exists (select 1 from silabos where silabos.silabo_id = revisiones_silabo.silabo_id and ${SYLLABUS_ALIVE})`

export async function lockedDecisionBlock(executor: Db, syllabusId: string, lock = true): Promise<string | null> {
  const [convocation] = await rowsOf<{ id: string; process_id: string }>(
    executor,
    Prisma.sql`select convocatoria.convocatoria_carrera_id::text as id, convocatoria.convocatoria_universidad_id::text as process_id
      from silabos inner join convocatorias_carreras convocatoria on convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id
      where silabos.silabo_id = ${syllabusId}::uuid
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id)
      limit 1`,
  )
  if (!convocation) return CLOSED
  if (lock) {
    await executor.$queryRaw`select convocatoria_universidad_id from convocatorias_universidad where convocatoria_universidad_id = ${convocation.process_id}::uuid limit 1 for share`
  }
  const [state] = await rowsOf<{ state: string; process_state: string }>(
    executor,
    Prisma.sql`select convocatoria.estado_convocatoria_carrera as state,
        (select proceso.estado_convocatoria_universidad from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id) as process_state
      from convocatorias_carreras convocatoria where convocatoria.convocatoria_carrera_id = ${convocation.id}::uuid
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id)
      limit 1 ${lock ? Prisma.sql`for share of convocatoria` : Prisma.empty}`,
  )
  if (!state || !["abierta", "pausada"].includes(state.state)) return CLOSED
  if (state.state === "pausada") return "La convocatoria de la carrera está en pausa: las revisiones se retoman cuando se reanude."
  if (state.process_state === "pausado") return "Administración pausó la convocatoria institucional: las revisiones se retoman cuando se reanude."
  return null
}

export function reviewDecisionTx(executor: Db, afterCommit: AfterCommit, now: number, mail?: Mail): ReviewDecisionTx {
  const recipients = recipientsOn(executor)
  const work = new InProgressWork(executor, afterCommit)
  return {
    notifications: notificationScope(executor, afterCommit, now, mail),
    teachersFor: (syllabusId) => recipients.teachersFor(syllabusId),
    lockedDecisionBlock: (syllabusId) => lockedDecisionBlock(executor, syllabusId),
    decisionBlock: (syllabusId) => lockedDecisionBlock(executor, syllabusId, false),
    restartSyllabus: (syllabus) => work.restartSyllabus(syllabus),
    async lockSyllabus(id) {
      const [row] = await rowsOf<{ id: string; state: string; version: number; convocationId: string; parallelId: string }>(
        executor,
        Prisma.sql`select "silabo_id"::text as id, "estado_silabo" as state, "version_borrador" as version, "convocatoria_carrera_id"::text as "convocationId", "paralelo_id"::text as "parallelId"
        from "silabos" where ("silabos"."silabo_id" = ${id}::uuid and ${SYLLABUS_ALIVE}) limit 1 for update of "silabos"`,
      )
      return row ? { id: row.id, state: row.state, version: Number(row.version), convocationId: row.convocationId, parallelId: row.parallelId } : null
    },
    async latestRevisionId(syllabusId) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        Prisma.sql`select "revision_silabo_id"::text as id from "revisiones_silabo"
        where ("revisiones_silabo"."silabo_id" = ${syllabusId}::uuid and ${REVISION_ALIVE}) order by "revisiones_silabo"."numero_revision" desc limit 1`,
      )
      return row?.id ?? null
    },
    async lockRevision(id) {
      const [row] = await rowsOf<{ id: string; number: number; requested: boolean }>(
        executor,
        Prisma.sql`select "revision_silabo_id"::text as id, "numero_revision" as number, "correccion_solicitada_en" is not null as requested
        from "revisiones_silabo" where ("revisiones_silabo"."revision_silabo_id" = ${id}::uuid and ${REVISION_ALIVE}) limit 1 for update of "revisiones_silabo"`,
      )
      return row ? { id: row.id, number: Number(row.number), correctionRequested: Boolean(row.requested) } : null
    },
    async revisionStage(id) {
      const [row] = await rowsOf<{ approved: boolean; verified: boolean }>(
        executor,
        Prisma.sql`select exists (select 1 from aprobaciones where revision_silabo_id = ${id}::uuid) as approved,
          exists (select 1 from envios_biblioteca where revision_silabo_id = ${id}::uuid and verificado_en is not null) as verified`,
      )
      if (row.approved) return null
      return row.verified ? "coordinacion" : "biblioteca"
    },
    async requestCorrection(revisionId, justification, stage, actorId, at) {
      await executor.$executeRaw`update "revisiones_silabo" set "correccion_justificacion" = ${justification}, "correccion_etapa" = ${stage},
        "correccion_solicitada_por" = ${actorId}::uuid, "correccion_solicitada_en" = ${fromEpoch(at)}
        where "revisiones_silabo"."revision_silabo_id" = ${revisionId}::uuid`
    },
    async markCorrectionRequested(syllabusId, version, at) {
      await executor.$executeRaw`update "silabos" set "estado_silabo" = 'correccion_solicitada', "version_borrador" = ${version}, "guardado_en" = ${fromEpoch(at)}
        where "silabos"."silabo_id" = ${syllabusId}::uuid`
    },
  }
}

export type TransactionRunner = <T>(work: (executor: Db) => Promise<T>) => Promise<T>

export function dbTransaction(prisma: PrismaService): TransactionRunner {
  return (work) => inTransaction(prisma, work)
}

export function reviewDecisionDepsOn(executor: Db, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ReviewDecisionDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    store: reviewDetailStoreOn(executor),
    now,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(reviewDecisionTx(inner, afterCommit, now(), options.mail)))),
  }
}

export function createReviewDecisionDeps(prisma: PrismaService): Omit<ReviewDecisionDeps, "bridge"> {
  return reviewDecisionDepsOn(prisma, dbTransaction(prisma))
}
