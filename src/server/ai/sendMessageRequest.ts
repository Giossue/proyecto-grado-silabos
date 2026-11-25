import { isPhpArray, list, phpString, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { assistantRequestSchema } from "@/schemas/template"
import { defineCondition, normalizeFieldDocument, TemplateValidationError, type TemplateDefinition } from "../configuration/templateRuntime"
import { validateSchema } from "../http/schemaValidation"
import type { AssistantField, AssistantSection } from "./assistantDraft"

export const UNREADABLE_DRAFT = "El borrador tiene un contenido que no se puede leer. Guárdelo o recargue la página."

function readable(value: unknown, definition: TemplateDefinition): boolean {
  try {
    normalizeFieldDocument(isPhpArray(value) ? value : [], definition)
    return true
  } catch (error) {
    if (error instanceof TemplateValidationError) return false
    throw error
  }
}

export async function sendMessageErrors(input: PhpRecord, definition: TemplateDefinition, messageCharacters: number): Promise<Record<string, string[]>> {
  const schema = assistantRequestSchema({ messageCharacters, readable: (value) => readable(value, definition), unreadable: UNREADABLE_DRAFT })
  return (await validateSchema(schema, input)).errors ?? {}
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
