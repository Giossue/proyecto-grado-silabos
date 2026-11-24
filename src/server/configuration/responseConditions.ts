import { isPhpArray, list, record, type PhpRecord } from "./phpValues"
import { INSTITUTIONAL, RESPONSE_NODE, unanswered } from "./templateRuntime"
import type { SyllabusTemplate } from "./templatePresentation"

export type Answers = Map<string, unknown>
export type ConditionResult = { hidden: Set<string>; answers: Answers }

const ATTR = "showIf"

function shape(raw: unknown): { response: string; options: string[] } {
  const condition = record(raw)
  return {
    response: typeof condition.response === "string" ? condition.response : "",
    options: isPhpArray(condition.options) ? Object.values(condition.options).filter((option): option is string => typeof option === "string") : [],
  }
}

export function conditionHolds(raw: unknown, answers: Answers): boolean {
  const condition = shape(raw)
  const value = answers.get(condition.response) ?? null
  const chosen = (isPhpArray(value) ? Object.values(value) : [value]).filter((item): item is string => typeof item === "string")
  return condition.options.some((option) => chosen.includes(option))
}

export function conditionShows(raw: unknown, answers: Answers): boolean {
  return !answers.has(shape(raw).response) || conditionHolds(raw, answers)
}

export function responseVisible(attrs: unknown, answers: Answers): boolean {
  const condition = record(attrs)[ATTR]
  return !isPhpArray(condition) || conditionShows(condition, answers)
}

export function conditionResponses(node: unknown): PhpRecord[] {
  if (!isPhpArray(node)) return []
  const current = record(node)
  const found = current.type === RESPONSE_NODE && isPhpArray(current.attrs) ? [record(current.attrs)] : []
  return [...found, ...(isPhpArray(current.content) ? list(current.content).flatMap(conditionResponses) : [])]
}

export function evaluateConditions(fields: { key: string; document: unknown }[], fieldConditions: Record<string, PhpRecord>): { hidden: Set<string>; answers: Answers } {
  const hidden = new Set<string>()
  const answers: Answers = new Map()
  for (const field of fields) {
    const condition = fieldConditions[field.key]
    const shown = condition === undefined || condition === null || conditionShows(condition, answers)
    if (!shown) hidden.add(field.key)
    for (const attrs of conditionResponses(field.document)) {
      const id = attrs.id
      if (typeof id !== "string" || answers.has(id)) continue
      answers.set(id, shown && responseVisible(attrs, answers) ? (attrs.value ?? null) : null)
    }
  }
  return { hidden, answers }
}

export function syllabusConditions(
  template: SyllabusTemplate,
  fieldConditions: Record<string, PhpRecord>,
  values: Map<string, unknown>,
  templates: Record<string, unknown>,
): ConditionResult {
  const ids = new Map<string, string>()
  const fields = template.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.fields.map((field) => {
        ids.set(field.key, field.id)
        const document = field.responsible === INSTITUTIONAL ? field.content : values.has(field.id) ? values.get(field.id) : (templates[field.id] ?? field.content)
        return { key: field.key, document }
      }),
    ),
  )
  const result = evaluateConditions(fields, fieldConditions)
  return { hidden: new Set([...result.hidden].flatMap((key) => (ids.has(key) ? [ids.get(key)!] : []))), answers: result.answers }
}

export function clearHidden(document: unknown, answers: Answers, optional = false): unknown {
  if (!isPhpArray(document) || Array.isArray(document)) return document
  let node = record(document)
  const attrs = node.attrs
  if (node.type === RESPONSE_NODE && isPhpArray(attrs) && isPhpArray(record(attrs)[ATTR]) && !conditionShows(record(attrs)[ATTR], answers)) {
    node = unanswered(node)
    if (optional) node = { ...node, attrs: { ...record(node.attrs), required: false } }
  }
  if (isPhpArray(node.content)) node = { ...node, content: list(node.content).map((child) => clearHidden(child, answers, optional)) }
  return node
}

export function shownResponses(document: unknown, answers: Answers): PhpRecord {
  const shown = conditionResponses(document).filter((attrs) => responseVisible(attrs, answers))
  return { type: "doc", content: [{ type: "paragraph", content: shown.map((attrs) => ({ type: RESPONSE_NODE, attrs })) }] }
}
