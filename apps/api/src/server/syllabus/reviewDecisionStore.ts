import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { fromEpoch } from "@/db/expressions"
import { revisionesSilabo, silabos } from "@/db/schema"
import { systemNow } from "../shared/clock"
import { notificationScope, recipientsOn, type Mail, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import type { ReviewDecisionDeps, ReviewDecisionTx } from "./reviewDecisions"
import { reviewDetailStoreOn } from "./reviewDetailQueries"
import { InProgressWork } from "./inProgressWork"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

const CLOSED = "La convocatoria está cerrada: la revisión queda solo para consulta y no admite decisiones."
const SYLLABUS_ALIVE = sql`exists (select 1 from convocatorias_carreras vivo where vivo.convocatoria_carrera_id = silabos.convocatoria_carrera_id
  and exists (select 1 from convocatorias_universidad vivo_proceso where vivo_proceso.convocatoria_universidad_id = vivo.convocatoria_universidad_id))`
const REVISION_ALIVE = sql`exists (select 1 from silabos where silabos.silabo_id = revisiones_silabo.silabo_id and ${SYLLABUS_ALIVE})`

export async function lockedDecisionBlock(executor: Executor, syllabusId: string, lock = true): Promise<string | null> {
  const [convocation] = await rowsOf<{ id: string; process_id: string }>(
    executor,
    sql`select convocatoria.convocatoria_carrera_id::text as id, convocatoria.convocatoria_universidad_id::text as process_id
      from silabos inner join convocatorias_carreras convocatoria on convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id
      where silabos.silabo_id = ${syllabusId}::uuid
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id)
      limit 1`,
  )
  if (!convocation) return CLOSED
  if (lock) {
    await executor.execute(sql`select convocatoria_universidad_id from convocatorias_universidad where convocatoria_universidad_id = ${convocation.process_id}::uuid limit 1 for share`)
  }
  const [state] = await rowsOf<{ state: string; process_state: string }>(
    executor,
    sql`select convocatoria.estado_convocatoria_carrera as state,
        (select proceso.estado_convocatoria_universidad from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id) as process_state
      from convocatorias_carreras convocatoria where convocatoria.convocatoria_carrera_id = ${convocation.id}::uuid
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id)
      limit 1 ${lock ? sql`for share of convocatoria` : sql``}`,
  )
  if (!state || !["abierta", "pausada"].includes(state.state)) return CLOSED
  if (state.state === "pausada") return "La convocatoria de la carrera está en pausa: las revisiones se retoman cuando se reanude."
  if (state.process_state === "pausado") return "Administración pausó la convocatoria institucional: las revisiones se retoman cuando se reanude."
  return null
}

export function reviewDecisionTx(executor: Executor, afterCommit: AfterCommit, now: number, mail?: Mail): ReviewDecisionTx {
  const recipients = recipientsOn(executor)
  const work = new InProgressWork(executor, afterCommit)
  return {
    notifications: notificationScope(executor, afterCommit, now, mail),
    teachersFor: (syllabusId) => recipients.teachersFor(syllabusId),
    lockedDecisionBlock: (syllabusId) => lockedDecisionBlock(executor, syllabusId),
    decisionBlock: (syllabusId) => lockedDecisionBlock(executor, syllabusId, false),
    restartSyllabus: (syllabus) => work.restartSyllabus(syllabus),
    async lockSyllabus(id) {
      const [row] = await executor
        .select({
          id: silabos.silaboId,
          state: silabos.estadoSilabo,
          version: silabos.versionBorrador,
          convocationId: silabos.convocatoriaCarreraId,
          parallelId: silabos.paraleloId,
        })
        .from(silabos)
        .where(and(eq(silabos.silaboId, id), SYLLABUS_ALIVE))
        .limit(1)
        .for("update", { of: silabos })
      return row ? { id: row.id, state: row.state, version: Number(row.version), convocationId: row.convocationId, parallelId: row.parallelId } : null
    },
    async latestRevisionId(syllabusId) {
      const [row] = await executor
        .select({ id: revisionesSilabo.revisionSilaboId })
        .from(revisionesSilabo)
        .where(and(eq(revisionesSilabo.silaboId, syllabusId), REVISION_ALIVE))
        .orderBy(desc(revisionesSilabo.numeroRevision))
        .limit(1)
      return row?.id ?? null
    },
    async lockRevision(id) {
      const [row] = await executor
        .select({ id: revisionesSilabo.revisionSilaboId, number: revisionesSilabo.numeroRevision, requested: isNotNull(revisionesSilabo.correccionSolicitadaEn).mapWith(Boolean) })
        .from(revisionesSilabo)
        .where(and(eq(revisionesSilabo.revisionSilaboId, id), REVISION_ALIVE))
        .limit(1)
        .for("update", { of: revisionesSilabo })
      return row ? { id: row.id, number: Number(row.number), correctionRequested: row.requested } : null
    },
    async revisionStage(id) {
      const [row] = await rowsOf<{ approved: boolean; verified: boolean }>(
        executor,
        sql`select exists (select 1 from aprobaciones where revision_silabo_id = ${id}::uuid) as approved,
          exists (select 1 from envios_biblioteca where revision_silabo_id = ${id}::uuid and verificado_en is not null) as verified`,
      )
      if (row.approved) return null
      return row.verified ? "coordinacion" : "biblioteca"
    },
    async requestCorrection(revisionId, justification, stage, actorId, at) {
      await executor
        .update(revisionesSilabo)
        .set({ correccionJustificacion: justification, correccionEtapa: stage, correccionSolicitadaPor: actorId, correccionSolicitadaEn: fromEpoch(at) })
        .where(eq(revisionesSilabo.revisionSilaboId, revisionId))
    },
    async markCorrectionRequested(syllabusId, version, at) {
      await executor
        .update(silabos)
        .set({ estadoSilabo: "correccion_solicitada", versionBorrador: version, guardadoEn: fromEpoch(at) })
        .where(eq(silabos.silaboId, syllabusId))
    },
  }
}

export type TransactionRunner = <T>(work: (executor: Executor) => Promise<T>) => Promise<T>

export const dbTransaction: TransactionRunner = (work) => db.transaction((tx) => work(tx as unknown as Executor))

export function reviewDecisionDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ReviewDecisionDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    store: reviewDetailStoreOn(executor),
    now,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(reviewDecisionTx(inner, afterCommit, now(), options.mail)))),
  }
}

export function createReviewDecisionDeps(): Omit<ReviewDecisionDeps, "bridge"> {
  return reviewDecisionDepsOn(db as unknown as Executor, dbTransaction)
}
