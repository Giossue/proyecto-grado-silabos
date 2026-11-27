import { createHash, timingSafeEqual } from "node:crypto"
import { requireSession } from "../auth/requireSession"
import { activeCareerId, resolveCareerScope } from "../academic/careerScope"
import type { AppSession } from "../auth/types"
import { freeTextNormalize } from "../configuration/freeText"
import { markTeacherEdits, teacherEdits } from "../configuration/teacherText"
import { list, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { careerProfileLockReason, profileContext } from "../configuration/subjectProfile"
import { profileFields } from "../configuration/subjectProfileFields"
import { fieldResponseNormalize } from "../configuration/templateRehearsal"
import { fieldSection, type TemplateField } from "../configuration/templatePresentation"
import { responseWithin, careerResponse, foundResponses, isDocument, keepOwnOptions, keepTeacherFills, plainText, responseIsEmpty, TemplateValidationError, type TemplateDefinition } from "../configuration/templateRuntime"
import type { TemplateStore } from "../shared/templateStore"
import { importSession, readUpload, type ImportDeps, type ImportFileRules } from "../excel/importRequest"
import { xlsxDownload } from "../excel/workbook"
import type { UploadedFile } from "../files/uploads"
import { definitionHash } from "./definitionHash"
import { jsonError, apiJson, validationError } from "../http/responses"
import { fichaApplySchema } from "@silabos/shared/schemas/imports"
import type { PhpArray, PhpValue } from "../http/input"
import { requestBoolean } from "../syllabus/inProgressWorkHelpers"
import { Rejected, settle } from "../syllabus/reviewDecisions"
import { fichaClean, fichaCoverage, fichaDocument, fichaSchema } from "./fichaFieldValues"
import { createFichaWorkbook, FICHA_FORMAT, fichaFingerprint, readFichaWorkbook, type FichaDefinition, type FichaEntry, type FichaField, type FichaSubject } from "./fichaWorkbook"

export type FichaReader = {
  store: TemplateStore
  activeCareer(careerId: string): Promise<{ id: string; name: string } | null>
  subjects(careerId: string): Promise<FichaSubject[]>
}

export type CurrentValue = { subjectId: string; fieldId: string; value: unknown }

export type FichaImportStore = FichaReader & {
  careerActive(careerId: string): Promise<boolean>
  careerEditable(careerId: string): Promise<boolean>
  currentValues(subjectIds: string[], fieldIds: string[]): Promise<CurrentValue[]>
}

export interface FichaApplyTx extends FichaReader {
  lockCareer(careerId: string): Promise<void>
  careerEditable(careerId: string): Promise<boolean>
  storedValue(subjectId: string, fieldId: string): Promise<unknown>
  saveValue(subjectId: string, fieldId: string, document: PhpRecord): Promise<void>
  keepContent<T>(confirmed: boolean, careerId: string, subjectIds: string[], change: () => Promise<T>): Promise<T>
}

export type FichaImportDeps = ImportDeps & {
  store: FichaImportStore
  now: () => number
  transaction<T>(work: (tx: FichaApplyTx) => Promise<T>): Promise<T>
}

const CAREER_MODEL = "App\\Modules\\Academic\\Infrastructure\\Persistence\\Models\\Career"
const NO_BLOCKS = { document: {}, variables: {}, blocks: {} } as unknown as TemplateDefinition

const FICHA_FILE: ImportFileRules = {
  attribute: "archivo Excel",
  maxKilobytes: 20480,
  messages: {
    required: "Elija el Excel que completó.",
    mimes: "Use la plantilla Excel (.xlsx) descargada desde el sitio.",
    max: "El Excel no puede superar los 20 MB.",
  },
}

class CareerMissing extends Error {}

type Context = { definition: FichaDefinition; fields: TemplateField[]; template: TemplateDefinition | null }

function rejectWith(errors: Record<string, string[]>): never {
  throw new Rejected(validationError(errors))
}

async function closedFor(session: AppSession, careerId: string, careerEditable: (careerId: string) => Promise<boolean>): Promise<Response | null> {
  const reason = await careerProfileLockReason(session, careerId, careerEditable)
  return reason === null ? null : validationError({ process: [reason] })
}

function careerContext(session: AppSession, store: Pick<FichaImportStore, "careerActive">, requestedCareerId: string | null): Promise<string | Response> {
  return resolveCareerScope(session, requestedCareerId, activeCareerId((careerId) => store.careerActive(careerId)), () => jsonError(403, ""))
}

function sheetName(index: number, label: string): string {
  const prefix = `${String(index + 1).padStart(2, "0")} `
  const name = phpTrim(label.replace(/[\\/?*[\]:']/g, " "))
  const characters = [...(name !== "" ? name : "Campo")]
  return prefix + characters.slice(0, Math.max(0, 31 - [...prefix].length)).join("")
}

async function fichaContext(careerId: string, reader: FichaReader): Promise<Context> {
  const career = await reader.activeCareer(careerId)
  if (career === null) throw new CareerMissing()
  const profile = await profileContext(reader.store)
  const live = profile === null ? [] : profileFields(profile)
  const fields: FichaField[] = live.map((field, index) => {
    const section = profile === null ? null : fieldSection(profile.template, field)
    const schema = fichaSchema(field, section?.title ?? "", (profile as NonNullable<typeof profile>).definition)
    return {
      ...schema,
      id: field.id,
      section: section?.title ?? "",
      sheet: sheetName(index, schema.label),
      definition_hash: definitionHash(field.content),
    }
  })
  const subjects = await reader.subjects(careerId)
  if (fields.length === 0 || subjects.length === 0) {
    throw new TemplateValidationError({ file: ["Para generar el Excel debe haber materias activas y campos de la plantilla asignados a Coordinación."] })
  }
  return { definition: { careerId, careerName: career.name, fields, subjects }, fields: live, template: profile?.definition ?? null }
}

function contextFailure(error: unknown, careerId: string): Response {
  if (error instanceof CareerMissing) return jsonError(404, `No query results for model [${CAREER_MODEL}] ${careerId}`)
  if (error instanceof TemplateValidationError) return validationError(error.errors)
  throw error
}

export async function fichaTemplate(request: Request, deps: FichaImportDeps, requestedCareerId: string | null = null): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const careerId = await careerContext(session, deps.store, requestedCareerId)
  if (careerId instanceof Response) return careerId
  const closed = await closedFor(session, careerId, deps.store.careerEditable)
  if (closed !== null) return closed
  try {
    const { definition } = await fichaContext(careerId, deps.store)
    return xlsxDownload(await createFichaWorkbook(definition, { now: deps.now() }), "proyecto-carrera.xlsx", "no-store, private")
  } catch (error) {
    return contextFailure(error, careerId)
  }
}

type Preview = Context & { fileHash: string; subjects: FichaEntry[] }

async function previewWorkbook(file: UploadedFile, session: AppSession, deps: FichaImportDeps, requestedCareerId: string | null): Promise<Preview | Response> {
  const careerId = await careerContext(session, deps.store, requestedCareerId)
  if (careerId instanceof Response) return careerId
  const closed = await closedFor(session, careerId, deps.store.careerEditable)
  if (closed !== null) return closed
  try {
    const context = await fichaContext(careerId, deps.store)
    const subjects = readFichaWorkbook(file.bytes, context.definition)
    if (fichaFingerprint((await fichaContext(careerId, deps.store)).definition) !== fichaFingerprint(context.definition)) {
      return validationError({ file: ["La plantilla o las materias cambiaron durante la lectura. Descargue un Excel nuevo."] })
    }
    return { ...context, fileHash: createHash("sha256").update(file.bytes).digest("hex"), subjects }
  } catch (error) {
    return contextFailure(error, careerId)
  }
}

function excelDocument(field: TemplateField, value: unknown, definition: TemplateDefinition): PhpRecord | null {
  const columns = fichaSchema(field, "", definition).columns
  const document = fichaDocument(fichaClean(value, columns), field.content, definition)
  return responseIsEmpty(field.content, fieldResponseNormalize(field.content, document, definition, "value"), definition) ? null : document
}

function importedDocument(field: TemplateField, document: PhpRecord, stored: unknown, definition: TemplateDefinition): PhpRecord {
  const kept = keepOwnOptions(field.content, document, stored, definition, "file")
  return freeTextNormalize(careerResponse(field.content, kept, definition, "value"))
}

type AnswerSpace = { kind: string; options: string[] }

function answerSpaces(document: unknown): AnswerSpace[] {
  return foundResponses(document)
    .map((attrs) => record(attrs))
    .map((attrs) => ({ kind: String(attrs.kind), options: list(attrs.options ?? []).map((option) => String(record(option).title)) }))
}

function removedAnswers(field: TemplateField, value: unknown, stored: unknown, definition: TemplateDefinition): AnswerSpace[] | null {
  const before = answerSpaces(stored)
  if (before.length === 0) return null
  try {
    const document = excelDocument(field, value, definition)
    if (document === null) return null
    const after = answerSpaces(importedDocument(field, document, stored, definition)).map((space) => JSON.stringify(space))
    const lost = before.filter((space) => {
      const kept = after.indexOf(JSON.stringify(space))
      if (kept >= 0) after.splice(kept, 1)
      return kept < 0
    })
    return lost.length === 0 ? null : lost
  } catch (error) {
    if (error instanceof TemplateValidationError) return null
    throw error
  }
}

function removedBySubject(preview: Preview, entry: FichaEntry, stored: Map<string, unknown>): Record<string, AnswerSpace[]> {
  const removed: Record<string, AnswerSpace[]> = {}
  for (const field of preview.fields) {
    if (!Object.prototype.hasOwnProperty.call(entry.values, field.key)) continue
    const lost = removedAnswers(field, entry.values[field.key], stored.get(`${entry.subject_id}:${field.id}`), preview.template as TemplateDefinition)
    if (lost !== null) removed[field.key] = lost
  }
  return removed
}

async function previewDetail(preview: Preview, deps: FichaImportDeps): Promise<PhpRecord> {
  const fields = preview.definition.fields.map((field) => ({ key: field.key, label: field.label, columns: field.columns }))
  const keysById = new Map(preview.definition.fields.map((field) => [field.id, field.key]))
  const current = new Map<string, Record<string, string>>()
  const rows = await deps.store.currentValues(
    preview.subjects.map((entry) => entry.subject_id),
    preview.definition.fields.map((field) => field.id),
  )
  const stored = new Map(rows.map((row) => [`${row.subjectId}:${row.fieldId}`, row.value]))
  for (const row of rows) {
    const text = isDocument(row.value) ? phpTrim(plainText(freeTextNormalize(row.value), NO_BLOCKS)) : ""
    if (text === "") continue
    const subject = current.get(row.subjectId) ?? {}
    subject[keysById.get(row.fieldId) ?? ""] = text
    current.set(row.subjectId, subject)
  }
  return {
    format: FICHA_FORMAT,
    fingerprint: fichaFingerprint(preview.definition),
    file_hash: preview.fileHash,
    fields,
    subjects: preview.subjects.map((entry) => {
      const removed = removedBySubject(preview, entry, stored)
      return {
        subject_id: entry.subject_id,
        code: entry.code,
        name: entry.name,
        cycle: entry.cycle,
        state: entry.state,
        values: entry.values,
        replaces: current.has(entry.subject_id) || Object.keys(removed).length > 0,
        current: current.get(entry.subject_id) ?? {},
        removed_answers: removed,
        ...fichaCoverage(entry, fields),
      }
    }),
  }
}

export async function previewFichaImport(request: Request, deps: FichaImportDeps, requestedCareerId: string | null = null): Promise<Response> {
  const ready = await importSession(request, deps, 20)
  if (ready instanceof Response) return ready
  const { session, finish } = ready
  const read = await readUpload(request, FICHA_FILE)
  if ("errors" in read) return finish(validationError(read.errors))
  try {
    const preview = await previewWorkbook(read.upload.file, session, deps, requestedCareerId)
    if (preview instanceof Response) return finish(preview)
    return finish(apiJson({ preview: await previewDetail(preview, deps) }))
  } catch (error) {
    if (error instanceof TemplateValidationError) return finish(validationError(error.errors))
    throw error
  }
}


function stringsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === "object" && value !== null) return Object.values(value).map((item) => String(item))
  return []
}

function safeEquals(known: string, given: string): boolean {
  const left = Buffer.from(known)
  const right = Buffer.from(given)
  return left.length === right.length && timingSafeEqual(left, right)
}

function assertSelection(preview: Preview, subjectIds: string[], fieldsBySubject: Map<string, string[]> | null): void {
  const entries = new Map(preview.subjects.map((entry) => [entry.subject_id, entry]))
  if (fieldsBySubject !== null && [...fieldsBySubject.keys()].some((key) => !subjectIds.includes(key))) {
    rejectWith({ fields: ["Los campos deben pertenecer a las materias seleccionadas."] })
  }
  for (const subjectId of subjectIds) {
    const entry = entries.get(subjectId)
    if (entry === undefined || entry.state !== "lista") rejectWith({ subjects: ["Seleccione únicamente materias de su carrera con contenido en el Excel."] })
    const keys = Object.keys(entry.values)
    const chosen = fieldsBySubject?.get(subjectId) ?? keys
    if (chosen.length === 0 || chosen.some((key) => !keys.includes(key))) rejectWith({ fields: ["Seleccione al menos un campo con contenido del Excel en cada materia."] })
  }
}

async function applyEntries(
  tx: FichaApplyTx,
  session: AppSession,
  preview: Preview,
  subjectIds: string[],
  fieldsBySubject: Map<string, string[]> | null,
): Promise<number> {
  const careerId = preview.definition.careerId
  await tx.lockCareer(careerId)
  const closed = await closedFor(session, careerId, tx.careerEditable)
  if (closed !== null) throw new Rejected(closed)
  let fresh: Context
  try {
    fresh = await fichaContext(careerId, tx)
  } catch (error) {
    if (error instanceof CareerMissing) throw new Rejected(jsonError(404, `No query results for model [${CAREER_MODEL}] ${careerId}`))
    throw error
  }
  if (fichaFingerprint(preview.definition) !== fichaFingerprint(fresh.definition)) {
    rejectWith({ file: ["La plantilla o las materias cambiaron. Descargue un Excel nuevo y vuelva a preparar la vista previa."] })
  }
  const definition = fresh.template as TemplateDefinition
  const fields = new Map<string, TemplateField>()
  for (const field of fresh.fields) fields.set(field.key, field)
  let applied = 0
  for (const entry of preview.subjects) {
    if (!subjectIds.includes(entry.subject_id) || entry.state !== "lista") continue
    const chosen = fieldsBySubject?.get(entry.subject_id) ?? null
    let changed = false
    for (const [key, value] of Object.entries(entry.values)) {
      if (chosen !== null && !chosen.includes(key)) continue
      const field = fields.get(key)
      if (field === undefined) continue
      const document = excelDocument(field, value, definition)
      if (document === null) continue
      const stored = await tx.storedValue(entry.subject_id, field.id)
      const imported = importedDocument(field, document, stored, definition)
      await tx.saveValue(entry.subject_id, field.id, teacherEdits(stored) && !responseWithin(imported) ? markTeacherEdits(imported) : keepTeacherFills(field.content, imported, stored, definition))
      changed = true
    }
    if (!changed) rejectWith({ subjects: ["Elija al menos un campo con contenido en cada materia seleccionada."] })
    applied++
  }
  if (applied === 0) rejectWith({ subjects: ["Elija al menos una materia con proyecto de carrera propuesto."] })
  return applied
}

function chosenFields(input: PhpArray): Map<string, string[]> | null {
  const fields = input.fields
  if (fields === undefined || fields === null || typeof fields !== "object") return null
  const chosen = new Map<string, string[]>()
  for (const [subjectId, keys] of Object.entries(fields as Record<string, PhpValue>)) chosen.set(subjectId, stringsOf(keys))
  return chosen
}

export async function applyFichaImport(request: Request, deps: FichaImportDeps, requestedCareerId: string | null = null): Promise<Response> {
  const ready = await importSession(request, deps, 20)
  if (ready instanceof Response) return ready
  const { session, original, finish } = ready
  const read = await readUpload(request, FICHA_FILE, fichaApplySchema)
  if ("errors" in read) return finish(validationError(read.errors))
  const { input, file } = read.upload
  const subjectIds = stringsOf(input.subjects)
  const fieldsBySubject = chosenFields(input)
  return finish(
    await settle(original, deps, async () => {
      try {
        const preview = await previewWorkbook(file, session, deps, requestedCareerId)
        if (preview instanceof Response) return preview
        if (!safeEquals(fichaFingerprint(preview.definition), String(input.fingerprint)) || !safeEquals(preview.fileHash, String(input.file_hash))) {
          return validationError({ file: ["El Excel o la estructura cambió desde la vista previa. Vuelva a revisar el archivo antes de aplicar."] })
        }
        assertSelection(preview, subjectIds, fieldsBySubject)
        const careerId = preview.definition.careerId
        const applied = await deps.transaction((tx) =>
          tx.keepContent(requestBoolean(input.confirm_purge), careerId, subjectIds, () => applyEntries(tx, session, preview, subjectIds, fieldsBySubject)),
        )
        return apiJson({ message: "Proyecto de carrera aplicado.", applied })
      } catch (error) {
        if (error instanceof TemplateValidationError) return validationError(error.errors)
        throw error
      }
    }),
  )
}
