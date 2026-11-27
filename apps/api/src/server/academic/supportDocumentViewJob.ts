import type { PrismaService } from "../../prisma/prisma.service"
import { convertFile, gotenbergEnabled, gotenbergSettings } from "../documents/gotenbergConverter"
import { storageWriter } from "../http/storageWriter"
import { uuid7 } from "../http/uuid7"
import { dispatch } from "../queue/dispatch"
import { defineJob } from "../queue/job"
import { failSupportDocumentView, prepareSupportDocumentView, type SupportDocumentViewDeps } from "./supportDocumentView"
import { createSupportDocumentViewStore } from "./supportDocumentWriteStore"

export type SupportDocumentViewData = { documentId: string; originalId?: string }

export function defaultSupportDocumentViewDeps(prisma: PrismaService): SupportDocumentViewDeps {
  return {
    store: createSupportDocumentViewStore(prisma),
    storage: storageWriter(),
    converterEnabled: () => gotenbergEnabled(gotenbergSettings()),
    convertFile: (content, filename) => convertFile(content, filename),
    newObjectId: uuid7,
    now: () => Math.floor(Date.now() / 1000),
    warn: (message, context) => console.warn(message, context),
  }
}

export function createSupportDocumentViewJob(deps: () => SupportDocumentViewDeps) {
  return defineJob<SupportDocumentViewData>({
    name: "PrepareSupportDocumentViewJob",
    queue: "documentos",
    tries: 3,
    timeout: 150,
    backoff: [5, 30, 120],
    uniqueId: (data) => (data.originalId === undefined ? data.documentId : `${data.documentId}:${data.originalId}`),
    runsOnce: true,
    handle: (data) => prepareSupportDocumentView(data.documentId, deps(), data.originalId),
    failed: (data, error) => failSupportDocumentView(data.documentId, error, deps(), data.originalId),
  })
}

export function supportDocumentViewJobOn(prisma: PrismaService) {
  return createSupportDocumentViewJob(() => defaultSupportDocumentViewDeps(prisma))
}

const dispatchedViewJob = createSupportDocumentViewJob(() => {
  throw new Error("PrepareSupportDocumentViewJob runs only in the worker, built with supportDocumentViewJobOn.")
})

export function dispatchSupportDocumentView(documentId: string, originalId: string): Promise<string> {
  return dispatch(dispatchedViewJob, { documentId, originalId })
}
