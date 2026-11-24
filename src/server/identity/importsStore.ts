import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { careerLabelSql } from "../academic/careerLabel"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { IdentityImportStore } from "./imports"

export function identityImportStoreOn(executor: Executor): IdentityImportStore {
  return {
    async activeCareers() {
      const rows = await rowsOf<{ id: string; name: string | null; code: string | null; label: string | null }>(
        executor,
        sql`select carrera.carrera_id::text as id, carrera.nombre_carrera as name, carrera.codigo_carrera as code, ${careerLabelSql("carrera")} as label
          from carreras carrera where carrera.carrera_activa = true`,
      )
      return rows.map((row) => ({ id: row.id, name: row.name ?? "", code: row.code ?? "", label: row.label ?? "" }))
    },
    async templateCareerLabels() {
      const rows = await rowsOf<{ label: string | null }>(
        executor,
        sql`select ${careerLabelSql("carrera")} as label from carreras carrera where carrera.carrera_activa = true
          order by carrera.nombre_carrera asc, carrera.codigo_carrera asc`,
      )
      return rows.map((row) => row.label ?? "")
    },
  }
}

export function createIdentityImportStore(): IdentityImportStore {
  return identityImportStoreOn(db as unknown as Executor)
}
