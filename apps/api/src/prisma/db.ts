import type { Prisma } from "../generated/prisma/client"
import { type AfterCommit, withAfterCommit } from "../server/queue/afterCommit"
import type { PrismaService } from "./prisma.service"

export type Db = PrismaService | Prisma.TransactionClient

export const TRANSACTION_OPTIONS = { maxWait: 60_000, timeout: 600_000 } as const

export function inTransaction<T>(prisma: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => work(tx), TRANSACTION_OPTIONS)
}

export function inTransactionAfterCommit<T>(prisma: PrismaService, work: (tx: Prisma.TransactionClient, afterCommit: AfterCommit) => Promise<T>): Promise<T> {
  return withAfterCommit((afterCommit) => inTransaction(prisma, (tx) => work(tx, afterCommit)))
}
