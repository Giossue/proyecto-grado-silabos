import { Readable } from "node:stream"
import type { PrismaService } from "../../prisma/prisma.service"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { storageWriter, type FileStorage, type StorageStat } from "../http/storageWriter"
import { requestInput, type PhpArray } from "../http/input"
import { aborted, forbidden, apiJson, validationError } from "../http/responses"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { idempotencySchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { settle } from "../syllabus/reviewDecisions"
import { ExportForbidden, ExportRejected, existingExport, requestExport, type ExportArtifactRow, type ExportRequestTx } from "./syllabusExport"
import { mayView } from "../syllabus/policy"
import type { ReviewRevision } from "../syllabus/reviewDetails"
import type { DetailSyllabus } from "../syllabus/syllabusDetail"
import { createDocumentRequestParts, createDocumentStore } from "./revisionDocumentsStore"
import { strSlug } from "./slug"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"
import { requireBound, type Binder } from "../syllabus/boundSession"

export type ArtifactRow = { id: string; state: string; requestedAt: string; completedAt: string | null; pdfSize: number | null }
export type StoredObject = { id: string; disk: string; path: string }
export type StoredArtifact = { id: string; revisionId: string; state: string; object: StoredObject | null }

export interface DocumentStore {
  revision(id: string): Promise<ReviewRevision | null>
  syllabus(id: string, userId: string): Promise<DetailSyllabus | null>
  approval(revisionId: string): Promise<{ approvedAt: string; approvedBy: string } | null>
  artifacts(revisionId: string): Promise<ArtifactRow[]>
  artifact(id: string): Promise<StoredArtifact | null>
}

export type DocumentDeps = { bridge: BridgeDeps; store: DocumentStore; now: () => number }

export function defaultDocumentDeps(prisma: PrismaService): DocumentDeps {
  return { bridge: defaultBridgeDeps(), store: createDocumentStore(prisma), now: () => Math.floor(Date.now() / 1000) }
}

const COMPLETED = "completado"
const DOWNLOAD_HEADERS: Record<string, string> = {
  "Cache-Control": "no-cache, private",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
}

export type RevisionBound = { revision: ReviewRevision; syllabus: DetailSyllabus }
export type ArtifactBound = RevisionBound & { artifact: StoredArtifact }

async function loaded(deps: Pick<DocumentDeps, "store">, revisionId: string, userId: string): Promise<{ revision: ReviewRevision; syllabus: DetailSyllabus } | null> {
  const revision = isUuid(revisionId) ? await deps.store.revision(revisionId) : null
  const syllabus = revision === null ? null : await deps.store.syllabus(revision.syllabusId, userId)
  return revision === null || syllabus === null ? null : { revision, syllabus }
}

export function revisionDocumentsBinder(revisionId: string, deps: Pick<DocumentDeps, "store">): Binder<RevisionBound> {
  return async (user) => (await loaded(deps, revisionId, user.id)) ?? modelNotFound(MODELS.revision, revisionId)
}

export async function revisionDocuments(request: Request, revisionId: string, deps: DocumentDeps): Promise<Response> {
  const bound = await requireBound(request, revisionDocumentsBinder(revisionId, deps), deps.bridge)
  if (bound instanceof Response) return bound
  return revisionDocumentsFor(bound.session, bound.bound, deps)
}

export async function revisionDocumentsFor(session: AppSession, { revision, syllabus }: RevisionBound, deps: DocumentDeps): Promise<Response> {
  if (!mayView(session, syllabus)) return forbidden()
  const approval = await deps.store.approval(revision.id)
  if (approval === null) return aborted(404)
  const artifacts = await deps.store.artifacts(revision.id)
  return apiJson({
    syllabus: { id: syllabus.id, subject: syllabus.subject, code: syllabus.code, period: syllabus.period },
    revision: { id: revision.id, number: revision.number, approved_at: approval.approvedAt, approved_by: approval.approvedBy },
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      estado: artifact.state,
      requested_at: artifact.requestedAt,
      completed_at: artifact.completedAt,
      renderer_label: "Formato institucional en revisión",
      error: artifact.state === "fallido" ? "No se pudo generar el PDF. Puede reintentar." : null,
      files: artifact.state !== COMPLETED || artifact.pdfSize === null ? null : { pdf_size: artifact.pdfSize },
    })),
  })
}

async function storedFile(storage: FileStorage, object: StoredObject | null): Promise<StorageStat | null> {
  if (object === null || object.disk !== "private") return null
  try {
    const found = await storage.stat("private", object.path)
    return found?.isFile ? found : null
  } catch {
    return null
  }
}

export function exportBinder(artifactId: string, deps: Pick<DocumentDeps, "store">): Binder<ArtifactBound> {
  return async (user) => {
    const artifact = isUuid(artifactId) ? await deps.store.artifact(artifactId) : null
    if (artifact === null) return modelNotFound(MODELS.artifact, artifactId)
    const revision = await loaded(deps, artifact.revisionId, user.id)
    return revision === null ? modelNotFound(MODELS.revision, artifactId) : { ...revision, artifact }
  }
}

export async function downloadExport(request: Request, artifactId: string, deps: DocumentDeps): Promise<Response> {
  const bound = await requireBound(request, exportBinder(artifactId, deps), deps.bridge)
  if (bound instanceof Response) return bound
  return downloadExportFor(bound.session, bound.bound)
}

export async function downloadExportFor(session: AppSession, { revision, syllabus, artifact: found }: ArtifactBound): Promise<Response> {
  if (!mayView(session, syllabus) || found.state !== COMPLETED) return forbidden()
  const storage = storageWriter()
  const file = await storedFile(storage, found.object)
  if (file === null || found.object === null) return aborted(404)
  const body = Readable.toWeb(await storage.stream("private", found.object.path)) as ReadableStream<Uint8Array>
  const code = strSlug(syllabus.code) || "asignatura"
  return new Response(body, {
    status: 200,
    headers: {
      ...DOWNLOAD_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename=silabo-${code}-revision-${revision.number}.pdf`,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export type DocumentRequestDeps = DocumentDeps & {
  limiter: RateLimiter
  existing(revisionId: string, key: string): Promise<ExportArtifactRow | null>
  transaction<T>(work: (tx: ExportRequestTx) => Promise<T>): Promise<T>
  newId(): string
}

export function defaultDocumentRequestDeps(prisma: PrismaService): DocumentRequestDeps {
  return { ...defaultDocumentDeps(prisma), limiter: sharedRateLimiter(), ...createDocumentRequestParts(prisma) }
}

async function settleRequest(original: Request, deps: DocumentRequestDeps, work: () => Promise<Response>): Promise<Response> {
  return settle(original, deps, async () => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof ExportForbidden) return aborted(403)
      if (error instanceof ExportRejected) return validationError(error.errors)
      throw error
    }
  })
}

export function documentRequestBinder(revisionId: string, deps: Pick<DocumentDeps, "store">): Binder<RevisionBound> {
  return async (user) => (isUuid(revisionId) ? await loaded(deps, revisionId, user.id) : null) ?? modelNotFound(MODELS.revision, revisionId)
}

export const DOCUMENT_REQUEST_LIMIT = { name: "throttle:20,1", maxAttempts: 20, decaySeconds: 60 }

export async function requestRevisionDocuments(request: Request, revisionId: string, deps: DocumentRequestDeps): Promise<Response> {
  let gate: Throttle | null = null
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  const binder = documentRequestBinder(revisionId, deps)
  const bound = await requireBound(
    request.clone(),
    async (user) => {
      gate = throttle(deps.limiter, { key: `${DOCUMENT_REQUEST_LIMIT.name}:${user.id}`, maxAttempts: DOCUMENT_REQUEST_LIMIT.maxAttempts, decaySeconds: DOCUMENT_REQUEST_LIMIT.decaySeconds }, deps.bridge.now)
      const limited = await gate.hit()
      return limited ?? binder(user)
    },
    deps.bridge,
  )
  if (bound instanceof Response) return finish(bound)
  return finish(await requestRevisionDocumentsFor(request, bound.session, bound.bound, deps))
}

export async function requestRevisionDocumentsFor(request: Request, session: AppSession, { revision, syllabus }: RevisionBound, deps: DocumentRequestDeps): Promise<Response> {
  const original = request.clone()
  if (!mayView(session, syllabus)) return forbidden()
  const input: PhpArray = await requestInput(request)
  const { errors } = await validateSchema(idempotencySchema, input)
  if (errors !== null) return validationError(errors)
  const key = input.idempotency_key as string
  const actor = { id: session.user.id }
  return settleRequest(original, deps, async () => {
    const artifact =
      (await existingExport({ existingArtifact: deps.existing }, revision.id, key, actor.id)) ??
      (await deps.transaction((tx) => requestExport(tx, { revisionId: revision.id, syllabusId: revision.syllabusId, key, actor, now: deps.now(), newId: deps.newId })))
    return apiJson({ message: artifact.state === COMPLETED ? "El PDF ya estaba disponible." : "El PDF se está generando.", artifact_id: artifact.id }, 202)
  })
}
