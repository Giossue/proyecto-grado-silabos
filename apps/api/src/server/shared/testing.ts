import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"

export type Reply = (query: Prisma.Sql) => unknown[]

export function fakeDb(reply: Reply): { db: Db; queries: Prisma.Sql[] } {
  const queries: Prisma.Sql[] = []
  const run = async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    queries.push(sql)
    return reply(sql)
  }
  return { db: { $queryRaw: run } as unknown as Db, queries }
}
