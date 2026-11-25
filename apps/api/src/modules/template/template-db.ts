import { Prisma } from "../../generated/prisma/client"
import type { PrismaService } from "../../prisma/prisma.service"

export type Db = PrismaService | Prisma.TransactionClient

export const TRANSACTION_OPTIONS = { maxWait: 60_000, timeout: 600_000 } as const

export function jsonbOf(text: string): Prisma.Sql {
  return Prisma.sql`${text}::jsonb`
}

export async function hasRow(rows: Promise<unknown[]>): Promise<boolean> {
  return (await rows).length > 0
}
