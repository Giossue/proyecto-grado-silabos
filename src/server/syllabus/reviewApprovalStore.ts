import "server-only"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { record } from "../configuration/phpValues"
import { gotenbergEnabled, gotenbergSettings } from "../documents/gotenbergConverter"
import { exportRequestTxOn } from "../documents/syllabusExportStore"
import { dispatchSyllabusExport } from "../documents/syllabusExportJob"
import { rendererVersion, rendersInNext } from "../documents/syllabusRenderer"
import { uuid7 } from "../laravel/uuid7"
import { systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { signatureTxOn } from "../signatures/signatureStore"
import type { ReviewApprovalDeps, ReviewApprovalTx } from "./reviewApproval"
import { dbTransaction, reviewDecisionTx, type TransactionRunner } from "./reviewDecisionStore"
import { reviewDetailStoreOn } from "./reviewDetailQueries"
import { revisionSnapshotOf } from "./syllabusDetailQueries"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

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
      const [row] = await rowsOf<{ found: boolean }>(executor, sql`select exists (select 1 from aprobaciones where revision_silabo_id = ${revisionId}::uuid) as found`)
      return row?.found === true
    },
    async submitterId(revisionId) {
      const [row] = await rowsOf<{ id: string | null }>(executor, sql`select enviado_por::text as id from revisiones_silabo where revision_silabo_id = ${revisionId}::uuid limit 1`)
      return row?.id ?? null
    },
    async coordinationReviewId(revisionId) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        sql`select revision_coordinacion_id::text as id from revisiones_coordinacion where revision_silabo_id = ${revisionId}::uuid limit 1`,
      )
      return row?.id ?? null
    },
    async insertCoordinationReview(row) {
      await executor.execute(sql`insert into revisiones_coordinacion (revision_coordinacion_id, revision_silabo_id, revisado_por, revisado_en)
        values (${row.id}::uuid, ${row.revisionId}::uuid, ${row.reviewerId}::uuid, to_timestamp(${row.at}))`)
    },
    async insertApproval(row) {
      await executor.execute(sql`insert into aprobaciones (aprobacion_id, revision_silabo_id, clave_solicitud, hash_contenido, aprobado_por, aprobado_en)
        values (${row.id}::uuid, ${row.revisionId}::uuid, ${row.key}::uuid, ${row.fingerprint}, ${row.approverId}::uuid, to_timestamp(${row.at}))`)
    },
    async markApproved(syllabusId, version) {
      await executor.execute(sql`update silabos set estado_silabo = 'aprobado', version_borrador = ${version} where silabo_id = ${syllabusId}::uuid`)
    },
  }
}

export async function revisionRendersInNext(executor: Executor, revisionId: string): Promise<boolean> {
  return rendersInNext(record(await revisionSnapshotOf(executor, revisionId)), gotenbergEnabled(gotenbergSettings()))
}

export type ReviewApprovalOptions = WriteOptions & { dispatch?: ExportDispatch; newId?: () => string; newKey?: () => string }

export function reviewApprovalDepsOn(executor: Executor, transaction: TransactionRunner, options: ReviewApprovalOptions = {}): Omit<ReviewApprovalDeps, "bridge" | "settings"> {
  const now = options.now ?? systemNow
  return {
    store: reviewDetailStoreOn(executor),
    renderable: (revisionId) => revisionRendersInNext(executor, revisionId),
    rendererVersion: () => rendererVersion(gotenbergEnabled(gotenbergSettings())),
    now,
    newId: options.newId ?? uuid7,
    newKey: options.newKey ?? randomUUID,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(reviewApprovalTx(inner, afterCommit, now(), options)))),
  }
}

export function createReviewApprovalDeps(): Omit<ReviewApprovalDeps, "bridge" | "settings"> {
  return reviewApprovalDepsOn(db as unknown as Executor, dbTransaction)
}
