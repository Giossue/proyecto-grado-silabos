import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { recipientsOn, systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { signatureTxOn } from "../signatures/signatureStore"
import { dbTransaction, reviewDecisionTx, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import { reviewDetailStoreOn } from "../syllabus/reviewDetailQueries"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { LibraryDecisionDeps, LibraryDecisionTx } from "./reviewDecisions"

function libraryDecisionTx(executor: Executor, afterCommit: AfterCommit, now: number, mail?: WriteOptions["mail"]): LibraryDecisionTx {
  const decisions = reviewDecisionTx(executor, afterCommit, now, mail)
  const recipients = recipientsOn(executor)
  return {
    ...decisions,
    ...signatureTxOn(executor),
    coordinatorsForCareer: (careerId) => recipients.coordinatorsForCareer(careerId),
    async lockSubmission(revisionId) {
      const [row] = await rowsOf<{ id: string; verified: boolean }>(
        executor,
        sql`select envio_biblioteca_id::text as id, verificado_en is not null as verified from envios_biblioteca
          where revision_silabo_id = ${revisionId}::uuid limit 1 for update`,
      )
      return row ? { id: row.id, verified: row.verified } : null
    },
    async markVerified(submissionId, actorId, at) {
      await executor.execute(sql`update envios_biblioteca set verificado_por = ${actorId}::uuid, verificado_en = to_timestamp(${at})
        where envio_biblioteca_id = ${submissionId}::uuid`)
    },
  }
}

export function libraryDecisionDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<LibraryDecisionDeps, "bridge" | "settings"> {
  const now = options.now ?? systemNow
  return {
    store: reviewDetailStoreOn(executor),
    now,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(libraryDecisionTx(inner, afterCommit, now(), options.mail)))),
  }
}

export function createLibraryDecisionDeps(): Omit<LibraryDecisionDeps, "bridge" | "settings"> {
  return libraryDecisionDepsOn(db as unknown as Executor, dbTransaction)
}
