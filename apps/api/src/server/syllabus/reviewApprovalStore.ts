import { randomUUID } from "node:crypto"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch } from "../../prisma/sql"
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
import { rowsOf } from "./teacherSyllabusQueries"

export type ExportDispatch = (artifactId: string) => unknown

export function reviewApprovalTx(executor: Db, afterCommit: AfterCommit, now: number, options: { mail?: WriteOptions["mail"]; dispatch?: ExportDispatch } = {}): ReviewApprovalTx {
  const decisions = reviewDecisionTx(executor, afterCommit, now, options.mail)
  return {
    ...signatureTxOn(executor),
    exports: exportRequestTxOn(executor, afterCommit, options.dispatch ?? dispatchSyllabusExport),
    lockedDecisionBlock: decisions.lockedDecisionBlock,
    lockSyllabus: decisions.lockSyllabus,
    latestRevisionId: decisions.latestRevisionId,
    revisionStage: decisions.revisionStage,
    async approvalExists(revisionId) {
      const [row] = await rowsOf<{ id: string }>(executor, Prisma.sql`select "aprobacion_id"::text as id from "aprobaciones" where "aprobaciones"."revision_silabo_id" = ${revisionId}::uuid limit 1`)
      return row !== undefined
    },
    async coordinationReviewId(revisionId) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        Prisma.sql`select "revision_coordinacion_id"::text as id from "revisiones_coordinacion" where "revisiones_coordinacion"."revision_silabo_id" = ${revisionId}::uuid limit 1`,
      )
      return row?.id ?? null
    },
    async insertCoordinationReview(row) {
      await executor.$executeRaw`insert into "revisiones_coordinacion" ("revision_coordinacion_id", "revision_silabo_id", "revisado_por", "revisado_en")
        values (${row.id}::uuid, ${row.revisionId}::uuid, ${row.reviewerId}::uuid, ${fromEpoch(row.at)})`
    },
    async insertApproval(row) {
      await executor.$executeRaw`insert into "aprobaciones" ("aprobacion_id", "revision_silabo_id", "clave_solicitud", "hash_contenido", "aprobado_por", "aprobado_en")
        values (${row.id}::uuid, ${row.revisionId}::uuid, ${row.key}::uuid, ${row.fingerprint}, ${row.approverId}::uuid, ${fromEpoch(row.at)})`
    },
    async markApproved(syllabusId, version) {
      await executor.$executeRaw`update "silabos" set "estado_silabo" = 'aprobado', "version_borrador" = ${version} where "silabos"."silabo_id" = ${syllabusId}::uuid`
    },
  }
}

export type ReviewApprovalOptions = WriteOptions & { dispatch?: ExportDispatch; newId?: () => string; newKey?: () => string }

export function reviewApprovalDepsOn(executor: Db, transaction: TransactionRunner, options: ReviewApprovalOptions = {}): Omit<ReviewApprovalDeps, "bridge" | "settings"> {
  const now = options.now ?? systemNow
  return {
    store: reviewDetailStoreOn(executor),
    now,
    newId: options.newId ?? uuid7,
    newKey: options.newKey ?? randomUUID,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(reviewApprovalTx(inner, afterCommit, now(), options)))),
  }
}

export function createReviewApprovalDeps(prisma: PrismaService): Omit<ReviewApprovalDeps, "bridge" | "settings"> {
  return reviewApprovalDepsOn(prisma, dbTransaction(prisma))
}
