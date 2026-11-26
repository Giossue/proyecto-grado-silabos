import type { Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { createLogoStore } from "../shared/logoStore"
import { loadTemplate } from "../shared/templateStore"
import { identificationSource } from "../syllabus/draftFieldStore"
import { syllabusDetailStoreOn } from "../syllabus/syllabusDetailQueries"
import type { SnapshotSource } from "./syllabusSnapshot"

export function snapshotSourceOn(executor: Db): SnapshotSource {
  const detail = syllabusDetailStoreOn(executor)
  return {
    template: () => loadTemplate(executor),
    values: (syllabusId) => detail.values(syllabusId),
    identification: (syllabusId) => identificationSource(executor, syllabusId),
    archivedFields: (syllabusId) => detail.archivedFields(syllabusId),
    logos: createLogoStore(executor),
  }
}

export function createSnapshotSource(prisma: PrismaService): SnapshotSource {
  return snapshotSourceOn(prisma)
}
