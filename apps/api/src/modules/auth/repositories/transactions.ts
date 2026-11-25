import type { Prisma } from "../../../generated/prisma/client"
import type { PrismaService } from "../../../prisma/prisma.service"

export const TRANSACTION_OPTIONS = { maxWait: 60_000, timeout: 600_000 } as const

export function inTransaction<T>(prisma: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => work(tx), TRANSACTION_OPTIONS)
}
