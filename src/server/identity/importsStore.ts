import "server-only"
import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { carreras } from "@/db/schema"
import { careerLabelSql } from "../academic/careerLabel"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { IdentityImportStore } from "./imports"

const careerLabel = careerLabelSql("carreras").mapWith(String)

export function identityImportStoreOn(executor: Executor): IdentityImportStore {
  return {
    async activeCareers() {
      const rows = await executor
        .select({ id: carreras.carreraId, name: carreras.nombreCarrera, code: carreras.codigoCarrera, label: careerLabel })
        .from(carreras)
        .where(eq(carreras.carreraActiva, true))
      return rows.map((row) => ({ id: row.id, name: row.name ?? "", code: row.code ?? "", label: row.label ?? "" }))
    },
    async templateCareerLabels() {
      const rows = await executor
        .select({ label: careerLabel })
        .from(carreras)
        .where(eq(carreras.carreraActiva, true))
        .orderBy(asc(carreras.nombreCarrera), asc(carreras.codigoCarrera))
      return rows.map((row) => row.label ?? "")
    },
  }
}

export function createIdentityImportStore(): IdentityImportStore {
  return identityImportStoreOn(db as unknown as Executor)
}
