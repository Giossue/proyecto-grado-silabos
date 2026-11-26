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
    const { db, queries } = recordingDb(() => [{ id: SYLLABUS, state: "sin_iniciar", version: 3, subjectId: "s", started: true }])
    expect(await draftTx(db).lockSyllabus(SYLLABUS)).toEqual({ id: SYLLABUS, state: "sin_iniciar", version: 3, subjectId: "s", started: true })
    expect(queries).toHaveLength(1)
    expect(text(queries[0])).toMatch(/^select silabos\.silabo_id as id, .* from silabos where silabos\.silabo_id = \$1::uuid and exists \(.*\) limit 1 for update$/)
    expect(queries[0].values).toEqual([SYLLABUS])
  })

  it("updates an existing value in place and inserts a missing one, both with the fingerprint of the field definition", async () => {
    const existing = recordingDb((query) => (query.text.includes("select valores_campo.valor_campo_id") ? [{ id: "v1" }] : []))
    await draftTx(existing.db).saveValue(SYLLABUS, FIELD, { type: "doc" }, "new-id", "huella")
    expect(existing.queries.map(text).map((sql) => sql.split(" ")[0])).toEqual(["select", "update"])
    expect(text(existing.queries[1])).toBe("update valores_campo set valor_campo = $1::jsonb, huella_definicion_campo = $2 where valores_campo.valor_campo_id = $3::uuid")
    expect(existing.queries[1].values).toEqual(['{"type":"doc"}', "huella", "v1"])
    const missing = recordingDb()
    await draftTx(missing.db).saveValue(SYLLABUS, FIELD, { type: "doc" }, "new-id", "huella")
    expect(text(missing.queries[1])).toMatch(/^insert into valores_campo \(valor_campo_id, silabo_id, definicion_campo_id, valor_campo, huella_definicion_campo\)/)
    expect(missing.queries[1].values).toEqual(["new-id", SYLLABUS, FIELD, '{"type":"doc"}', "huella"])
  })

  it("opening a syllabus fixes when it was prepared but keeps its state", async () => {
    const { db, queries } = recordingDb()
    await draftStartTx(db).start(SYLLABUS, 1_800_000_000)
    expect(queries).toHaveLength(1)
    expect(text(queries[0])).toBe("update silabos set iniciado_en = to_timestamp($1), guardado_en = to_timestamp($2), version_borrador = 1 where silabos.silabo_id = $3::uuid")
    expect(text(queries[0])).not.toContain("estado_silabo")
  })

  it("saves the draft version together with the state the save leaves", async () => {
    const { db, queries } = recordingDb()
    await draftTx(db).saveDraft(SYLLABUS, 2, 1_800_000_000, "borrador")
    expect(text(queries[0])).toBe("update silabos set estado_silabo = $1, version_borrador = $2, guardado_en = to_timestamp($3) where silabos.silabo_id = $4::uuid")
    expect(queries[0].values[0]).toBe("borrador")
    expect(queries[0].values[1]).toBe(2)
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
