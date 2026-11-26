import { Prisma } from "../../../generated/prisma/client"
import type { IdentityImportStore } from "../../../server/identity/imports"
import { rowsOf, type RawExecutor } from "../../auth/repositories/raw-executor"
import { careerLabelSql } from "../../../server/syllabus/syllabusSql"

export function identityImportStoreOn(executor: RawExecutor): IdentityImportStore {
  return {
    async activeCareers() {
      const rows = await rowsOf<{ id: string; name: string | null; code: string | null; label: string | null }>(
        executor,
        Prisma.sql`select "carrera_id" as "id", "nombre_carrera" as "name", "codigo_carrera" as "code", ${careerLabelSql("carreras")} as "label" from "carreras" where "carreras"."carrera_activa" = ${true}`,
      )
      return rows.map((row) => ({ id: row.id, name: row.name ?? "", code: row.code ?? "", label: row.label === null ? "" : String(row.label) }))
    },
    async templateCareerLabels() {
      const rows = await rowsOf<{ label: string | null }>(
        executor,
        Prisma.sql`select ${careerLabelSql("carreras")} as "label" from "carreras" where "carreras"."carrera_activa" = ${true} order by "carreras"."nombre_carrera" asc, "carreras"."codigo_carrera" asc`,
      )
      return rows.map((row) => (row.label === null ? "" : String(row.label)))
    },
  }
}
