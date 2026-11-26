import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { PrismaSetupRepository } from "../../modules/dashboard/setup.repository"
import { setupRepositoryOn } from "./setupQueries"

const CAREER = "0195e7a0-0000-7000-8000-000000000004"
const OPEN_MALLA = /exists \(select 1 from mallas malla_abierta where malla_abierta\.malla_id = asignaturas\.malla_id and malla_abierta\.estado_malla <> 'cerrada'\)/

function recordingDb(): { db: Db; queries: string[] } {
  const queries: string[] = []
  const query = async (raw: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const text = (raw instanceof Prisma.Sql ? raw : Prisma.sql(raw, ...values)).text.replace(/\s+/g, " ").trim()
    queries.push(text)
    if (text.includes("as \"withTeacher\"")) return [{ total: 2, withTeacher: 1 }]
    if (text.includes("from carreras")) return [{ subjects: 13, facultyId: null, hasLogo: false, disk: null, path: null, classification: null }]
    if (text.includes("from asignaturas")) return [{ id: "s1", withParallels: true }]
    return [{ total: 2, withTeacher: 1 }]
  }
  return { db: { $queryRaw: query } as unknown as Db, queries }
}

describe("career readiness across mallas", () => {
  it("counts the curriculum, the scheduled subjects and their parallels over every malla of the career that is not closed", async () => {
    const { db, queries } = recordingDb()
    const facts = await setupRepositoryOn(db).careerReadiness(CAREER)
    expect(facts).toMatchObject({ subjectsCount: 13, scheduledSubjectIds: ["s1"], scheduledWithParallels: 1, parallelTotal: 2, parallelsWithTeacher: 1 })
    expect(queries).toHaveLength(3)
    for (const text of queries) expect(text).toMatch(OPEN_MALLA)
    expect(queries.join(" ")).not.toMatch(/estado_malla = 'vigente'/)
  })

  it("the Nest repository answers with the same facts and the same rule", async () => {
    const { db, queries } = recordingDb()
    const facts = await new PrismaSetupRepository(db as unknown as PrismaService).careerReadiness(CAREER)
    expect(facts).toMatchObject({ subjectsCount: 13, scheduledSubjectIds: ["s1"], parallelTotal: 2 })
    for (const text of queries) expect(text).toMatch(OPEN_MALLA)
  })
})
