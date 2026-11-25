import { eq, isNotNull } from "drizzle-orm"
import { db } from "@/db"
import { fromEpoch } from "@/db/expressions"
import { enviosBiblioteca } from "@/db/schema"
import { recipientsOn, systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { signatureTxOn } from "../signatures/signatureStore"
import { dbTransaction, reviewDecisionTx, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import { reviewDetailStoreOn } from "../syllabus/reviewDetailQueries"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { LibraryDecisionDeps, LibraryDecisionTx } from "./reviewDecisions"

function libraryDecisionTx(executor: Executor, afterCommit: AfterCommit, now: number, mail?: WriteOptions["mail"]): LibraryDecisionTx {
  const decisions = reviewDecisionTx(executor, afterCommit, now, mail)
  const recipients = recipientsOn(executor)
  return {
    ...decisions,
    ...signatureTxOn(executor),
    coordinatorsForCareer: (careerId) => recipients.coordinatorsForCareer(careerId),
    async lockSubmission(revisionId) {
      const [row] = await executor
        .select({ id: enviosBiblioteca.envioBibliotecaId, verified: isNotNull(enviosBiblioteca.verificadoEn).mapWith(Boolean) })
        .from(enviosBiblioteca)
        .where(eq(enviosBiblioteca.revisionSilaboId, revisionId))
        .limit(1)
        .for("update")
      return row ? { id: row.id, verified: row.verified } : null
    },
    async markVerified(submissionId, actorId, at) {
      await executor
        .update(enviosBiblioteca)
        .set({ verificadoPor: actorId, verificadoEn: fromEpoch(at) })
        .where(eq(enviosBiblioteca.envioBibliotecaId, submissionId))
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
