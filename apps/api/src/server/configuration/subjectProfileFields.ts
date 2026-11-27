import { careerFieldUndecided, TEMPLATE_ACCEPTED, templateAccepted } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { phpEquals, type PhpRecord } from "./phpValues"
import {
  followTemplate,
  isDocument,
  normalizeFieldDocument,
  pendingResponses,
  plainText,
  responsesEnabled,
  responseTemplate,
  templateFor,
  withoutOwnOptions,
  writable,
  type TemplateDefinition,
} from "./templateRuntime"
import { fieldSection, isCareerField, isTeacherField, teacherOnly, teacherTemplate, templateFields, type SyllabusTemplate, type TemplateField } from "./templatePresentation"
import type { TemplateStore } from "../shared/templateStore"
import { markTeacherEdits, markTeacherFills, teacherEdits, teacherFills, withoutTeacherFills } from "./teacherText"

export type ProfileContext = { template: SyllabusTemplate; definition: TemplateDefinition; store: TemplateStore }

export function profileFields(context: ProfileContext): TemplateField[] {
  return templateFields(context.template).filter((field) => isCareerField(field) && !isTeacherField(field, context.definition) && writable(field.content, context.definition))
}

export function presentedProfileFields(context: ProfileContext, fields: TemplateField[]) {
  const positions = profilePositions(context)
  return fields.map((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    quien_llena: field.responsible,
    content: field.content,
    ...(responsesEnabled(context.definition) ? { template: responseTemplate(normalizeFieldDocument(field.content, context.definition)) } : {}),
    section: fieldSection(context.template, field)?.title ?? null,
    position: positions.get(field.id) ?? 0,
  }))
}

export function profilePositions(context: ProfileContext): Map<string, number> {
  const positions = new Map<string, number>()
  templateFields(context.template).forEach((field, index) => positions.set(field.id, index))
  return positions
}

export function profileTemplateOf(content: unknown, stored: unknown, definition: TemplateDefinition): PhpRecord | null {
  const template = templateFor(content, stored, definition)
  if (phpEquals(template, content) || phpEquals(template, responseTemplate(normalizeFieldDocument(content, definition)))) return null
  return withoutOwnOptions(template) as PhpRecord
}

export function teacherTemplateOf(content: unknown, stored: unknown, definition: TemplateDefinition): PhpRecord | null {
  const template = profileTemplateOf(content, stored, definition)
  if (template === null || !teacherFills(template)) return template
  return profileTemplateOf(content, withoutTeacherFills(template), definition)
}

function keyByField<T extends { fieldId: string }>(items: T[]): Map<string, T> {
  const keyed = new Map<string, T>()
  for (const item of items) keyed.set(item.fieldId, item)
  return keyed
}

export async function profileTemplates(context: ProfileContext, subjectId: string): Promise<Record<string, PhpRecord>> {
  const templates: Record<string, PhpRecord> = {}
  const teachers = new Set<string>()
  for (const field of templateFields(context.template)) {
    if (!teacherOnly(field, context.definition)) continue
    teachers.add(field.id)
    const template = teacherTemplate(field, context.definition)
    if (template !== null) templates[field.id] = template
  }
  const stored = keyByField((await context.store.subjectValues(subjectId)).filter((row) => !teachers.has(row.fieldId)))
  if (stored.size === 0) return templates
  for (const field of await context.store.liveFields([...stored.keys()], true)) {
    const template = teacherTemplateOf(field.content, stored.get(field.id)?.value ?? null, context.definition)
    if (template !== null) templates[field.id] = template
  }
  return templates
}

export async function profileValues(context: ProfileContext, subjectId: string): Promise<Map<string, PhpRecord | null>> {
  const rows = await context.store.subjectValues(subjectId)
  const definitions = new Map((await context.store.liveFields(rows.map((row) => row.fieldId), false)).map((field) => [field.id, field]))
  const values = new Map<string, PhpRecord | null>()
  for (const row of rows) {
    const definition = definitions.get(row.fieldId)
    let value: PhpRecord | null
    if (!isDocument(row.value)) value = null
    else if (definition) value = followTemplate(definition.content, row.value, context.definition)
    else value = normalizeFieldDocument(row.value, context.definition)
    const filled = teacherFills(value)
    if (value !== null && storedAccepted(row.value)) value = { ...value, attrs: { [TEMPLATE_ACCEPTED]: true } }
    if (value !== null && filled) value = markTeacherFills(value)
    if (value !== null && teacherEdits(row.value)) value = markTeacherEdits(value)
    values.set(row.fieldId, value)
  }
  return values
}

export function storedAccepted(stored: unknown): boolean {
  return isDocument(stored) && templateAccepted(stored as DocumentNode)
}

/** A career field is pending while Coordinación has not decided it, or while one of its choices has no options. */
export function fieldPending(content: unknown, stored: unknown, definition: TemplateDefinition): boolean {
  const blank = responseTemplate(normalizeFieldDocument(content, definition))
  const document = profileTemplateOf(content, stored, definition) ?? blank
  if (pendingResponses(document).without_options > 0) return true
  return !storedAccepted(stored) && careerFieldUndecided(blank as unknown as DocumentNode, document as unknown as DocumentNode)
}

const writtenText = (document: PhpRecord, definition: TemplateDefinition): string => plainText(document, definition).replace(/\s+/gu, " ").trim()

export function subjectKeepsWork(field: TemplateField, stored: unknown, definition: TemplateDefinition): boolean {
  if (!fieldPending(field.content, stored, definition)) return true
  const own = profileTemplateOf(field.content, stored, definition)
  return own !== null && writtenText(own, definition) !== writtenText(responseTemplate(normalizeFieldDocument(field.content, definition)), definition)
}

export async function profileProgress(context: ProfileContext, subjectIds: string[]): Promise<Map<string, { filled: number; total: number }>> {
  const fields = profileFields(context)
  const untouched = new Map(fields.map((field) => [field.id, fieldPending(field.content, null, context.definition)]))
  const stored =
    fields.length === 0 || subjectIds.length === 0
      ? []
      : await context.store.valuesForSubjects(
          subjectIds,
          fields.map((field) => field.id),
        )
  const bySubject = new Map<string, Map<string, { value: unknown }>>()
  for (const row of stored) {
    const subject = bySubject.get(row.subjectId ?? "") ?? new Map<string, { value: unknown }>()
    subject.set(row.fieldId, row)
    bySubject.set(row.subjectId ?? "", subject)
  }
  const progress = new Map<string, { filled: number; total: number }>()
  for (const subjectId of subjectIds) {
    const rows = bySubject.get(subjectId) ?? new Map<string, { value: unknown }>()
    let pending = 0
    for (const field of fields) {
      const row = rows.get(field.id)
      if (row === undefined ? untouched.get(field.id) : fieldPending(field.content, row.value, context.definition)) pending++
    }
    progress.set(subjectId, { filled: fields.length - pending, total: fields.length })
  }
  return progress
}

export async function profileComplete(context: ProfileContext, subjectIds: string[]): Promise<Map<string, boolean>> {
  const complete = new Map<string, boolean>()
  for (const [subjectId, progress] of await profileProgress(context, subjectIds)) complete.set(subjectId, progress.filled === progress.total)
  return complete
}
