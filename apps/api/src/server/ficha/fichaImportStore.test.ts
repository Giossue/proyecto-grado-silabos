import { describe, expect, it } from "vitest"
import type { Db } from "../../prisma/db"
import { fichaReader } from "./fichaImportStore"

describe("ficha subjects across mallas", () => {
  it("exports the subjects that generate a syllabus in every malla of the career that is not closed", async () => {
    const calls: unknown[] = []
    const db = {
      asignaturas: {
        findMany: async (args: unknown) => {
          calls.push(args)
          return [{ asignatura_id: "s1", codigo_asignatura: "SW-1", nombre_asignatura: "Redes", ciclo_asignatura: 1 }]
        },
      },
    } as unknown as Db
    expect(await fichaReader(db).subjects("c1")).toEqual([{ id: "s1", code: "SW-1", name: "Redes", cycle: 1 }])
    expect(calls[0]).toMatchObject({
      where: { carrera_id: "c1", asignatura_activa: true, genera_silabo_asignatura: true, mallas: { estado_malla: { not: "cerrada" } } },
    })
  })
})
