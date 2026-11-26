import golden from "./__fixtures__/template-golden.json"
import type { PhpRecord } from "./phpValues"
import { trustedDefinition } from "./templateRuntime"
import type { SyllabusTemplate, TemplateSection } from "./templatePresentation"
import type { LiveField, StoredValue, TemplateStore } from "../shared/templateStore"

export const TEMPLATE_ID = "01a1c5ba-10b4-7129-925f-c28a9489323c"

export type GoldenField = (typeof golden.fields)[number]

export const goldenFields: GoldenField[] = golden.fields

export function fieldId(index: number): string {
  return `01a1c5ba-0000-7000-8000-${String(index + 1).padStart(12, "0")}`
}

function blockId(index: number): string {
  return `01a1c5ba-1111-7000-8000-${String(index + 1).padStart(12, "0")}`
}

function sectionId(index: number): string {
  return `01a1c5ba-2222-7000-8000-${String(index + 1).padStart(12, "0")}`
}

export function goldenTemplate(): SyllabusTemplate {
  const sections: TemplateSection[] = []
  goldenFields.forEach((field, index) => {
    let section = sections.find((candidate) => candidate.key === field.section)
    if (!section) {
      section = { id: sectionId(sections.length), key: field.section, title: field.section_title, orientation: "portrait", position: sections.length + 1, blocks: [] }
      sections.push(section)
    }
    section.blocks.push({
      id: blockId(index),
      key: field.key,
      title: field.label,
      position: section.blocks.length + 1,
      fields: [{ id: fieldId(index), blockId: blockId(index), key: field.key, label: field.label, responsible: field.quien_llena, content: field.content }],
    })
  })
  return { id: TEMPLATE_ID, modifiedAt: null, definition: trustedDefinition(golden.definition as unknown as PhpRecord), sections }
}

export type FakeTemplateWorld = { template: SyllabusTemplate | null; values: StoredValue[] }

export function fakeTemplateStore(world: FakeTemplateWorld): TemplateStore {
  const live = (): LiveField[] =>
    (world.template?.sections ?? []).flatMap((section) =>
      section.blocks.flatMap((block) => block.fields.map((field) => ({ id: field.id, responsible: field.responsible, content: field.content }))),
    )
  return {
    template: async () => world.template,
    subjectValues: async (subjectId) => world.values.filter((value) => value.subjectId === subjectId),
    valuesForSubjects: async (subjectIds, fieldIds) => world.values.filter((value) => subjectIds.includes(value.subjectId ?? "") && fieldIds.includes(value.fieldId)),
    liveFields: async (ids, careerOnly) => live().filter((field) => ids.includes(field.id) && (!careerOnly || field.responsible !== "institucional")),
  }
}

export const goldenPresentation = golden.presentation
export const goldenCatalog = golden.catalog
export const goldenSample = golden.sample
export const goldenVariables = golden.variables

export const FORMATION_FIELD_ID = "0195e7a0-0000-7000-8000-0000000000f1"
export const FORMATION_CONTENT = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" } }] }

export function withFormation(template: SyllabusTemplate = goldenTemplate()): SyllabusTemplate {
  const sections = structuredClone(template.sections)
  const block = "0195e7a0-0000-7000-8000-0000000000b1"
  const label = "Formación y experiencia académica-investigativa"
  sections[0].blocks.push({
    id: block,
    key: "formacion_docente",
    title: label,
    position: sections[0].blocks.length + 1,
    fields: [{ id: FORMATION_FIELD_ID, blockId: block, key: "formacion_docente", label, responsible: "carrera", content: FORMATION_CONTENT }],
  })
  return { ...template, definition: { ...template.definition, teacher_fields: ["formacion_docente"] }, sections }
}
