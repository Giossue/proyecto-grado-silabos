import { fakeTemplateStore } from "../configuration/testing"
import type { PhpRecord } from "../configuration/phpValues"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { templateFields, type SyllabusTemplate, type TemplateField } from "../configuration/templatePresentation"
import type { StoredValue } from "../shared/templateStore"
import { assistantSnapshot, type AssistantSnapshot } from "./teacherContext"
import { officialTemplate } from "./testing"

export const SUBJECT_ID = "a1000000-0000-4000-8000-000000000001"

export const TEACHER_NAME = "Rosa Quintanilla Vera"
export const TEACHER_EMAIL = "rosa.quintanilla@ueb.edu.ec"
export const COORDINATOR_NAME = "Hernán Salazar Ortiz"
export const LIBRARIAN_NAME = "Noemí Cárdenas Paz"

export const SYSTEM_VARIABLES = ["nombre_docente", "correo_docente", "formacion_docente", "firma_docente", "nombre_coordinador", "firma_coordinador", "nombre_bibliotecario"]

export const academicContext = {
  schema_version: 6,
  career: { id: "c-1", code: "SW", name: "Software", faculty: "Ciencias Administrativas", faculty_id: "f-1" },
  curriculum: { id: "m-1", name: "Malla SW-8", cycle_count: 8 },
  subject: {
    id: SUBJECT_ID,
    code: "SW-701",
    name: "Redes de computadoras",
    cycle: 7,
    credits: "3.00",
    total_hours: 144,
    hours_ac: "48.00",
    hours_pae: "32.00",
    hours_aa: "64.00",
    prerequisites: ["SW-601"],
    organization_unit: "Unidad profesional",
  },
  parallel: { id: "p-1", code: "A", shift: "matutina" },
  scheduled_subject: { period: "2026-2027", teaching_weeks: 16, modality: "Presencial" },
  teacher: { name: TEACHER_NAME, email: TEACHER_EMAIL },
}

export const para = (...content: unknown[]): PhpRecord => ({ type: "paragraph", ...(content.length === 0 ? {} : { content }) })
export const words = (value: string): PhpRecord => ({ type: "text", text: value })
export const line = (value: string): PhpRecord => (value === "" ? para() : para(words(value)))
export const docOf = (...content: unknown[]): PhpRecord => ({ type: "doc", content })
export const variableNode = (id: string): PhpRecord => ({ type: "variable", attrs: { id } })
export const answerSpace = (extra: PhpRecord = {}): PhpRecord => ({ type: "response", attrs: { kind: "texto", options: [], value: "", ...extra } })

export type TeacherWorld = {
  template: SyllabusTemplate
  subjectValues: StoredValue[]
  values: Map<string, unknown>
  allowed: Set<string>
  context: unknown
}

export function teacherWorld(allowed: string[] = []): TeacherWorld {
  return { template: officialTemplate(), subjectValues: [], values: new Map(), allowed: new Set(allowed), context: structuredClone(academicContext) }
}

export function fieldByKey(template: SyllabusTemplate, key: string): TemplateField {
  const found = templateFields(template).find((field) => field.key === key)
  if (found === undefined) throw new Error(`Missing field ${key}`)
  return found
}

export function coordinationWrites(world: TeacherWorld, key: string, value: PhpRecord): void {
  const fieldId = fieldByKey(world.template, key).id
  world.subjectValues = [...world.subjectValues.filter((item) => item.fieldId !== fieldId), { fieldId, subjectId: SUBJECT_ID, value }]
}

export function teacherWrites(world: TeacherWorld, key: string, value: unknown): void {
  world.values.set(fieldByKey(world.template, key).id, value)
}

export function templatesOf(world: TeacherWorld): Promise<Record<string, PhpRecord>> {
  const store = fakeTemplateStore({ template: world.template, values: world.subjectValues })
  return profileTemplates({ template: world.template, definition: world.template.definition, store }, SUBJECT_ID)
}

export async function snapshotOf(world: TeacherWorld): Promise<AssistantSnapshot> {
  return assistantSnapshot({ template: world.template, templates: await templatesOf(world), values: world.values, allowedKeys: world.allowed, academicContext: world.context })
}
