import { isScalar, list, phpString, record, type PhpRecord } from "./phpValues"
import {
  fieldConditions,
  fieldLimits,
  INSTITUTIONAL,
  limitAllowed,
  normalizeFieldDocument,
  openTemplate,
  resolveDocument,
  responsesEnabled,
  responseTemplate,
  type TemplateDefinition,
} from "./templateRuntime"

export type TemplateField = { id: string; blockId: string; key: string; label: string; responsible: string; content: unknown }
export type TemplateBlock = { id: string; key: string; title: string; position: number; fields: TemplateField[] }
export type TemplateSection = { id: string; key: string; title: string; orientation: string; position: number; blocks: TemplateBlock[] }
export type SyllabusTemplate = { id: string; modifiedAt: string | null; definition: TemplateDefinition; sections: TemplateSection[] }

const SIGNATURE_LABELS: Record<string, string> = {
  docente: "Firma del docente",
  coordinacion: "Firma de coordinación",
  biblioteca: "Firma de biblioteca",
}

export function presentDefinition(definition: TemplateDefinition): PhpRecord {
  return {
    document: definition.document,
    blocks: definition.blocks,
    ...(definition.response_policy === "protected" ? { response_policy: "protected" } : {}),
  }
}

export function documentAppearance(document: PhpRecord): PhpRecord {
  const sizes = record(document.sizes)
  const colors = record(document.colors)
  const title = record(document.title)
  const section = record(document.section_title)
  return {
    font_family: document.font_family ?? null,
    body_font_size: sizes.body ?? null,
    title_font_size: sizes.title ?? null,
    section_font_size: sizes.section ?? null,
    field_font_size: sizes.body ?? null,
    margin_cm: document.margin_cm ?? null,
    orientation: document.orientation ?? null,
    text_color: colors.text ?? null,
    accent_color: colors.title ?? null,
    table_header_background: colors.table_header_background ?? null,
    table_header_color: colors.table_header_text ?? null,
    table_border: colors.table_border ?? null,
    title_bold: title.bold ?? null,
    title_italic: title.italic ?? null,
    title_alignment: title.alignment ?? null,
    section_bold: section.bold ?? null,
    section_italic: section.italic ?? null,
    section_alignment: section.alignment ?? null,
    body_alignment: record(document.body).alignment ?? null,
  }
}

export function templatePresentationOf(definition: TemplateDefinition, logos: { institution: string; faculty: string }): PhpRecord {
  return { document: definition.document, appearance: documentAppearance(definition.document), title: record(definition.document.title).text ?? null, logos }
}

export function identificationNumber(value: string): string {
  const trimmed = value.trim()
  if (!/^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(trimmed) || !trimmed.includes(".")) return trimmed
  return trimmed.replace(/0+$/, "").replace(/\.+$/, "")
}

function variableValue(variable: PhpRecord, raw: unknown): string {
  const source = phpString(variable.source)
  if (source.startsWith("signature.")) return "\n".repeat(4) + (SIGNATURE_LABELS[source.slice("signature.".length)] ?? "")
  let text = isScalar(raw) ? phpString(raw) : ""
  if (variable.format === "number") text = identificationNumber(text)
  return variable.equals !== undefined && variable.equals !== null ? (text === variable.equals ? "X" : "") : text
}

function dataGet(target: unknown, path: string): unknown {
  let value = target
  for (const segment of path.split(".")) {
    const current = record(value)
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return null
    value = current[segment]
  }
  return value ?? null
}

export function resolveVariables(definition: TemplateDefinition, snapshot: PhpRecord): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, variable] of Object.entries(definition.variables)) values[key] = variableValue(variable, dataGet(snapshot, phpString(variable.source)))
  return values
}

export function variableCatalog(definition: TemplateDefinition): { key: string; label: unknown; sample: string }[] {
  return Object.entries(definition.variables).map(([key, variable]) => {
    const source = phpString(variable.source)
    const sample = source.startsWith("signature.") ? variableValue(variable, null) : variableValue(variable, variable.sample ?? variable.label)
    const hasEquals = variable.equals !== undefined && variable.equals !== null
    return { key, label: variable.label, sample: hasEquals ? phpString(variable.sample ?? "") : sample }
  })
}

export function templateFields(template: SyllabusTemplate): TemplateField[] {
  return template.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields))
}

export function fieldSection(template: SyllabusTemplate, field: TemplateField): TemplateSection | null {
  return template.sections.find((section) => section.blocks.some((block) => block.id === field.blockId)) ?? null
}

export function isCareerField(field: TemplateField): boolean {
  return field.responsible !== INSTITUTIONAL
}

export function teacherFieldKeys(definition: PhpRecord): string[] {
  return list(definition.teacher_fields).filter((key): key is string => typeof key === "string")
}

export function isTeacherField(field: Pick<TemplateField, "key">, definition: PhpRecord): boolean {
  return teacherFieldKeys(definition).includes(field.key)
}

export function teacherEditable(field: TemplateField, templates: Record<string, unknown>): boolean {
  return isCareerField(field) && (!(field.id in templates) || openTemplate(templates[field.id]))
}

function conditionAndLimit(definition: TemplateDefinition, field: TemplateField): PhpRecord {
  const conditions = fieldConditions(definition)
  const limits = fieldLimits(definition)
  return {
    ...(field.key in conditions ? { show_if: conditions[field.key] } : {}),
    ...(field.key in limits && limitAllowed(field.responsible) ? { max_length: limits[field.key] } : {}),
  }
}

export function presentSections(template: SyllabusTemplate, definition: TemplateDefinition): PhpRecord[] {
  return template.sections.map((section) => ({
    id: section.id,
    key: section.key,
    title: section.title,
    orientation: section.orientation,
    fields: section.blocks.flatMap((block) =>
      block.fields.map((field) => ({
        id: field.id,
        key: field.key,
        label: field.label,
        quien_llena: field.responsible,
        content: field.content,
        ...conditionAndLimit(definition, field),
      })),
    ),
  }))
}

export function syllabusSectionPayload(
  section: TemplateSection,
  stored: (field: TemplateField) => unknown,
  context: PhpRecord,
  definition: TemplateDefinition,
  templates: Record<string, unknown> = {},
): PhpRecord {
  const variables = resolveVariables(definition, context)
  return {
    id: section.id,
    key: section.key,
    title: section.title,
    orientation: section.orientation,
    fields: section.blocks.flatMap((block) =>
      block.fields.map((field) => {
        const document = normalizeFieldDocument(field.responsible === INSTITUTIONAL ? field.content : stored(field), definition)
        const editable = teacherEditable(field, templates)
        const template = normalizeFieldDocument(templates[field.id] ?? field.content, definition)
        return {
          id: field.id,
          key: field.key,
          label: field.label,
          quien_llena: field.responsible,
          ...(responsesEnabled(definition) && field.responsible !== INSTITUTIONAL ? { template: editable ? responseTemplate(template) : template } : {}),
          teacher_editable: editable,
          required: field.responsible !== INSTITUTIONAL,
          value: document,
          document: resolveDocument(document, variables, definition),
          ...conditionAndLimit(definition, field),
        }
      }),
    ),
  }
}

export const IDENTIFICATION_SAMPLE: Record<string, string> = {
  faculty: "Ciencias Administrativas, Gestión Empresarial e Informática",
  career: "Software",
  modality: "Presencial",
  teacher_campus: "Matriz",
  subject: "Asignatura de ejemplo",
  period: "Marzo – Julio 2026",
  cycle: "Séptimo",
  parallel: "A",
  shift: "Matutina",
  code: "SW-P7-037",
  prerequisites: "SW-P6-032",
  teacher_corequisites: "Ninguno",
  organization_unit: "Unidad profesional",
  hours_ac: "32",
  hours_pae: "16",
  hours_aa: "48",
  total_hours: "96",
  credits: "2",
  teaching_weeks: "16",
  teacher: "NOMBRE DEL DOCENTE",
  email: "docente@ueb.edu.ec",
  disability: "no",
  disability_type: "",
  disability_description: "",
  formation: "Formación y experiencia en el área de la asignatura.",
}
