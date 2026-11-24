import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { createLogoStore } from "../configuration/institutionalLogos"
import { loadTemplate } from "../configuration/templateStore"
import { identificationSource } from "../syllabus/draftFieldStore"
import { syllabusDetailStoreOn } from "../syllabus/syllabusDetailQueries"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { SnapshotSource } from "./syllabusSnapshot"

export function snapshotSourceOn(executor: Executor): SnapshotSource {
  const detail = syllabusDetailStoreOn(executor)
  return {
    template: () => loadTemplate(executor),
    values: (syllabusId) => detail.values(syllabusId),
    identification: (syllabusId) => identificationSource(executor, syllabusId),
    hasArchivedValues: (syllabusId) => detail.hasArchivedValues(syllabusId),
    async rawJson(syllabusId) {
      const [row] = await rowsOf<{ definition: string | null; context: string | null; values: string[] | null; contents: string[] | null }>(
        executor,
        sql`select (select definicion_plantilla::text from plantilla_silabo limit 1) as definition,
            (select datos_academicos_silabo::text from silabos where silabo_id = ${syllabusId}::uuid limit 1) as context,
            (select array_agg(valor_campo::text) from valores_campo where silabo_id = ${syllabusId}::uuid) as values,
            (select array_agg(contenido_definicion_campo::text) from definiciones_campo where vigente_en_plantilla = true) as contents`,
      )
      return { definition: row?.definition ?? null, context: row?.context ?? null, values: row?.values ?? [], contents: row?.contents ?? [] }
    },
    logos: createLogoStore(executor),
  }
}

export function createSnapshotSource(): SnapshotSource {
  return snapshotSourceOn(db as unknown as Executor)
}
