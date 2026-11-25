import officialJson from "./officialTemplate.json"
import type { PhpRecord } from "./phpValues"
import { fieldDocument, type DraftSection } from "./templateDraft"
import { DEFINITION_KEYS, defineTemplate } from "./templateDefinition"
import type { TemplateDefinition } from "./templateRuntime"

type OfficialSection = (typeof officialJson.sections)[number]

export function officialSections(): DraftSection[] {
  return (structuredClone(officialJson.sections) as OfficialSection[]).map((section) => ({
    key: section.key,
    title: section.title,
    orientation: (section as { orientation?: string }).orientation ?? "portrait",
    fields: section.fields.map((field) => ({
      key: field.key,
      label: (field as { label?: string | null }).label ?? null,
      responsible: field.quien_llena,
      content: fieldDocument(field.content) as PhpRecord,
    })),
  }))
}

let official: TemplateDefinition | null = null

export function officialDefinition(): TemplateDefinition {
  if (official !== null) return official
  const raw = structuredClone(officialJson) as Record<string, unknown>
  const picked = Object.fromEntries(Object.entries(raw).filter(([key]) => DEFINITION_KEYS.includes(key)))
  const sources = officialSections().map((section) => ({ key: section.key, fields: section.fields.map((field) => ({ key: field.key, quien_llena: field.responsible, content: field.content })) }))
  official = defineTemplate(picked, sources)
  return official
}
