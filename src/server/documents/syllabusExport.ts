import type { PhpRecord } from "../configuration/phpValues"
import { scheduleWorkflowNotification, type NotificationScope } from "../notifications/store"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { signedDocumentVariables, type SignatureRecord, type SignedFacts } from "../syllabus/snapshotDocuments"
import { fingerprint, RENDERER_VERSION, validateBundle, type DocumentBundle, type DocumentRenderInput, type RenderedDocument } from "./syllabusRenderer"

export const EXPORT_DISK = "private"
export const NOT_APPROVED = "Solo una revisión aprobada puede generar documentos."
export const FOREIGN_REVISION = "La revisión no pertenece al expediente solicitado."
export const NO_LONGER_APPROVED = "La revisión dejó de estar aprobada."
export const OBJECT_MISMATCH = "El objeto privado existente no coincide con la exportación esperada."

export class ExportForbidden extends Error {}
export class ExportRejected extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super("rejected")
  }
}
export class ExportMissing extends Error {}

export type ExportArtifactRow = { id: string; state: string; requestedBy: string }
export type ExportActor = { id: string; roleAssignmentId: string | null }

export interface ExportRequestTx {
  existingArtifact(revisionId: string, key: string): Promise<ExportArtifactRow | null>
  lockSyllabus(syllabusId: string): Promise<boolean>
  lockRevision(revisionId: string): Promise<{ syllabusId: string; number: number } | null>
  approved(revisionId: string): Promise<boolean>
  insertArtifact(row: { id: string; revisionId: string; key: string; requestedBy: string; requestedAt: number }): Promise<void>
  dispatchExport(artifactId: string): void
  recordAudit(event: AuditEventInput): Promise<void>
}

export type ExportRequest = { revisionId: string; syllabusId: string; key: string; actor: ExportActor; now: number; newId: () => string }

export async function existingExport(lookup: Pick<ExportRequestTx, "existingArtifact">, revisionId: string, key: string, actorId: string): Promise<ExportArtifactRow | null> {
  const artifact = await lookup.existingArtifact(revisionId, key)
  if (artifact !== null && artifact.requestedBy !== actorId) throw new ExportForbidden()
  return artifact
}

export async function requestExport(tx: ExportRequestTx, request: ExportRequest): Promise<ExportArtifactRow> {
  if (!(await tx.lockSyllabus(request.syllabusId))) throw new ExportMissing()
  const revision = await tx.lockRevision(request.revisionId)
  if (revision === null) throw new ExportMissing()
  if (revision.syllabusId !== request.syllabusId) throw new ExportRejected({ revision: [FOREIGN_REVISION] })
  const existing = await existingExport(tx, request.revisionId, request.key, request.actor.id)
  if (existing !== null) return existing
  if (!(await tx.approved(request.revisionId))) throw new ExportRejected({ revision: [NOT_APPROVED] })
  const id = request.newId()
  await tx.insertArtifact({ id, revisionId: request.revisionId, key: request.key, requestedBy: request.actor.id, requestedAt: request.now })
  tx.dispatchExport(id)
  await tx.recordAudit({
    actorId: request.actor.id,
    roleAssignmentId: request.actor.roleAssignmentId,
    action: "documento.exportacion_solicitada",
    resourceType: "artefacto_exportacion",
    resourceId: id,
    result: "exito",
    metadata: { revision_number: revision.number, renderer_version: RENDERER_VERSION },
    occurredAt: request.now,
  })
  return { id, state: "pendiente", requestedBy: request.actor.id }
}

export type ExportSubject = {
  artifactId: string
  requestedBy: string
  requestedAt: string
  syllabusId: string
  subject: string
  code: string
  period: string
  revision: { id: string; number: number; fingerprint: string; submittedAt: number }
  snapshot: PhpRecord
}

export type StoredObjectRow = { id: string; mime: string; size: number; fingerprint: string }
export type NewStoredObject = { id: string; disk: string; path: string; name: string; mime: string; size: number; fingerprint: string; classification: string; ownerId: string; storedAt: number }

export interface ExportJobTx {
  notifications: NotificationScope
  lockArtifact(id: string): Promise<{ state: string; syllabusId: string; revisionNumber: number } | null>
  markRunning(id: string): Promise<void>
  complete(id: string, objectId: string, now: number): Promise<void>
  markFailed(id: string): Promise<void>
  teachersFor(syllabusId: string): Promise<string[]>
  administrators(): Promise<string[]>
  recordAudit(event: AuditEventInput): Promise<void>
}

export interface ExportJobStore {
  subject(artifactId: string): Promise<ExportSubject | null>
  approval(revisionId: string): Promise<{ approver: string; at: number } | null>
  signedFacts(syllabusId: string, revision: { id: string; number: number }): Promise<Pick<SignedFacts, "coordination" | "verification">>
  signatures(syllabusId: string): Promise<SignatureRecord[]>
  findObject(disk: string, path: string): Promise<StoredObjectRow | null>
  firstOrCreateObject(row: NewStoredObject): Promise<StoredObjectRow>
}

export type ExportJobDeps = {
  store: ExportJobStore
  transaction<T>(work: (tx: ExportJobTx) => Promise<T>): Promise<T>
  render(input: DocumentRenderInput): Promise<DocumentBundle>
  writeObject(disk: string, path: string, bytes: Buffer): Promise<void>
  now: () => number
  newId: () => string
}

function assertObjectMatches(object: StoredObjectRow, document: RenderedDocument): void {
  if (object.mime !== document.mime || object.size !== document.bytes.length || object.fingerprint !== fingerprint(document)) throw new Error(OBJECT_MISMATCH)
}

async function persistObject(deps: ExportJobDeps, subject: ExportSubject, document: RenderedDocument, path: string): Promise<StoredObjectRow> {
  const existing = await deps.store.findObject(EXPORT_DISK, path)
  if (existing !== null && !document.reproducible) return existing
  if (existing !== null) assertObjectMatches(existing, document)
  const row: NewStoredObject = {
    id: deps.newId(),
    disk: EXPORT_DISK,
    path,
    name: `silabo-revision-${subject.revision.number}.${document.extension}`,
    mime: document.mime,
    size: document.bytes.length,
    fingerprint: fingerprint(document),
    classification: "syllabus_export",
    ownerId: subject.requestedBy,
    storedAt: deps.now(),
  }
  await deps.writeObject(EXPORT_DISK, path, document.bytes)
  const object = await deps.store.firstOrCreateObject(row)
  assertObjectMatches(object, document)
  return object
}

export async function generateSyllabusExport(artifactId: string, deps: ExportJobDeps): Promise<void> {
  const proceed = await deps.transaction(async (tx) => {
    const artifact = await tx.lockArtifact(artifactId)
    if (artifact === null || artifact.state === "completado") return false
    await tx.markRunning(artifactId)
    return true
  })
  if (!proceed) return
  const subject = await deps.store.subject(artifactId)
  if (subject === null) throw new Error(`No query results for model [App\\Modules\\Documents\\Infrastructure\\Persistence\\Models\\ExportArtifact] ${artifactId}`)
  const approval = await deps.store.approval(subject.revision.id)
  if (approval === null) throw new Error(NO_LONGER_APPROVED)
  const facts = await deps.store.signedFacts(subject.syllabusId, subject.revision)
  const signatures = await deps.store.signatures(subject.syllabusId)
  const snapshot = {
    ...subject.snapshot,
    template_variables: signedDocumentVariables(subject.snapshot, { ...facts, submittedAt: subject.revision.submittedAt, approval, signatures }),
  }
  const bundle = await deps.render({
    subject: subject.subject,
    subjectCode: subject.code,
    academicPeriod: subject.period,
    revisionNumber: subject.revision.number,
    revisionFingerprint: subject.revision.fingerprint,
    generatedAt: subject.requestedAt,
    locale: "es-EC",
    snapshot,
  })
  await validateBundle(bundle)
  const pdf = await persistObject(deps, subject, bundle.pdf, `exports/${subject.revision.id}/${subject.artifactId}/syllabus.pdf`)
  await deps.transaction(async (tx) => {
    const locked = await tx.lockArtifact(artifactId)
    if (locked === null) throw new Error(`No query results for model [App\\Modules\\Documents\\Infrastructure\\Persistence\\Models\\ExportArtifact] ${artifactId}`)
    if (locked.state === "completado") return
    const now = deps.now()
    await tx.complete(artifactId, pdf.id, now)
    await scheduleWorkflowNotification(tx.notifications, {
      syllabusId: subject.syllabusId,
      eventType: "silabo.aprobado",
      deduplicationKey: `silabo.aprobado:${subject.revision.id}`,
      recipientIds: await tx.teachersFor(subject.syllabusId),
      revisionNumber: subject.revision.number,
      artifactId,
    })
    await tx.recordAudit({
      actorId: null,
      roleAssignmentId: null,
      action: "documento.exportacion_completada",
      resourceType: "artefacto_exportacion",
      resourceId: artifactId,
      result: "exito",
      metadata: { revision_number: subject.revision.number, pdf_object_id: pdf.id },
      occurredAt: now,
    })
  })
}

export async function failSyllabusExport(artifactId: string, deps: Pick<ExportJobDeps, "transaction" | "now">): Promise<void> {
  await deps.transaction(async (tx) => {
    const artifact = await tx.lockArtifact(artifactId)
    if (artifact === null || artifact.state === "completado") return
    const now = deps.now()
    await tx.markFailed(artifactId)
    await tx.recordAudit({
      actorId: null,
      roleAssignmentId: null,
      action: "documento.exportacion_fallida",
      resourceType: "artefacto_exportacion",
      resourceId: artifactId,
      result: "fallido",
      metadata: { error_code: "exportacion_documento_fallida" },
      occurredAt: now,
    })
    await scheduleWorkflowNotification(tx.notifications, {
      syllabusId: artifact.syllabusId,
      eventType: "documento.exportacion_fallida",
      deduplicationKey: `documento.exportacion_fallida:${artifactId}`,
      recipientIds: await tx.administrators(),
      revisionNumber: artifact.revisionNumber,
      artifactId,
    })
  })
}
