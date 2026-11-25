import type { Prisma } from "../../../generated/prisma/client"

export type RawExecutor = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Prisma.PrismaPromise<T>
  $executeRaw(query: Prisma.Sql): Prisma.PrismaPromise<number>
}

export async function rowsOf<T>(executor: RawExecutor, query: Prisma.Sql): Promise<T[]> {
  return executor.$queryRaw<T[]>(query)
}
