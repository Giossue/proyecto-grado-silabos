import { isPhpArray, list, phpString, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { KEY_PATTERN, RESPONSIBLES } from "../configuration/templateDraft"
import { defineCondition, normalizeFieldDocument, TemplateValidationError, type TemplateDefinition } from "../configuration/templateRuntime"
import type { PhpArray } from "../laravel/input"
import { validateInput, type Rule } from "../laravel/validation"
import type { AssistantField, AssistantSection } from "./assistantDraft"

export const UNREADABLE_DRAFT = "El borrador tiene un contenido que no se puede leer. Guárdelo o recargue la página."

const ATTRIBUTES: Record<string, string> = {
  message: "pedido",
  idempotency_key: "clave del pedido",
  draft: "borrador",
  draft_version: "versión del borrador",
  "draft.*.key": "clave de la sección",
  "draft.*.title": "título de la sección",
  "draft.*.orientation": "orientación",
  "draft.*.fields": "campos",
  "draft.*.fields.*.key": "clave del campo",
  "draft.*.fields.*.label": "nombre del campo",
  "draft.*.fields.*.quien_llena": "quién lo llena",
  "draft.*.fields.*.content": "contenido",
  "draft.*.fields.*.show_if": "mostrar solo si",
  "draft.*.fields.*.max_length": "límite de caracteres",
}

function readable(value: unknown, definition: TemplateDefinition): boolean {
  try {
    normalizeFieldDocument(isPhpArray(value) ? value : [], definition)
    return true
  } catch (error) {
    if (error instanceof TemplateValidationError) return false
    throw error
  }
}

function rules(definition: TemplateDefinition, messageCharacters: number): Record<string, Rule[]> {
  return {
    message: ["required", "string", { max: messageCharacters }],
    idempotency_key: ["required", "uuid"],
    draft_version: ["required", "string", { max: 100 }],
    draft: ["present", "array", { max: 60 }],
    "draft.*.key": ["required", "string", { regex: KEY_PATTERN }, { max: 100 }, "distinct"],
    "draft.*.title": ["present", "nullable", "string", { max: 180 }],
    "draft.*.orientation": ["required", { in: ["portrait", "landscape"] }],
    "draft.*.fields": ["present", "array", { max: 60 }],
    "draft.*.fields.*.key": ["required", "string", { regex: KEY_PATTERN }, { max: 100 }],
    "draft.*.fields.*.label": ["present", "nullable", "string", { max: 180 }],
    "draft.*.fields.*.quien_llena": ["required", { in: RESPONSIBLES }],
    "draft.*.fields.*.content": ["required", "array", { fails: (value) => (readable(value, definition) ? [] : [UNREADABLE_DRAFT]) }],
    "draft.*.fields.*.show_if": ["sometimes", "nullable", "array"],
    "draft.*.fields.*.max_length": ["sometimes", "nullable", "integer", { min: 1 }, { max: 50000 }],
  }
}

export function sendMessageErrors(input: PhpRecord, definition: TemplateDefinition, messageCharacters: number): Promise<Record<string, string[]>> {
  return validateInput(input as PhpArray, rules(definition, messageCharacters), ATTRIBUTES)
}

function condition(raw: unknown): { show_if?: PhpRecord } {
  if (raw === null || raw === undefined) return {}
  try {
    return { show_if: defineCondition(raw) }
  } catch (error) {
    if (error instanceof TemplateValidationError) return {}
    throw error
  }
}

export function validatedDraft(input: PhpRecord, definition: TemplateDefinition): AssistantSection[] {
  return list(input.draft).map((raw) => {
    const section = record(raw)
    const fields = list(section.fields).map((item): AssistantField => {
      const field = record(item)
      const limit = field.max_length
      return {
        key: phpString(field.key),
        label: phpTrim(phpString(field.label ?? "")),
        quien_llena: phpString(field.quien_llena),
        content: normalizeFieldDocument(field.content, definition),
        ...condition(field.show_if),
        ...(typeof limit === "number" && Number.isInteger(limit) ? { max_length: limit } : {}),
      }
    })
    return { key: phpString(section.key), title: phpTrim(phpString(section.title ?? "")), orientation: phpString(section.orientation), fields }
  })
}
