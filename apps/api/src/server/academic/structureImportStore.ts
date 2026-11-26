import { inTransactionAfterCommit } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { systemNow } from "../shared/clock"
import type { WriteOptions } from "../notifications/queries"
import { careerWriteTx, curriculumTx } from "./careerWriteStore"
import { createGovernanceWriteDeps } from "./governanceWriteStore"
import type { StructureImportTransactions } from "./structureImports"

export function createStructureImportTransactions(prisma: PrismaService, options: WriteOptions = {}): StructureImportTransactions {
  const now = options.now ?? systemNow
  return {
    now,
    governance: createGovernanceWriteDeps(prisma, options).transaction,
    curriculum: (work) =>
      inTransactionAfterCommit(prisma, (tx, afterCommit) => work({ subjects: careerWriteTx(tx, afterCommit, now(), options), requirements: curriculumTx(tx, afterCommit, now(), options) })),
  }
}
