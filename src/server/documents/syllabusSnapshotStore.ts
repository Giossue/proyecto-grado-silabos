import "server-only"
import { db } from "@/db"
import { createLogoStore } from "../configuration/institutionalLogos"
import { loadTemplate } from "../configuration/templateStore"
import { identificationSource } from "../syllabus/draftFieldStore"
import { syllabusDetailStoreOn } from "../syllabus/syllabusDetailQueries"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { SnapshotSource } from "./syllabusSnapshot"

export function snapshotSourceOn(executor: Executor): SnapshotSource {
  const detail = syllabusDetailStoreOn(executor)
  return {
    template: () => loadTemplate(executor),
    values: (syllabusId) => detail.values(syllabusId),
    identification: (syllabusId) => identificationSource(executor, syllabusId),
    archivedFields: (syllabusId) => detail.archivedFields(syllabusId),
    logos: createLogoStore(executor),
  }
}

export function createSnapshotSource(): SnapshotSource {
  return snapshotSourceOn(db as unknown as Executor)
}
