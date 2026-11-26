import { careerFieldUndecided } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { phpEquals, type PhpRecord } from "./phpValues"
import {
  followTemplate,
  isDocument,
  normalizeFieldDocument,
  pendingResponses,
  responseTemplate,
  templateFor,
  withoutOwnOptions,
  writable,
  type TemplateDefinition,
} from "./templateRuntime"
import { isCareerField, isTeacherField, templateFields, type SyllabusTemplate, type TemplateField } from "./templatePresentation"
import type { TemplateStore } from "../shared/templateStore"

export type ProfileContext = { template: SyllabusTemplate; definition: TemplateDefinition; store: TemplateStore }

export function profileFields(context: ProfileContext): TemplateField[] {
  return templateFields(context.template).filter((field) => isCareerField(field) && !isTeacherField(field, context.definition) && writable(field.content, context.definition))
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

function keyByField<T extends { fieldId: string }>(items: T[]): Map<string, T> {
  const keyed = new Map<string, T>()
  for (const item of items) keyed.set(item.fieldId, item)
  return keyed
}

export async function profileTemplates(context: ProfileContext, subjectId: string): Promise<Record<string, PhpRecord>> {
  const stored = keyByField(await context.store.subjectValues(subjectId))
  if (stored.size === 0) return {}
  const templates: Record<string, PhpRecord> = {}
  for (const field of await context.store.liveFields([...stored.keys()], true)) {
    const template = profileTemplateOf(field.content, stored.get(field.id)?.value ?? null, context.definition)
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
    values.set(row.fieldId, value)
  }
  return values
}

/** A career field is pending while Coordinación has not decided it, or while one of its choices has no options. */
function fieldPending(content: unknown, stored: unknown, definition: TemplateDefinition): boolean {
  const blank = responseTemplate(normalizeFieldDocument(content, definition))
  const document = profileTemplateOf(content, stored, definition) ?? blank
  return pendingResponses(document).without_options > 0 || careerFieldUndecided(blank as unknown as DocumentNode, document as unknown as DocumentNode)
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
