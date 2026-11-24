import "server-only"
import { createHash, randomUUID } from "node:crypto"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { laravelSlug } from "../documents/slug"
import { clientExtension, isMultipart, laravelMultipart, postMaxSize, postTooLarge, type UploadedFile } from "../files/uploads"
import { detectMimeType, guessExtension } from "../files/mimeType"
import { spreadsheetProblem } from "../files/spreadsheetCells"
import { isJsonRequest, isPhpArray, laravelInput, type PhpArray, type PhpValue } from "../laravel/input"
import { laravelHttpError, laravelJson, validationError } from "../laravel/responses"
import { phpDirname, storageWriter, type StorageWriter } from "../laravel/storageWriter"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../laravel/throttle"
import { uuid7 } from "../laravel/uuid7"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { Missing, settle } from "../syllabus/reviewDecisions"
import { isUuid } from "./structure"

export const SUPPORT_DISK = "private"
export const MAX_KILOBYTES = 20480
export const EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx"]
export const VIEW_PENDING = "pendiente"
export const VIEW_READY = "lista"
export const VIEW_NONE = "sin_vista"

export type StoredObjectInput = {
  id: string
  disk: string
  path: string
  name: string
  mime: string
  size: number
  sha256: string
  classification: string
  ownerId: string | null
  storedAt: number
}

export type SupportDocumentInput = {
  id: string
  careerId: string
  title: string
  objectId: string
  previewId: string | null
  view: string
  uploadedBy: string
  uploadedAt: number
}

export type StoredFile = { disk: string; path: string }

export type ReadableDocument = { id: string; careerId: string; title: string; view: string; preview: StoredFile | null }

export interface SupportDocumentTx {
  insertObject(row: StoredObjectInput): Promise<void>
  insertDocument(row: SupportDocumentInput): Promise<void>
  lockDocument(id: string): Promise<{ id: string; careerId: string; objectId: string; previewId: string | null } | null>
  objects(ids: string[]): Promise<StoredFile[]>
  deleteDocument(id: string): Promise<void>
  deleteObjects(ids: string[]): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export interface SupportDocumentWriteStore {
  careerActive(careerId: string): Promise<boolean>
  documentCareer(id: string): Promise<string | null>
  readable(id: string): Promise<ReadableDocument | null>
  transaction<T>(work: (tx: SupportDocumentTx, afterCommit: (callback: () => unknown) => void) => Promise<T>): Promise<T>
}

export type SupportDocumentWriteDeps = {
  bridge: BridgeDeps
  store: SupportDocumentWriteStore
  storage: StorageWriter
  limiter: RateLimiter
  now: () => number
  newDocumentId: () => string
  newObjectId: () => string
  dispatchView: (documentId: string) => Promise<unknown>
  maxPostSize: number
}

export function defaultSupportDocumentWriteDeps(store: SupportDocumentWriteStore, dispatchView: (documentId: string) => Promise<unknown>): SupportDocumentWriteDeps {
  return {
    bridge: defaultBridgeDeps(),
    store,
    storage: storageWriter(),
    limiter: sharedRateLimiter(),
    now: () => Math.floor(Date.now() / 1000),
    newDocumentId: randomUUID,
    newObjectId: uuid7,
    dispatchView,
    maxPostSize: postMaxSize(),
  }
}

const MESSAGES = {
  titleRequired: "Escriba el nombre del documento.",
  titleString: "El campo nombre debe ser una cadena de texto.",
  titleMax: "El nombre no puede pasar de 180 caracteres.",
  fileRequired: "Elija el archivo.",
  fileFile: "El campo archivo debe ser un archivo.",
  fileType: "Use un PDF, Word o Excel.",
  fileMax: "El archivo no puede superar los 20 MB.",
}

const PHP_EXTENSIONS = ["php", "php3", "php4", "php5", "php7", "php8", "phtml", "phar"]

const WIDE_RANGES: [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
]

function charWidth(character: string): number {
  const code = character.codePointAt(0) ?? 0
  return WIDE_RANGES.some(([from, to]) => code >= from && code <= to) ? 2 : 1
}

export function strLimit(value: string, limit: number): string {
  const characters = [...value]
  if (characters.reduce((sum, character) => sum + charWidth(character), 0) <= limit) return value
  let width = 0
  let result = ""
  for (const character of characters) {
    const next = charWidth(character)
    if (width + next > limit) break
    width += next
    result += character
  }
  return result.replace(/[ \t\n\r\0\x0B]+$/, "")
}

function isUploadedFile(value: PhpValue | UploadedFile | undefined): value is UploadedFile {
  return typeof value === "object" && value !== null && "bytes" in value && Buffer.isBuffer((value as UploadedFile).bytes)
}

function phpFilled(value: PhpValue | UploadedFile | undefined): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === "string") return value.trim() !== ""
  if (isUploadedFile(value)) return value.originalName !== "" || value.bytes.length > 0
  if (isPhpArray(value)) return Object.keys(value).length > 0
  return true
}

function stringLength(value: PhpValue): number {
  if (typeof value === "string") return [...value].length
  if (isPhpArray(value)) return Object.keys(value).length
  return [...String(value === true ? "1" : value === false ? "" : value)].length
}

function add(errors: Record<string, string[]>, key: string, message: string): void {
  errors[key] ??= []
  if (!errors[key].includes(message)) errors[key].push(message)
}

function normalizedTitle(value: PhpValue | undefined): PhpValue | undefined {
  return typeof value === "string" ? value.replace(/[\t\n\x0B\f\r\x85\u180E\p{Z}]+/gu, " ").replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "") : value
}

function validateTitle(title: PhpValue | undefined, errors: Record<string, string[]>): void {
  if (!phpFilled(title)) return add(errors, "title", MESSAGES.titleRequired)
  if (typeof title !== "string") add(errors, "title", MESSAGES.titleString)
  if (stringLength(title as PhpValue) > 180) add(errors, "title", MESSAGES.titleMax)
}

function validateFile(file: PhpValue | UploadedFile | undefined, errors: Record<string, string[]>): UploadedFile | null {
  if (!phpFilled(file)) {
    add(errors, "file", MESSAGES.fileRequired)
    return null
  }
  if (!isUploadedFile(file)) {
    add(errors, "file", MESSAGES.fileFile)
    add(errors, "file", MESSAGES.fileType)
    add(errors, "file", MESSAGES.fileType)
    if (stringLength(file as PhpValue) > MAX_KILOBYTES) add(errors, "file", MESSAGES.fileMax)
    return null
  }
  const extension = clientExtension(file.originalName).toLowerCase()
  if (!EXTENSIONS.includes(extension)) add(errors, "file", MESSAGES.fileType)
  const guessed = guessExtension(detectMimeType(file.bytes))
  if (PHP_EXTENSIONS.includes(extension) || guessed === null || !EXTENSIONS.includes(guessed)) add(errors, "file", MESSAGES.fileType)
  if (file.bytes.length / 1024 > MAX_KILOBYTES) add(errors, "file", MESSAGES.fileMax)
  return file
}

async function readBody(request: Request): Promise<{ input: PhpArray; files: Record<string, UploadedFile | null> } | null> {
  if (isMultipart(request)) return laravelMultipart(request)
  if (request.headers.get("content-type") === null || isJsonRequest(request)) return { input: await laravelInput(request), files: {} }
  return null
}

async function coordinationCareer(session: LaravelSession, deps: SupportDocumentWriteDeps): Promise<string | null> {
  const role = session.activeRole
  if (role === null || role.role !== "coordinador" || role.careerId === null || !(await deps.store.careerActive(role.careerId))) return null
  return role.careerId
}

async function readableCareer(session: LaravelSession, deps: SupportDocumentWriteDeps): Promise<string | null> {
  const role = session.activeRole
  if (role === null || !["coordinador", "docente"].includes(role.role) || role.careerId === null || !(await deps.store.careerActive(role.careerId))) return null
  return role.careerId
}

function audit(session: LaravelSession, deps: SupportDocumentWriteDeps, fields: Pick<AuditEventInput, "action" | "resourceId" | "metadata">): AuditEventInput {
  return { actorId: session.user.id, roleAssignmentId: session.activeRole?.id ?? null, resourceType: "documento_apoyo", result: "exito", occurredAt: deps.now(), ...fields }
}

function iso8601(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}+00:00`
}

function throttled(deps: SupportDocumentWriteDeps, limit: number | null): { gate: () => Throttle | null; requirements: Parameters<typeof requireSession>[1] } {
  let gate: Throttle | null = null
  return {
    gate: () => gate,
    requirements: {
      verified: true,
      activeRole: "required",
      afterAuthentication:
        limit === null
          ? undefined
          : async (user) => {
              gate = throttle(deps.limiter, { key: `throttle:${limit},1:${user.id}`, maxAttempts: limit, decaySeconds: 60 }, deps.bridge.now)
              return gate.hit()
            },
    },
  }
}

export async function storeSupportDocument(request: Request, deps: SupportDocumentWriteDeps): Promise<Response> {
  const tooLarge = postTooLarge(request, deps.maxPostSize)
  if (tooLarge !== null) return tooLarge
  const original = request.clone()
  const body = await readBody(request.clone())
  if (body === null || body.input._token !== undefined) return deps.bridge.forward(original)
  const { gate, requirements } = throttled(deps, 20)
  const finish = (response: Response) => gate()?.decorate(response) ?? response
  const session = await requireSession(request, requirements, deps.bridge)
  if (session instanceof Response) return finish(session)

  const title = normalizedTitle(body.input.title)
  const errors: Record<string, string[]> = {}
  validateTitle(title, errors)
  const file = validateFile(body.files.file !== undefined ? body.files.file : body.input.file, errors)
  if (errors.file === undefined && file !== null) {
    if ((await coordinationCareer(session, deps)) === null) return finish(laravelHttpError(403, ""))
    const problem = spreadsheetProblem(file.bytes, clientExtension(file.originalName))
    if (problem !== null) add(errors, "file", problem)
  }
  if (Object.keys(errors).length > 0) return finish(validationError(errors))
  const upload = file as UploadedFile
  const careerId = await coordinationCareer(session, deps)
  if (careerId === null) return finish(laravelHttpError(403, ""))

  const content = upload.bytes
  const extension = clientExtension(upload.originalName).toLowerCase()
  const id = deps.newDocumentId()
  const path = `documentos-apoyo/${careerId}/${id}/original.${extension}`
  const isPdf = extension === "pdf"
  await deps.storage.put(SUPPORT_DISK, path, content)
  const now = deps.now()
  const objectId = deps.newObjectId()
  try {
    await deps.store.transaction(async (tx) => {
      await tx.insertObject({
        id: objectId,
        disk: SUPPORT_DISK,
        path,
        name: strLimit(upload.originalName, 250),
        mime: detectMimeType(content),
        size: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
        classification: "documento_apoyo",
        ownerId: session.user.id,
        storedAt: now,
      })
      await tx.insertDocument({ id, careerId, title: title as string, objectId, previewId: isPdf ? objectId : null, view: isPdf ? VIEW_READY : VIEW_PENDING, uploadedBy: session.user.id, uploadedAt: now })
      await tx.recordAudit(audit(session, deps, { action: "academico.documento_apoyo.subida", resourceId: id, metadata: { carrera_id: careerId, archivo_id: objectId, tamano_bytes: content.length } }))
    })
  } catch (error) {
    await deps.storage.deleteDirectory(SUPPORT_DISK, phpDirname(path))
    throw error
  }
  if (!isPdf) await deps.dispatchView(id)
  return finish(
    laravelJson(
      { message: "Documento subido.", document: { id, title, size: content.length, view: isPdf ? VIEW_READY : VIEW_PENDING, uploaded_at: iso8601(now) } },
      201,
    ),
  )
}

export async function destroySupportDocument(request: Request, documentId: string, deps: SupportDocumentWriteDeps): Promise<Response> {
  const original = request.clone()
  if (!isUuid(documentId)) return deps.bridge.forward(original)
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const documentCareer = await deps.store.documentCareer(documentId)
  if (documentCareer === null) return deps.bridge.forward(original)
  const careerId = await coordinationCareer(session, deps)
  if (careerId === null) return laravelHttpError(403, "")
  if (careerId !== documentCareer) return laravelHttpError(404, "")
  return settle(original, deps, async () => {
    await deps.store.transaction(async (tx, afterCommit) => {
      const locked = await tx.lockDocument(documentId)
      if (locked === null) throw new Missing()
      const objectIds = [...new Set([locked.objectId, locked.previewId].filter((value): value is string => value !== null && value !== ""))]
      const objects = await tx.objects(objectIds)
      await tx.deleteDocument(locked.id)
      await tx.deleteObjects(objectIds)
      await tx.recordAudit(audit(session, deps, { action: "academico.documento_apoyo.eliminacion", resourceId: locked.id, metadata: { carrera_id: locked.careerId } }))
      afterCommit(async () => {
        for (const object of objects) {
          await deps.storage.delete(object.disk, object.path)
          await deps.storage.deleteDirectory(object.disk, phpDirname(object.path))
        }
      })
    })
    return laravelJson({ message: "Documento eliminado." })
  })
}

const VIEW_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
}

export async function viewSupportDocument(request: Request, documentId: string, deps: SupportDocumentWriteDeps): Promise<Response> {
  if (!isUuid(documentId)) return deps.bridge.forward(request)
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const document = await deps.store.readable(documentId)
  if (document === null) return deps.bridge.forward(request)
  const careerId = await readableCareer(session, deps)
  if (careerId === null) return laravelHttpError(403, "")
  if (careerId !== document.careerId) return laravelHttpError(404, "")
  const preview = document.view === VIEW_READY ? document.preview : null
  if (preview === null || !(await deps.storage.exists(preview.disk, preview.path))) return laravelHttpError(404, "")
  const bytes = await deps.storage.get(preview.disk, preview.path)
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...VIEW_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename=${laravelSlug(document.title) || "documento"}.pdf`,
    },
  })
}
