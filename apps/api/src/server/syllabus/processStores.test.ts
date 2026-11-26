import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { convocationTx } from "./convocationQueries"
import { convocationWriteTx } from "./convocationWriteStore"
import { closingDepsOn } from "./processClosingStore"
import { processTx } from "./processQueries"
import { processWriteTx } from "./processWriteStore"

const PROCESS = "01a1c5bc-8107-70ce-b951-112443c38cd1"
const CONVOCATION = "01a2094b-5577-7223-9a53-bc39cda5f7e3"

function recordingDb(reply: (query: Prisma.Sql) => unknown[] = () => []): { db: Db; statements: string[] } {
  const statements: string[] = []
  const record = (query: TemplateStringsArray | Prisma.Sql, values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    statements.push(sql.text.replace(/\s+/g, " ").trim())
    return sql
  }
  const db = {
    $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => reply(record(query, values)),
    $executeRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
      record(query, values)
      return 1
    },
  }
  return { db: db as unknown as Db, statements }
}

const noop = () => {}

describe("process transaction statements", () => {
  it("locks the process row for update before pausing it in two updates", async () => {
    const { db, statements } = recordingDb(() => [{ state: "abierto" }])
    const tx = processTx(db)
    expect(await tx.lockProcess(PROCESS)).toBe("abierto")
    await tx.pause(PROCESS)
    expect(statements[0]).toMatch(/from convocatorias_universidad where .* limit 1 for update$/)
    expect(statements[1]).toMatch(/^update convocatorias_universidad set estado_convocatoria_universidad = \$1 where/)
    expect(statements[2]).toMatch(/^update convocatorias_universidad set pausado_en = clock_timestamp\(\) where/)
  })

  it("locks the in-progress process before reading its period", async () => {
    const { db, statements } = recordingDb((query) => (query.text.includes("for update") ? [{ id: PROCESS, periodId: "p" }] : [{ code: "2026-1" }]))
    expect(await processTx(db).lockInProgress()).toEqual({ id: PROCESS, period: "2026-1" })
    expect(statements[0]).toMatch(/estado_convocatoria_universidad in \(\$1, \$2\) limit 1 for update$/)
    expect(statements[1]).toMatch(/from periodos_academicos/)
  })
})

describe("process write transaction statements", () => {
  it("locks the process, its convocations and their syllabi in that order", async () => {
    const { db, statements } = recordingDb((query) =>
      query.text.includes("cantidad_prorrogas")
        ? [{ id: PROCESS, state: "abierto", periodId: "p", period: null, dueAt: "1800000000", extensions: 1, periodEndsOn: "2026-12-31", finalized: false }]
        : [{ id: CONVOCATION }],
    )
    const tx = processWriteTx(db, noop, 1_800_000_000)
    expect(await tx.lockProcess(PROCESS)).toEqual({
      id: PROCESS,
      state: "abierto",
      periodId: "p",
      period: "Período",
      dueAt: 1_800_000_000,
      extensions: 1,
      periodEndsOn: "2026-12-31",
      finalized: false,
    })
    expect(await tx.lockConvocations(PROCESS)).toEqual([CONVOCATION])
    expect(await tx.lockSyllabi([CONVOCATION])).toEqual([CONVOCATION])
    expect(await tx.lockSyllabi([])).toEqual([])
    expect(statements).toHaveLength(3)
    expect(statements[0]).toMatch(/limit 1 for update of convocatorias_universidad$/)
    expect(statements[1]).toMatch(/from convocatorias_carreras where .* for update$/)
    expect(statements[2]).toMatch(/from silabos where \(silabos\.convocatoria_carrera_id in \(\$1::uuid\) and .*\) for update of silabos$/)
  })

  it("turns off the institutional reset flag before deleting convocations and then the process", async () => {
    const { db, statements } = recordingDb()
    const tx = processWriteTx(db, noop, 1_800_000_000)
    await tx.deleteProcess(PROCESS, [CONVOCATION])
    await tx.deleteProcess(PROCESS, [])
    expect(statements).toEqual([
      "SET LOCAL app.reinicio_institucional = 'off'",
      expect.stringMatching(/^delete from convocatorias_carreras where/),
      expect.stringMatching(/^delete from convocatorias_universidad where/),
      "SET LOCAL app.reinicio_institucional = 'off'",
      expect.stringMatching(/^delete from convocatorias_universidad where/),
    ])
  })

  it("locks reopened convocations in id order", async () => {
    const { db, statements } = recordingDb(() => [])
    await processWriteTx(db, noop, 1_800_000_000).generateReopened([CONVOCATION])
    expect(statements[0]).toMatch(/order by convocatorias_carreras\.convocatoria_carrera_id asc for update$/)
  })
})

describe("closing transaction statements", () => {
  async function closing(work: (tx: Parameters<Parameters<ReturnType<typeof closingDepsOn>["transaction"]>[0]>[0]) => Promise<unknown>) {
    const recorded = recordingDb(() => [{ id: "s", context: '{"a":1}' }])
    await closingDepsOn(recorded.db, (inner) => inner(recorded.db)).transaction(work as never)
    return recorded.statements
  }

  it("keeps or clears the pause instant when closing the process", async () => {
    const kept = await closing((tx) => tx.closeProcess(PROCESS, true))
    const cleared = await closing((tx) => tx.closeProcess(PROCESS, false))
    expect(kept[0]).not.toMatch(/pausado_en/)
    expect(cleared[0]).toMatch(/pausado_en = null, finalizada_en = clock_timestamp\(\)/)
  })

  it("locks the open syllabi with for update of silabos", async () => {
    const statements = await closing((tx) => tx.lockOpenSyllabi(PROCESS))
    expect(statements[0]).toMatch(/for update of silabos$/)
  })
})

describe("convocation transaction statements", () => {
  it("locks the career convocation for update", async () => {
    const { db, statements } = recordingDb(() => [{ state: "abierta" }])
    expect(await convocationTx(db).lockConvocation(CONVOCATION)).toBe("abierta")
    expect(statements[0]).toMatch(/limit 1 for update$/)
  })

  it("locks the process and then only the convocation row of the joined write query", async () => {
    const { db, statements } = recordingDb((query) =>
      query.text.includes("from convocatorias_carreras") ? [{ id: CONVOCATION, careerId: "c", careerLabel: "Software", state: "abierta", processState: "abierto", dueAt: "1800000000" }] : [{ id: PROCESS, state: "abierto", periodId: "p" }],
    )
    const tx = convocationWriteTx(db, noop, 1_800_000_000)
    await tx.lockProcess(PROCESS)
    expect((await tx.lockConvocation(CONVOCATION))?.dueAt).toBe(1_800_000_000)
    expect(statements[0]).toMatch(/from convocatorias_universidad where .* limit 1 for update$/)
    expect(statements[1]).toMatch(/limit 1 for update of convocatorias_carreras$/)
  })
})
