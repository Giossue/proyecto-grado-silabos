import { describe, expect, it } from "vitest"
import type { Prisma } from "../../generated/prisma/client"
import { fakeDb } from "../shared/testing"
import { lockedDecisionBlock, reviewDecisionTx } from "./reviewDecisionStore"

const SYLLABUS = "0195e7a0-0000-7000-8000-000000000001"
const PROCESS = "0195e7a0-0000-7000-8000-000000000002"
const CONVOCATION = "0195e7a0-0000-7000-8000-000000000003"

function decisionRows(state: string, processState = "abierto") {
  return (query: Prisma.Sql): unknown[] => {
    if (query.text.includes("as process_id")) return [{ id: CONVOCATION, process_id: PROCESS }]
    if (query.text.includes("as process_state")) return [{ state, process_state: processState }]
    return []
  }
}

const compact = (query: Prisma.Sql) => query.text.replace(/\s+/g, " ")

describe("lockedDecisionBlock", () => {
  it("locks the institutional process for share before the career convocation", async () => {
    const { db, queries } = fakeDb(decisionRows("abierto"))
    expect(await lockedDecisionBlock(db, SYLLABUS)).toBeNull()
    expect(queries).toHaveLength(3)
    expect(compact(queries[0])).not.toMatch(/for (share|update)/)
    expect(compact(queries[1])).toMatch(/from convocatorias_universidad where convocatoria_universidad_id = \$1::uuid limit 1 for share$/)
    expect(queries[1].values).toEqual([PROCESS])
    expect(compact(queries[2])).toMatch(/limit 1 for share of convocatoria$/)
    expect(queries[2].values).toEqual([CONVOCATION])
  })

  it("reads without locks when asked and keeps the closed, paused and process-paused answers", async () => {
    const plain = fakeDb(decisionRows("abierto"))
    await lockedDecisionBlock(plain.db, SYLLABUS, false)
    expect(plain.queries).toHaveLength(2)
    expect(plain.queries.map(compact).join(" ")).not.toMatch(/for share/)
    expect(await lockedDecisionBlock(fakeDb(decisionRows("cerrado")).db, SYLLABUS)).toBe("El proceso de sílabos está cerrado: la revisión queda solo para consulta y no admite decisiones.")
    expect(await lockedDecisionBlock(fakeDb(decisionRows("pausado")).db, SYLLABUS)).toBe("El proceso de sílabos de la carrera está en pausa: las revisiones se retoman cuando se reanude.")
    expect(await lockedDecisionBlock(fakeDb(decisionRows("abierto", "pausado")).db, SYLLABUS)).toBe(
      "Administración pausó el proceso de sílabos: las revisiones se retoman cuando se reanude.",
    )
    expect(await lockedDecisionBlock(fakeDb(() => []).db, SYLLABUS)).toBe("El proceso de sílabos está cerrado: la revisión queda solo para consulta y no admite decisiones.")
  })
})

describe("reviewDecisionTx locks", () => {
  it("locks only the syllabus row and only the revision row", async () => {
    const { db, queries } = fakeDb((query) =>
      query.text.includes('from "silabos"')
        ? [{ id: SYLLABUS, state: "en_revision", version: 3, convocationId: CONVOCATION, parallelId: PROCESS }]
        : [{ id: PROCESS, number: 2, requested: true }],
    )
    const tx = reviewDecisionTx(db, () => undefined, 1767225600)
    expect(await tx.lockSyllabus(SYLLABUS)).toEqual({ id: SYLLABUS, state: "en_revision", version: 3, convocationId: CONVOCATION, parallelId: PROCESS })
    expect(await tx.lockRevision(PROCESS)).toEqual({ id: PROCESS, number: 2, correctionRequested: true })
    expect(compact(queries[0])).toMatch(/limit 1 for update of "silabos"$/)
    expect(compact(queries[1])).toMatch(/limit 1 for update of "revisiones_silabo"$/)
  })
})
