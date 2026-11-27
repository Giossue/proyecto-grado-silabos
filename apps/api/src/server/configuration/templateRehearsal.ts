import { randomUUID } from "node:crypto"
import { uuid7 } from "../http/uuid7"
import { isPhpArray, isRecord, phpEquals, phpIdentical, phpTrim, list, record, type PhpRecord } from "./phpValues"
import {
  adopt,
  blank,
  INSTITUTIONAL,
  isDocument,
  matches,
  normalizeFieldDocument,
  plainText,
  responsesEnabled,
  responseTemplate,
  teacherOwnText,
  TemplateValidationError,
  withoutOwnOptions,
  type TemplateDefinition,
} from "./templateRuntime"
import {
  IDENTIFICATION_SAMPLE,
  presentSections,
  syllabusSectionPayload,
  teacherEditable,
  templateFields,
  type SyllabusTemplate,
  type TemplateField,
  type TemplateSection,
} from "./templatePresentation"
import { profileTemplates, type ProfileContext } from "./subjectProfileFields"
import { hasOwnText, openShape, teacherEdits, writtenValue } from "./teacherText"
import { contentForField, type DraftSection } from "./templateDraft"
import type { LiveField, StoredValue, TemplateStore } from "../shared/templateStore"

export const REHEARSAL_UNAVAILABLE = "No se pudo calcular qué sílabos cambian ahora."
export const PREVIEW_UNAVAILABLE = "No se pudo armar la vista previa ahora. Intente de nuevo."
const SENT_STATES = ["en_revision", "correccion_solicitada", "aprobado"]

export type ImpactCounts = { in_progress: number; keep: number; lose: number; back_to_draft: number }
export type ImpactCareer = { name: string } & ImpactCounts
export type DraftImpact = { affected: boolean; counted: boolean; message?: string; careers: ImpactCareer[] } & ImpactCounts

export const NO_IMPACT: DraftImpact = { affected: false, counted: true, in_progress: 0, keep: 0, lose: 0, back_to_draft: 0, careers: [] }
export const UNAVAILABLE_IMPACT: DraftImpact = {
  affected: true,
  counted: false,
  message: REHEARSAL_UNAVAILABLE,
  in_progress: 0,
  keep: 0,
  lose: 0,
  back_to_draft: 0,
  careers: [],
}

export type RehearsedSyllabus = { id: string; state: string; subjectId: string; career: string | null }

export interface RehearsalReads {
  lockTemplate(templateId: string): Promise<void>
  currentTemplate(): Promise<SyllabusTemplate | null>
  syllabi(processId: string): Promise<RehearsedSyllabus[]>
  syllabusValues(syllabusId: string): Promise<{ fieldId: string; value: unknown }[]>
  fieldKeys(fieldIds: string[]): Promise<Map<string, string>>
  store: TemplateStore
}

export interface RehearsalStore {
  pausedProcess(): Promise<string | null>
  rehearse<T>(work: (reads: RehearsalReads) => Promise<T>): Promise<T | null>
}

function utf8Length(key: string): number {
  return Buffer.byteLength(key, "utf8")
}

export function jsonbOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbOrder)
  if (!isRecord(value)) return value
  const keys = Object.keys(value).sort((left, right) => utf8Length(left) - utf8Length(right) || Buffer.compare(Buffer.from(left), Buffer.from(right)))
  return Object.fromEntries(keys.map((key) => [key, jsonbOrder(value[key])]))
}

export function documentIsEmpty(value: unknown, definition: TemplateDefinition): boolean {
  return !isDocument(value) || phpTrim(plainText(value, definition)) === ""
}

export function buildDraftTemplate(templateId: string, sections: DraftSection[], definition: TemplateDefinition): SyllabusTemplate {
  const built: TemplateSection[] = sections.map((section, sectionIndex) => ({
    id: randomUUID(),
    key: section.key,
    title: section.title,
    orientation: section.orientation,
    position: sectionIndex + 1,
    blocks: section.fields.map((field, fieldIndex) => {
      const blockId = randomUUID()
      const content = contentForField(field.responsible, normalizeFieldDocument(field.content, definition))
      return {
        id: blockId,
        key: field.key,
        title: field.label ?? "",
        position: fieldIndex + 1,
        fields: [{ id: "", blockId, key: field.key, label: field.label ?? "", responsible: field.responsible, content }],
      }
    }),
  }))
  for (const section of built) {
    for (const block of section.blocks) {
      for (const field of block.fields) {
        field.id = uuid7()
        field.content = jsonbOrder(field.content)
      }
    }
  }
  return { id: templateId, modifiedAt: null, definition, sections: built }
}

export function draftPreview(template: SyllabusTemplate, definition: TemplateDefinition): PhpRecord {
  const context = { identification: IDENTIFICATION_SAMPLE }
  return {
    sections: template.sections.map((section) => syllabusSectionPayload(section, (field) => field.content, context, definition)),
    sheets: presentSections(template, definition),
  }
}

export function fieldResponseNormalize(template: unknown, value: unknown, definition: TemplateDefinition, attribute = "value"): PhpRecord {
  if (teacherEdits(template)) return teacherOwnText(template, value, definition, attribute)
  const document = normalizeFieldDocument(writtenValue(template, value), definition, attribute)
  if (!responsesEnabled(definition)) return document
  const shaped = withoutOwnOptions(responseTemplate(normalizeFieldDocument(openShape(template), definition))) as PhpRecord
  if (blank(document)) return shaped
  if (!matches(shaped, document, "answer")) {
    throw new TemplateValidationError({ [attribute]: ["Complete solo los espacios de respuesta. El texto, los encabezados y la estructura los define Administración."] })
  }
  return withoutOwnOptions(adopt(shaped, document, false)) as PhpRecord
}

function skeleton(document: PhpRecord): { kind: unknown; props: unknown }[] {
  return list(document.content)
    .filter((node) => isPhpArray(node) && record(node).type === "documentBlock")
    .map((node) => {
      const attrs = record(record(node).attrs)
      return { kind: attrs.kind ?? null, props: attrs.props ?? null }
    })
}

export function sameStructure(template: PhpRecord, document: PhpRecord): boolean {
  return phpIdentical(skeleton(template), skeleton(document))
}

function stillFits(field: TemplateField, value: unknown, template: unknown, definition: TemplateDefinition): PhpRecord | null {
  if (!isPhpArray(value) || (teacherEdits(template) && !hasOwnText(value))) return null
  let document: PhpRecord
  try {
    document = fieldResponseNormalize(template, value, definition)
  } catch (error) {
    if (error instanceof TemplateValidationError) return null
    throw error
  }
  return sameStructure(normalizeFieldDocument(field.content, definition), document) ? document : null
}

function coordinationFields(template: SyllabusTemplate): Map<string, string> {
  return new Map(templateFields(template).filter((field) => field.responsible !== INSTITUTIONAL).map((field) => [field.key, field.id]))
}

function draftStore(current: TemplateStore, draft: SyllabusTemplate, remap: Map<string, string>): TemplateStore {
  const live: LiveField[] = templateFields(draft).map((field) => ({ id: field.id, responsible: field.responsible, content: field.content }))
  const moved = (values: StoredValue[]) => values.map((value) => (remap.has(value.fieldId) ? { ...value, fieldId: remap.get(value.fieldId) as string } : value))
  return {
    template: async () => draft,
    subjectValues: async (subjectId) => moved(await current.subjectValues(subjectId)),
    valuesForSubjects: async (subjectIds, fieldIds) => moved(await current.valuesForSubjects(subjectIds, [...remap.keys(), ...fieldIds])).filter((value) => fieldIds.includes(value.fieldId)),
    liveFields: async (ids, careerOnly) => live.filter((field) => ids.includes(field.id) && (!careerOnly || field.responsible !== INSTITUTIONAL)),
  }
}

function keyedValues(rows: { fieldId: string; value: unknown }[]): Map<string, unknown> {
  const values = new Map<string, unknown>()
  for (const row of rows) values.set(row.fieldId, row.value)
  return values
}

async function writtenText(syllabus: RehearsedSyllabus, context: ProfileContext, reads: RehearsalReads): Promise<Map<string, unknown>> {
  const templates = await profileTemplates(context, syllabus.subjectId)
  const values = keyedValues(await reads.syllabusValues(syllabus.id))
  const written = new Map<string, unknown>()
  for (const field of templateFields(context.template)) {
    if (!teacherEditable(field, templates)) continue
    const value = values.get(field.id)
    if (isPhpArray(value) && !documentIsEmpty(value, context.definition) && !phpEquals(value, templates[field.id] ?? field.content)) written.set(field.key, value)
  }
  return written
}

async function adaptToTemplate(syllabus: RehearsedSyllabus, context: ProfileContext, reads: RehearsalReads): Promise<{ state: string; values: Map<string, unknown> }> {
  const stored = await reads.syllabusValues(syllabus.id)
  const keys = await reads.fieldKeys([...new Set(stored.map((value) => value.fieldId))])
  const previous = new Map<string, unknown>()
  for (const value of stored) {
    const key = keys.get(value.fieldId) ?? ""
    if (key !== "") previous.set(key, value.value)
  }
  const templates = await profileTemplates(context, syllabus.subjectId)
  const state = SENT_STATES.includes(syllabus.state) ? "borrador" : syllabus.state
  const values = new Map<string, unknown>()
  for (const field of templateFields(context.template)) {
    if (field.responsible === INSTITUTIONAL) continue
    const template = templates[field.id] ?? field.content
    const document = teacherEditable(field, templates) ? stillFits(field, previous.get(field.key) ?? null, template, context.definition) : template
    values.set(field.id, document === null || documentIsEmpty(document, context.definition) ? template : document)
  }
  return { state, values }
}

async function losesText(syllabus: RehearsedSyllabus, values: Map<string, unknown>, written: Map<string, unknown>, context: ProfileContext): Promise<boolean> {
  if (written.size === 0) return false
  const templates = await profileTemplates(context, syllabus.subjectId)
  const fields = new Map(templateFields(context.template).map((field) => [field.key, field]))
  for (const [key, before] of written) {
    const field = fields.get(key)
    const after = field ? (values.get(field.id) ?? null) : null
    if (phpEquals(after, before)) continue
    if (!field || !isPhpArray(after) || documentIsEmpty(after, context.definition) || phpEquals(after, templates[field.id] ?? field.content)) return true
  }
  return false
}

function byteOrder(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

export async function rehearseImpact(
  store: RehearsalStore,
  templateId: string,
  sections: DraftSection[],
  definition: TemplateDefinition,
): Promise<DraftImpact> {
  const processId = await store.pausedProcess()
  if (processId === null) return NO_IMPACT
  const impact = await store.rehearse(async (reads) => {
    const syllabi = await reads.syllabi(processId)
    if (syllabi.length === 0) return NO_IMPACT
    const current = await reads.currentTemplate()
    if (current === null) throw new Error("template disappeared during the rehearsal")
    const currentContext: ProfileContext = { template: current, definition: current.definition, store: reads.store }
    const written = new Map<string, Map<string, unknown>>()
    for (const syllabus of syllabi) written.set(syllabus.id, await writtenText(syllabus, currentContext, reads))
    await reads.lockTemplate(templateId)
    const locked = (await reads.currentTemplate()) ?? current
    const previous = coordinationFields(locked)
    const draft = buildDraftTemplate(templateId, sections, definition)
    const remap = new Map<string, string>()
    for (const [key, id] of coordinationFields(draft)) {
      const old = previous.get(key)
      if (old !== undefined && old !== id) remap.set(old, id)
    }
    const draftContext: ProfileContext = { template: draft, definition, store: draftStore(reads.store, draft, remap) }
    const total: ImpactCounts = { in_progress: 0, keep: 0, lose: 0, back_to_draft: 0 }
    const careers = new Map<string, ImpactCareer>()
    for (const syllabus of syllabi) {
      const sent = SENT_STATES.includes(syllabus.state)
      const career = syllabus.career ?? ""
      const adapted = await adaptToTemplate(syllabus, draftContext, reads)
      const lost = await losesText(syllabus, adapted.values, written.get(syllabus.id) ?? new Map(), draftContext)
      const row: ImpactCounts = { in_progress: 1, keep: lost ? 0 : 1, lose: lost ? 1 : 0, back_to_draft: sent && adapted.state === "borrador" ? 1 : 0 }
      const entry = careers.get(career) ?? { name: career, in_progress: 0, keep: 0, lose: 0, back_to_draft: 0 }
      for (const key of Object.keys(row) as (keyof ImpactCounts)[]) {
        total[key] += row[key]
        entry[key] += row[key]
      }
      careers.set(career, entry)
    }
    const sorted = [...careers.keys()].sort(byteOrder).map((name) => careers.get(name) as ImpactCareer)
    const result: DraftImpact = { affected: true, counted: true, ...total, careers: sorted }
    return result
  })
  return impact ?? UNAVAILABLE_IMPACT
}

export async function rehearsePreview(
  store: RehearsalStore,
  templateId: string,
  sections: DraftSection[],
  definition: TemplateDefinition,
): Promise<PhpRecord | null> {
  return store.rehearse(async (reads) => {
    await reads.lockTemplate(templateId)
    return draftPreview(buildDraftTemplate(templateId, sections, definition), definition)
  })
}
