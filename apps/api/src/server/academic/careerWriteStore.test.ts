import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { careerWriteTx } from "./careerWriteStore"

function recordingDatabase() {
  const statements: { text: string; values: unknown[] }[] = []
  const run = async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    statements.push({ text: sql.text, values: sql.values })
    return []
  }
  return { db: { $queryRaw: run, $executeRaw: run } as unknown as Db, statements }
}

describe("careerWriteTx subject columns", () => {
  it("updates only the columns it receives", async () => {
    const { db, statements } = recordingDatabase()
    await careerWriteTx(db, () => undefined, 0).updateSubject("01a1c5ba-10b4-7129-925f-c28a9489323c", { nombre_asignatura: "Cálculo", horas_autonomas: "10.25" })
    expect(statements[0].text).toBe('update "asignaturas" set "nombre_asignatura" = $1, "horas_autonomas" = $2 where "asignaturas"."asignatura_id" = $3::uuid')
    expect(statements[0].values).toEqual(["Cálculo", "10.25", "01a1c5ba-10b4-7129-925f-c28a9489323c"])
  })

  it("inserts every subject column with an active flag", async () => {
    const { db, statements } = recordingDatabase()
    await careerWriteTx(db, () => undefined, 0).insertSubject("01a1c5ba-10b4-7129-925f-c28a9489323c", {
      codigo_asignatura: "MAT-1",
      nombre_asignatura: "Cálculo",
      ciclo_asignatura: 1,
      creditos_asignatura: "3.00",
      horas_docencia: null,
      horas_practicas: null,
      horas_autonomas: null,
      orden_asignatura_en_ciclo: 2,
      unidad_curricular_asignatura: "basica",
      modalidad_asignatura: "presencial",
      genera_silabo_asignatura: true,
    })
    expect(statements[0].text).toContain('insert into "asignaturas"')
    expect(statements[0].values).toEqual(expect.arrayContaining(["MAT-1", "Cálculo", 1, "3.00", 2, "basica", "presencial", true, "01a1c5ba-10b4-7129-925f-c28a9489323c"]))
    expect(statements[0].text).not.toContain('"total_horas_asignatura"')
  })

  it("rejects an unknown subject column", async () => {
    const { db } = recordingDatabase()
    await expect(careerWriteTx(db, () => undefined, 0).updateSubject("01a1c5ba-10b4-7129-925f-c28a9489323c", { otra: 1 } as never)).rejects.toThrow("Unknown column otra")
  })

  it("reads the career convocation of the process in progress and holds it against a pause or resume", async () => {
    const { db, statements } = recordingDatabase()
    expect(await careerWriteTx(db, () => undefined, 0).lockCurrentConvocation("01a1c5ba-10b4-7129-925f-c28a9489323c")).toBeNull()
    expect(statements[0].text).toContain("convocatorias_universidad.estado_convocatoria_universidad in ($2, $3)")
    expect(statements[0].text).toMatch(/for share of convocatorias_carreras$/)
    expect(statements[0].values).toEqual(["01a1c5ba-10b4-7129-925f-c28a9489323c", "abierto", "pausado", 1])
  })
})
