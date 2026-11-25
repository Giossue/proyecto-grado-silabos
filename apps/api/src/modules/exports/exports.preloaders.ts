import { documentRequestBinder, exportBinder, revisionDocumentsBinder, type DocumentDeps, type DocumentRequestDeps } from "../../server/documents/revisionDocuments"
import { bindingPreloader } from "../syllabus/binding.preloader"
import { DOCUMENT_DEPS, DOCUMENT_REQUEST_DEPS } from "./exports.tokens"

export const RevisionDocumentsPreloader = bindingPreloader<DocumentDeps>(DOCUMENT_DEPS, (deps, params) => revisionDocumentsBinder(params.revision, deps))
export const DocumentRequestPreloader = bindingPreloader<DocumentRequestDeps>(DOCUMENT_REQUEST_DEPS, (deps, params) => documentRequestBinder(params.revision, deps))
export const ExportPreloader = bindingPreloader<DocumentDeps>(DOCUMENT_DEPS, (deps, params) => exportBinder(params.artifact, deps))
