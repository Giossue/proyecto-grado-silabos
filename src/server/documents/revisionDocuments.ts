import "server-only"
import { readFile } from "node:fs/promises"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { diskExists, diskPath } from "../laravel/storage"
import { isJsonRequest, laravelInput, type PhpArray } from "../laravel/input"
import { aborted, forbidden, laravelJson, validationError } from "../laravel/responses"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../laravel/throttle"
import { validateInput } from "../laravel/validation"
import { Missing, settle } from "../syllabus/reviewDecisions"
import { ExportForbidden, ExportMissing, ExportRejected, existingExport, requestExport, type ExportArtifactRow, type ExportRequestTx } from "./syllabusExport"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { mayView } from "../syllabus/policy"
import type { ReviewRevision } from "../syllabus/reviewDetails"
import type { DetailSyllabus } from "../syllabus/syllabusDetail"
import { createDocumentRequestParts, createDocumentStore } from "./revisionDocumentsStore"
import { laravelSlug } from "./slug"

export type ArtifactRow = { id: string; state: string; requestedAt: string; completedAt: string | null; pdfSize: number | null }
export type StoredObject = { id: string; disk: string; path: string }
export type StoredArtifact = { id: string; revisionId: string; state: string; object: StoredObject | null }

export interface DocumentStore {
  revision(id: string): Promise<ReviewRevision | null>
  syllabus(id: string, userId: string): Promise<DetailSyllabus | null>
  approval(revisionId: string): Promise<{ approvedAt: string; approvedBy: string } | null>
  artifacts(revisionId: string): Promise<ArtifactRow[]>
  artifact(id: string): Promise<StoredArtifact | null>
  recordAudit(event: AuditEventInput): Promise<void>
}

export type DocumentDeps = { bridge: BridgeDeps; store: DocumentStore; now: () => number }

export function defaultDocumentDeps(): DocumentDeps {
  return { bridge: defaultBridgeDeps(), store: createDocumentStore(), now: () => Math.floor(Date.now() / 1000) }
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

type Bound = { session: LaravelSession; revision: ReviewRevision; syllabus: DetailSyllabus }

async function bindRevision(request: Request, revisionId: string, deps: DocumentDeps, load: (userId: string) => Promise<{ revision: ReviewRevision; syllabus: DetailSyllabus } | null>): Promise<Bound | Response> {
  let bound: { revision: ReviewRevision; syllabus: DetailSyllabus } | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        bound = await load(user.id)
        return bound === null ? deps.bridge.forward(request) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (bound === null) return deps.bridge.forward(request)
  void revisionId
  return { session, ...(bound as { revision: ReviewRevision; syllabus: DetailSyllabus }) }
}

async function loaded(deps: DocumentDeps, revisionId: string, userId: string): Promise<{ revision: ReviewRevision; syllabus: DetailSyllabus } | null> {
  const revision = await deps.store.revision(revisionId)
  const syllabus = revision === null ? null : await deps.store.syllabus(revision.syllabusId, userId)
  return revision === null || syllabus === null ? null : { revision, syllabus }
}

export async function revisionDocuments(request: Request, revisionId: string, deps: DocumentDeps = defaultDocumentDeps()): Promise<Response> {
  if (!isUuid(revisionId)) return deps.bridge.forward(request)
  const bound = await bindRevision(request, revisionId, deps, (userId) => loaded(deps, revisionId, userId))
  if (bound instanceof Response) return bound
  const { session, revision, syllabus } = bound
  if (!mayView(session, syllabus)) return forbidden()
  const approval = await deps.store.approval(revision.id)
  if (approval === null) return aborted(404)
  const artifacts = await deps.store.artifacts(revision.id)
  return laravelJson({
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

async function storedFile(object: StoredObject | null): Promise<string | null> {
  if (object === null || object.disk !== "private") return null
  try {
    return (await diskExists("private", object.path)) ? diskPath("private", object.path) : null
  } catch {
    return null
  }
}

export async function downloadExport(request: Request, artifactId: string, deps: DocumentDeps = defaultDocumentDeps()): Promise<Response> {
  if (!isUuid(artifactId)) return deps.bridge.forward(request)
  let artifact: StoredArtifact | null = null
  const bound = await bindRevision(request, artifactId, deps, async (userId) => {
    artifact = await deps.store.artifact(artifactId)
    return artifact === null ? null : loaded(deps, artifact.revisionId, userId)
  })
  if (bound instanceof Response) return bound
  const found = artifact as StoredArtifact | null
  if (found === null) return deps.bridge.forward(request)
  const { session, revision, syllabus } = bound
  if (!mayView(session, syllabus) || found.state !== COMPLETED) return forbidden()
  const file = await storedFile(found.object)
  if (file === null || found.object === null) return aborted(404)
  await deps.store.recordAudit({
    actorId: session.user.id,
    roleAssignmentId: session.activeRole?.id ?? null,
    action: "documento.descargado",
    resourceType: "artefacto_exportacion",
    resourceId: found.id,
    result: "exito",
    metadata: { format: "pdf", revision_number: revision.number, object_id: found.object.id },
    occurredAt: deps.now(),
  })
  const bytes = await readFile(/*turbopackIgnore: true*/ file)
  const code = laravelSlug(syllabus.code) || "asignatura"
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...DOWNLOAD_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename=silabo-${code}-revision-${revision.number}.pdf`,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export type DocumentRequestDeps = DocumentDeps & {
  limiter: RateLimiter
  renderable(revisionId: string): Promise<boolean>
  existing(revisionId: string, key: string): Promise<ExportArtifactRow | null>
  transaction<T>(work: (tx: ExportRequestTx) => Promise<T>): Promise<T>
  newId(): string
}

export function defaultDocumentRequestDeps(): DocumentRequestDeps {
  return { ...defaultDocumentDeps(), limiter: sharedRateLimiter(), ...createDocumentRequestParts() }
}

async function settleRequest(original: Request, deps: DocumentRequestDeps, work: () => Promise<Response>): Promise<Response> {
  return settle(original, deps, async () => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof ExportForbidden) return aborted(403)
      if (error instanceof ExportRejected) return validationError(error.errors)
      if (error instanceof ExportMissing) throw new Missing()
      throw error
    }
  })
}

export async function requestRevisionDocuments(request: Request, revisionId: string, deps: DocumentRequestDeps = defaultDocumentRequestDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  if (!isUuid(revisionId)) return deps.bridge.forward(original)
  let gate: Throttle | null = null
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  let bound: { revision: ReviewRevision; syllabus: DetailSyllabus } | null = null
  const session = await requireSession(
    original,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        gate = throttle(deps.limiter, { key: `throttle:20,1:${user.id}`, maxAttempts: 20, decaySeconds: 60 }, deps.bridge.now)
        const limited = await gate.hit()
        if (limited !== null) return limited
        bound = await loaded(deps, revisionId, user.id)
        return bound === null ? deps.bridge.forward(original) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return finish(session)
  const found = bound as { revision: ReviewRevision; syllabus: DetailSyllabus } | null
  if (found === null) return finish(await deps.bridge.forward(original))
  const { revision, syllabus } = found
  if (!mayView(session, syllabus)) return finish(forbidden())
  const input: PhpArray = await laravelInput(request)
  const errors = await validateInput(input, { idempotency_key: ["required", "uuid"] }, { idempotency_key: "identificador de la solicitud" })
  if (Object.keys(errors).length > 0) return finish(validationError(errors))
  if (!(await deps.renderable(revision.id))) return finish(await deps.bridge.forward(original))
  const key = input.idempotency_key as string
  const actor = { id: session.user.id, roleAssignmentId: session.activeRole?.id ?? null }
  return finish(
    await settleRequest(original, deps, async () => {
      const artifact =
        (await existingExport({ existingArtifact: deps.existing }, revision.id, key, actor.id)) ??
        (await deps.transaction((tx) => requestExport(tx, { revisionId: revision.id, syllabusId: revision.syllabusId, key, actor, now: deps.now(), newId: deps.newId })))
      return laravelJson({ message: artifact.state === COMPLETED ? "El PDF ya estaba disponible." : "El PDF se está generando.", artifact_id: artifact.id }, 202)
    }),
  )
}
