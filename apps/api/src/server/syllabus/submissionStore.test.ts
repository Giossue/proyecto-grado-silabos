import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { submissionDepsOn } from "./submissionStore"
import type { SubmissionTx } from "./submission"

const SYLLABUS = "0195e7a0-0000-7000-8000-000000000001"

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

async function submissionTx(db: Db): Promise<SubmissionTx> {
  const deps = submissionDepsOn(db, (work) => work(db))
  return deps.store.transaction(async (tx) => tx)
}

describe("submission store", () => {
  it("locks the syllabus row only, then the latest revision, in that order", async () => {
    const { db, queries } = recordingDb((query) =>
      query.text.includes("from revisiones_silabo") ? [{ id: "r2", number: 2, stage: "coordinacion" }] : [{ id: SYLLABUS, state: "sin_iniciar", version: 4, started: true }],
    )
    const tx = await submissionTx(db)
    expect(await tx.lockSyllabus(SYLLABUS)).toEqual({ id: SYLLABUS, state: "sin_iniciar", version: 4, started: true })
    expect(await tx.lockLatestRevision(SYLLABUS)).toEqual({ id: "r2", number: 2, correctionStage: "coordinacion" })
    expect(queries).toHaveLength(2)
    expect(text(queries[0])).toMatch(/from silabos where silabos\.silabo_id = \$1::uuid and exists \(.*\) limit 1 for update of silabos$/)
    expect(text(queries[1])).toMatch(/from revisiones_silabo where revisiones_silabo\.silabo_id = \$1::uuid order by revisiones_silabo\.numero_revision desc limit 1 for update$/)
  })

  it("stores the revision with the canonical snapshot as jsonb and epoch timestamps", async () => {
    const { db, queries } = recordingDb()
    const tx = await submissionTx(db)
    await tx.createRevision({ id: "r1", syllabusId: SYLLABUS, previousId: null, number: 1, key: "k1", version: 5, snapshot: { b: 1, a: 2 }, fingerprint: "f", submittedBy: "u1", submittedAt: 1700000000 })
    expect(text(queries[0])).toMatch(/^insert into revisiones_silabo .* \$7::jsonb, \$8, \$9::uuid, to_timestamp\(\$10\)\)$/)
    expect(queries[0].values).toEqual(["r1", SYLLABUS, null, 1, "k1", 5, '{"a":2,"b":1}', "f", "u1", 1700000000])
  })
})
