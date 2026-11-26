import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { fromEpoch } from "@/db/expressions"
import { aprobaciones, revisionesCoordinacion, silabos } from "@/db/schema"
import { exportRequestTxOn } from "../documents/syllabusExportStore"
import { dispatchSyllabusExport } from "../documents/syllabusExportJob"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../shared/clock"
import { type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { signatureTxOn } from "../signatures/signatureStore"
import type { ReviewApprovalDeps, ReviewApprovalTx } from "./reviewApproval"
import { dbTransaction, reviewDecisionTx, type TransactionRunner } from "./reviewDecisionStore"
import { reviewDetailStoreOn } from "./reviewDetailQueries"
import type { Executor } from "./teacherSyllabusQueries"

export type ExportDispatch = (artifactId: string) => unknown

export function reviewApprovalTx(executor: Executor, afterCommit: AfterCommit, now: number, options: { mail?: WriteOptions["mail"]; dispatch?: ExportDispatch } = {}): ReviewApprovalTx {
  const decisions = reviewDecisionTx(executor, afterCommit, now, options.mail)
  return {
    ...signatureTxOn(executor),
    exports: exportRequestTxOn(executor, afterCommit, options.dispatch ?? dispatchSyllabusExport),
    lockedDecisionBlock: decisions.lockedDecisionBlock,
    lockSyllabus: decisions.lockSyllabus,
    latestRevisionId: decisions.latestRevisionId,
    revisionStage: decisions.revisionStage,
    async approvalExists(revisionId) {
      const [row] = await executor.select({ id: aprobaciones.aprobacionId }).from(aprobaciones).where(eq(aprobaciones.revisionSilaboId, revisionId)).limit(1)
      return row !== undefined
    },
    async coordinationReviewId(revisionId) {
      const [row] = await executor
        .select({ id: revisionesCoordinacion.revisionCoordinacionId })
        .from(revisionesCoordinacion)
        .where(eq(revisionesCoordinacion.revisionSilaboId, revisionId))
        .limit(1)
      return row?.id ?? null
    },
    async insertCoordinationReview(row) {
      await executor.insert(revisionesCoordinacion).values({ revisionCoordinacionId: row.id, revisionSilaboId: row.revisionId, revisadoPor: row.reviewerId, revisadoEn: fromEpoch(row.at) })
    },
    async insertApproval(row) {
      await executor.insert(aprobaciones).values({
        aprobacionId: row.id,
        revisionSilaboId: row.revisionId,
        claveSolicitud: row.key,
        hashContenido: row.fingerprint,
        aprobadoPor: row.approverId,
        aprobadoEn: fromEpoch(row.at),
      })
    },
    async markApproved(syllabusId, version) {
      await executor.update(silabos).set({ estadoSilabo: "aprobado", versionBorrador: version }).where(eq(silabos.silaboId, syllabusId))
    },
  }
}

export type ReviewApprovalOptions = WriteOptions & { dispatch?: ExportDispatch; newId?: () => string; newKey?: () => string }

export function reviewApprovalDepsOn(executor: Executor, transaction: TransactionRunner, options: ReviewApprovalOptions = {}): Omit<ReviewApprovalDeps, "bridge" | "settings"> {
  const now = options.now ?? systemNow
  return {
    store: reviewDetailStoreOn(executor),
    now,
    newId: options.newId ?? uuid7,
    newKey: options.newKey ?? randomUUID,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(reviewApprovalTx(inner, afterCommit, now(), options)))),
  }
}

export function createReviewApprovalDeps(): Omit<ReviewApprovalDeps, "bridge" | "settings"> {
  return reviewApprovalDepsOn(db as unknown as Executor, dbTransaction)
}
