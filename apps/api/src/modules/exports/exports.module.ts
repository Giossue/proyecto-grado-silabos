import { Module, type Provider } from "@nestjs/common"
import { defaultDocumentDeps, defaultDocumentRequestDeps } from "../../server/documents/revisionDocuments"
import type { BridgeDeps } from "../../server/auth/types"
import type { RateLimiter } from "../../server/http/throttle"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { DocumentsController } from "./documents.controller"
import { DocumentRequestPreloader, ExportPreloader, RevisionDocumentsPreloader } from "./exports.preloaders"
import { DOCUMENT_DEPS, DOCUMENT_REQUEST_DEPS } from "./exports.tokens"

const DEPS: Provider[] = [
  { provide: DOCUMENT_DEPS, useFactory: (bridge: BridgeDeps) => ({ ...defaultDocumentDeps(), bridge }), inject: [AUTH_BRIDGE] },
  { provide: DOCUMENT_REQUEST_DEPS, useFactory: (bridge: BridgeDeps, limiter: RateLimiter) => ({ ...defaultDocumentRequestDeps(), bridge, limiter }), inject: [AUTH_BRIDGE, RATE_LIMITER] },
]

@Module({
  controllers: [DocumentsController],
  providers: [...DEPS, RevisionDocumentsPreloader, DocumentRequestPreloader, ExportPreloader],
})
export class ExportsModule {}
