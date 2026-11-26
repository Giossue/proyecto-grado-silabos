import officialJson from "./officialTemplate.json"
import type { PhpRecord } from "./phpValues"
import { prepareDraft, validatedSections, type DraftSection } from "./templateDraft"
import { DEFINITION_KEYS, defineTemplate } from "./templateDefinition"
import type { TemplateDefinition } from "./templateRuntime"

function officialInput(): PhpRecord {
  return prepareDraft(structuredClone(officialJson) as unknown as PhpRecord)
}

export function officialSections(): DraftSection[] {
  return validatedSections(officialInput())
}

let official: TemplateDefinition | null = null

export function officialDefinition(): TemplateDefinition {
  if (official !== null) return official
  const input = officialInput()
  const picked = Object.fromEntries(Object.entries(input).filter(([key]) => DEFINITION_KEYS.includes(key)))
  const sources = validatedSections(input).map((section) => ({ key: section.key, fields: section.fields.map((field) => ({ key: field.key, quien_llena: field.responsible, content: field.content })) }))
  official = defineTemplate(picked, sources)
  return official
}
