import { convertFile, gotenbergEnabled, gotenbergSettings } from "../documents/gotenbergConverter"
import { storageWriter } from "../http/storageWriter"
import { uuid7 } from "../http/uuid7"
import { dispatch } from "../queue/dispatch"
import { defineJob } from "../queue/job"
import { failSupportDocumentView, prepareSupportDocumentView, type SupportDocumentViewDeps } from "./supportDocumentView"
import { createSupportDocumentViewStore } from "./supportDocumentWriteStore"

export type SupportDocumentViewData = { documentId: string }

export function defaultSupportDocumentViewDeps(): SupportDocumentViewDeps {
  return {
    store: createSupportDocumentViewStore(),
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
    uniqueId: (data) => data.documentId,
    runsOnce: true,
    handle: (data) => prepareSupportDocumentView(data.documentId, deps()),
    failed: (data, error) => failSupportDocumentView(data.documentId, error, deps()),
  })
}

export const supportDocumentViewJob = createSupportDocumentViewJob(defaultSupportDocumentViewDeps)

export function dispatchSupportDocumentView(documentId: string): Promise<string> {
  return dispatch(supportDocumentViewJob, { documentId })
}
