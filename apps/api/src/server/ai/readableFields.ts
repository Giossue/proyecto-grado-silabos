import { isRecord, record, type PhpRecord } from "../configuration/phpValues"
import type { DraftSection } from "../configuration/templateDraft"
import type { TemplateField } from "../configuration/templatePresentation"
import { INSTITUTIONAL, type TemplateDefinition } from "../configuration/templateRuntime"

export const AI_BLOCKED_PROTECTED = "Tiene datos de estudiantes con discapacidad."
export const AI_BLOCKED_NOBODY = "Nadie lo llena: la IA no lo lee."

const IDENTIFICATION_BLOCK = "identificacion"
const DISABILITY_VALUE = "disability"
const DISABILITY_SCHEMA = /disabilit|discapacidad/i
const OFF_AT_START = ["formacion_docente"]

function protectedBlock(attrs: PhpRecord, definition: TemplateDefinition): boolean {
  const kind = attrs.kind
  if (typeof kind !== "string" || kind === IDENTIFICATION_BLOCK || !Object.prototype.hasOwnProperty.call(definition.blocks, kind)) return true
  return DISABILITY_VALUE in record(attrs.value) || DISABILITY_SCHEMA.test(JSON.stringify(record(definition.blocks[kind]).value ?? null))
}

export function holdsDisabilityData(document: unknown, definition: TemplateDefinition): boolean {
  if (typeof document === "string") return document.includes("data-block")
  if (Array.isArray(document)) return document.some((child) => holdsDisabilityData(child, definition))
  if (!isRecord(document)) return false
  if (document.type === "documentBlock" && protectedBlock(record(document.attrs), definition)) return true
  return holdsDisabilityData(document.content ?? null, definition)
}

export function aiBlockReason(field: Pick<TemplateField, "responsible" | "content">, definition: TemplateDefinition): string | null {
  if (holdsDisabilityData(field.content, definition)) return AI_BLOCKED_PROTECTED
  return field.responsible === INSTITUTIONAL ? AI_BLOCKED_NOBODY : null
}

export function aiReadableFields(definition: TemplateDefinition, fields: TemplateField[], allowedKeys: ReadonlySet<string>): TemplateField[] {
  return fields.filter((field) => allowedKeys.has(field.key) && aiBlockReason(field, definition) === null)
}

export function initialAiReadableKeys(sections: DraftSection[], definition: TemplateDefinition): string[] {
  return sections
    .flatMap((section) => section.fields)
    .filter((field) => !OFF_AT_START.includes(field.key) && aiBlockReason(field, definition) === null)
    .map((field) => field.key)
}
