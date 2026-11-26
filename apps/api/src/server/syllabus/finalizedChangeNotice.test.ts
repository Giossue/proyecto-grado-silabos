import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { FinalizedChangeNotice } from "./finalizedChangeNotice"
import { InProgressWork } from "./inProgressWork"

describe("finalized change notice across mallas", () => {
  it("counts as a new syllabus only a parallel of a subject whose malla is not closed", async () => {
    const queries: string[] = []
    const db = {
      $queryRaw: async (query: Prisma.Sql) => (queries.push(query.text.replace(/\s+/g, " ")), [{ id: "p1" }]),
      $executeRaw: async () => 1,
    } as unknown as Db
    const notice = new FinalizedChangeNotice(new InProgressWork(db, () => {}), 0)
    const pending = Reflect.get(notice, "parallelsWithoutSyllabus") as (convocationId: string, subjectIds: string[] | null) => Promise<string[]>
    expect(await pending.call(notice, "0195e7a0-0000-7000-8000-000000000002", null)).toEqual(["p1"])
    expect(queries[0]).toContain("asignatura.genera_silabo_asignatura = true and exists (select 1 from mallas malla_abierta where malla_abierta.malla_id = asignatura.malla_id and malla_abierta.estado_malla <> 'cerrada')")
  })
})
