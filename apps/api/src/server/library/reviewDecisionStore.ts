import { type Db, inTransactionAfterCommit } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch } from "../../prisma/sql"
import { systemNow } from "../shared/clock"
import { recipientsOn, type WriteOptions } from "../notifications/queries"
import type { AfterCommit } from "../queue/dispatch"
import { signatureTxOn } from "../signatures/signatureStore"
import { reviewDecisionTx } from "../syllabus/reviewDecisionStore"
import { reviewDetailStoreOn } from "../syllabus/reviewDetailQueries"
import type { LibraryDecisionDeps, LibraryDecisionTx } from "./reviewDecisions"

function libraryDecisionTx(db: Db, afterCommit: AfterCommit, now: number, mail?: WriteOptions["mail"]): LibraryDecisionTx {
  const decisions = reviewDecisionTx(db, afterCommit, now, mail)
  const recipients = recipientsOn(db)
  return {
    ...decisions,
    ...signatureTxOn(db),
    coordinatorsForCareer: (careerId) => recipients.coordinatorsForCareer(careerId),
    async lockSubmission(revisionId) {
      const [row] = await db.$queryRaw<{ id: string; verified: boolean }[]>`select envio_biblioteca_id::text as id, verificado_en is not null as verified
        from envios_biblioteca where revision_silabo_id = ${revisionId}::uuid limit 1 for update`
      return row ? { id: row.id, verified: Boolean(row.verified) } : null
    },
    async markVerified(submissionId, actorId, at) {
      await db.$executeRaw`update envios_biblioteca set verificado_por = ${actorId}::uuid, verificado_en = ${fromEpoch(at)} where envio_biblioteca_id = ${submissionId}::uuid`
    },
  }
}

export function libraryDecisionDepsOn(prisma: PrismaService, options: WriteOptions = {}): Omit<LibraryDecisionDeps, "bridge" | "settings"> {
  const now = options.now ?? systemNow
  return {
    store: reviewDetailStoreOn(prisma),
    now,
    transaction: (work) => inTransactionAfterCommit(prisma, (tx, afterCommit) => work(libraryDecisionTx(tx, afterCommit, now(), options.mail))),
  }
}

export function createLibraryDecisionDeps(prisma: PrismaService): Omit<LibraryDecisionDeps, "bridge" | "settings"> {
  return libraryDecisionDepsOn(prisma)
}
