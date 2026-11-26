import type { PrismaService } from "../../prisma/prisma.service"
import { dispatch } from "../queue/dispatch"
import { defineJob } from "../queue/job"
import { failSyllabusExport, generateSyllabusExport, type ExportJobDeps } from "./syllabusExport"
import { createExportJobDeps } from "./syllabusExportStore"

export type SyllabusExportData = { artifactId: string }

export function createSyllabusExportJob(deps: () => ExportJobDeps) {
  return defineJob<SyllabusExportData>({
    name: "GenerateSyllabusExportJob",
    queue: "documentos",
    tries: 3,
    timeout: 120,
    backoff: [5, 30, 120],
    uniqueId: (data) => data.artifactId,
    runsOnce: true,
    handle: (data) => generateSyllabusExport(data.artifactId, deps()),
    failed: (data) => failSyllabusExport(data.artifactId, deps()),
  })
}

export function syllabusExportJobOn(prisma: PrismaService) {
  return createSyllabusExportJob(() => createExportJobDeps(prisma))
}

const dispatchedExportJob = createSyllabusExportJob(() => {
  throw new Error("GenerateSyllabusExportJob runs only in the worker, built with syllabusExportJobOn.")
})

export function dispatchSyllabusExport(artifactId: string): Promise<string> {
  return dispatch(dispatchedExportJob, { artifactId })
}
