import { embeddedLogos, type LogoStore } from "../configuration/institutionalLogos"
import { isPhpArray, list, phpCount, record, type PhpRecord } from "../configuration/phpValues"
import { conditionResponses, conditionShows, evaluateConditions, clearHidden, type Answers } from "../configuration/responseConditions"
import { resolveVariables, type SyllabusTemplate } from "../configuration/templatePresentation"
import { fieldConditions, INSTITUTIONAL, normalizeFieldDocument, resolveDocument, withoutOwnOptionsDocument, type TemplateDefinition } from "../configuration/templateRuntime"
import { dataGet, identificationOf, type IdentificationSource } from "../syllabus/identificationCard"
import { NeedsLaravel } from "../syllabus/snapshotDocuments"
import { TEMPLATE_NAME } from "../syllabus/convocations"
import { hasAmbiguousNumbers } from "./canonicalJson"

export const SNAPSHOT_VERSION = 9

export type SnapshotRawJson = { definition: string | null; context: string | null; values: string[]; contents: string[] }

export interface SnapshotSource {
  template(): Promise<SyllabusTemplate | null>
  values(syllabusId: string): Promise<Map<string, unknown>>
  identification(syllabusId: string): Promise<IdentificationSource>
  hasArchivedValues(syllabusId: string): Promise<boolean>
  rawJson(syllabusId: string): Promise<SnapshotRawJson>
  logos: LogoStore
}

const CONDITION_ATTR = "showIf"
const LINES = ["paragraph", "heading", "listItem"]
const CELLS = ["tableCell", "tableHeader"]
const LISTS = ["bulletList", "orderedList"]

type SnapshotField = { definition_id: string; key: string; label: string; quien_llena: string; document: unknown; value?: unknown }
type SnapshotSection = { key: string; title: string; orientation: string; fields: SnapshotField[] }

function onlyHidden(node: unknown, answers: Answers): boolean {
  const responses = conditionResponses(node)
  return responses.length > 0 && responses.every((attrs) => isPhpArray(attrs[CONDITION_ATTR]) && !conditionShows(attrs[CONDITION_ATTR], answers))
}

function emptyContent(content: unknown): boolean {
  return content === undefined || content === null || (isPhpArray(content) && phpCount(content) === 0)
}

export function withoutHiddenLines(node: unknown, answers: Answers): unknown {
  if (!isPhpArray(node) || !isPhpArray(record(node).content) || Array.isArray(node)) return node
  const content: unknown[] = []
  for (const child of list(record(node).content)) {
    if (!isPhpArray(child) || Array.isArray(child)) {
      content.push(child)
      continue
    }
    const type = record(child).type
    if (typeof type === "string" && CELLS.includes(type) && onlyHidden(child, answers)) {
      content.push({ ...record(child), content: [{ type: "paragraph" }] })
      continue
    }
    if (typeof type === "string" && LINES.includes(type) && onlyHidden(child, answers)) continue
    const kept = withoutHiddenLines(child, answers)
    if (typeof type === "string" && LISTS.includes(type) && !emptyContent(record(child).content) && isPhpArray(kept) && emptyContent(record(kept).content)) continue
    content.push(kept)
  }
  return { ...record(node), content }
}

export function visibleSections(sections: SnapshotSection[], conditions: Record<string, PhpRecord>): SnapshotSection[] {
  const fields = sections.flatMap((section) => section.fields.map((field) => ({ key: String(field.key ?? ""), document: field.document ?? null })))
  const conditional = fields.some((field) => conditionResponses(field.document).some((attrs) => attrs[CONDITION_ATTR] !== undefined && attrs[CONDITION_ATTR] !== null))
  if (Object.keys(conditions).length === 0 && !conditional) return sections
  const result = evaluateConditions(fields, conditions)
  const visible: SnapshotSection[] = []
  for (const section of sections) {
    const kept: SnapshotField[] = []
    for (const field of section.fields) {
      if (result.hidden.has(String(field.key ?? ""))) continue
      kept.push(field.document === undefined || field.document === null ? field : { ...field, document: withoutHiddenLines(clearHidden(field.document, result.answers), result.answers) })
    }
    if (kept.length === 0 && section.fields.length > 0) continue
    visible.push({ ...section, fields: kept })
  }
  return visible
}

function templateSections(template: SyllabusTemplate, values: Map<string, unknown>, definition: TemplateDefinition): SnapshotSection[] {
  return template.sections.map((section) => ({
    key: section.key,
    title: section.title,
    orientation: section.orientation,
    fields: section.blocks.flatMap((block) =>
      block.fields.map((field) => {
        const stored = field.responsible === INSTITUTIONAL ? field.content : values.has(field.id) ? values.get(field.id) : field.content
        return {
          definition_id: field.id,
          key: field.key,
          label: field.label,
          quien_llena: field.responsible,
          document: withoutOwnOptionsDocument(normalizeFieldDocument(stored, definition)),
        }
      }),
    ),
  }))
}

export async function buildSyllabusSnapshot(syllabusId: string, source: SnapshotSource): Promise<PhpRecord> {
  const raw = await source.rawJson(syllabusId)
  if ([raw.definition, raw.context, ...raw.values, ...raw.contents].some(hasAmbiguousNumbers)) throw new NeedsLaravel()
  const template = await source.template()
  if (template === null || template.definition === null || (await source.hasArchivedValues(syllabusId))) throw new NeedsLaravel()
  const definition = template.definition
  const values = await source.values(syllabusId)
  const card = await source.identification(syllabusId)
  const identification = identificationOf(card)
  const variables = resolveVariables(definition, { identification, academic_context: card.context })
  const facultyId = dataGet(card.context, "career.faculty_id")
  const sections = visibleSections(templateSections(template, values, definition), fieldConditions(definition)).map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({ ...field, value: resolveDocument(record(field.document), variables, definition) })),
  }))
  return {
    schema_version: SNAPSHOT_VERSION,
    template_id: template.id,
    template_name: TEMPLATE_NAME,
    template_definition: definition,
    academic_context: card.context,
    logos: await embeddedLogos(typeof facultyId === "string" ? facultyId : null, source.logos),
    identification,
    template_variables: variables,
    sections,
  }
}
