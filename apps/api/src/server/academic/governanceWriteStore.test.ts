import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { governanceWriteTx } from "./governanceWriteStore"

function recordingDatabase() {
  const statements: { text: string; values: unknown[] }[] = []
  const run = async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    statements.push({ text: sql.text, values: sql.values })
    return []
  }
  return { db: { $queryRaw: run, $executeRaw: run } as unknown as Db, statements }
}

const FACULTY = "01a1c5ba-10b4-7129-925f-c28a9489323c"

describe("governanceWriteTx career creation", () => {
  it("creates the career without cycles and its first vigente malla «Malla <código>» with the cycles of the form", async () => {
    const { db, statements } = recordingDatabase()
    const id = await governanceWriteTx(db, () => undefined, 0).createCareer({ facultyId: FACULTY, modality: "presencial", code: "SW", name: "Software", cycleCount: 9 })
    expect(statements).toHaveLength(2)
    expect(statements[0].text).toContain("insert into carreras")
    expect(statements[0].text).not.toContain("numero_ciclos")
    expect(statements[1].text).toContain('insert into "mallas"')
    expect(statements[1].values).toEqual(expect.arrayContaining([id, "Malla SW", null, 9, "vigente"]))
  })
})
