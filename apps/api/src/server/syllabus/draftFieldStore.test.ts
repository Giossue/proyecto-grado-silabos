import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { TRANSACTION_OPTIONS } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { createDraftFieldStore, draftTx } from "./draftFieldStore"
import { draftStartTx } from "./draftStartStore"

const SYLLABUS = "0195e7a0-0000-7000-8000-000000000001"
const FIELD = "0195e7a0-0000-7000-8000-000000000002"

function recordingDb(reply: (query: Prisma.Sql) => unknown[] = () => []) {
  const queries: Prisma.Sql[] = []
  const record = (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    queries.push(sql)
    return sql
  }
  const db = {
    $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => reply(record(query, ...values)),
    $executeRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, ...values), 1),
  }
  return { db: db as unknown as Db, queries }
}

const text = (query: Prisma.Sql) => query.text.replace(/\s+/g, " ").trim()

describe("draft field store", () => {
  it("locks the live syllabus row with for update and reads its subject", async () => {
    const { db, queries } = recordingDb(() => [{ id: SYLLABUS, state: "borrador", version: 3, subjectId: "s" }])
    expect(await draftTx(db).lockSyllabus(SYLLABUS)).toEqual({ id: SYLLABUS, state: "borrador", version: 3, subjectId: "s" })
    expect(queries).toHaveLength(1)
    expect(text(queries[0])).toMatch(/^select silabos\.silabo_id as id, .* from silabos where silabos\.silabo_id = \$1::uuid and exists \(.*\) limit 1 for update$/)
    expect(queries[0].values).toEqual([SYLLABUS])
  })

  it("updates an existing value in place and inserts a missing one", async () => {
    const existing = recordingDb((query) => (query.text.includes("select valores_campo.valor_campo_id") ? [{ id: "v1" }] : []))
    await draftTx(existing.db).saveValue(SYLLABUS, FIELD, { type: "doc" }, "new-id")
    expect(existing.queries.map(text).map((sql) => sql.split(" ")[0])).toEqual(["select", "update"])
    expect(text(existing.queries[1])).toBe("update valores_campo set valor_campo = $1::jsonb where valores_campo.valor_campo_id = $2::uuid")
    const missing = recordingDb()
    await draftTx(missing.db).saveValue(SYLLABUS, FIELD, { type: "doc" }, "new-id")
    expect(text(missing.queries[1])).toMatch(/^insert into valores_campo \(valor_campo_id, silabo_id, definicion_campo_id, valor_campo\)/)
    expect(missing.queries[1].values).toEqual(["new-id", SYLLABUS, FIELD, '{"type":"doc"}'])
  })

  it("skips the delete when there are no fields to drop", async () => {
    const { db, queries } = recordingDb()
    await draftStartTx(db).deleteValues(SYLLABUS, [])
    expect(queries).toEqual([])
  })

  it("runs the field transaction with the shared transaction options", async () => {
    const calls: unknown[] = []
    const { db } = recordingDb()
    const prisma = { $transaction: async (work: (tx: Db) => Promise<unknown>, options: unknown) => (calls.push(options), work(db)) } as unknown as PrismaService
    await createDraftFieldStore(prisma).transaction(async (tx) => tx.lockSyllabus(SYLLABUS))
    expect(calls).toEqual([TRANSACTION_OPTIONS])
  })
})
