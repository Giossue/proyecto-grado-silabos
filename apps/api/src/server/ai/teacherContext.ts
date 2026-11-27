import { definitionHash } from "../ficha/definitionHash"
import { list, phpEquals, phpString, record, type PhpRecord } from "../configuration/phpValues"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { fieldSection, teacherEditable, templateFields, type SyllabusTemplate, type TemplateField } from "../configuration/templatePresentation"
import { fieldResponseNormalize } from "../configuration/templateRehearsal"
import { responseVisible, syllabusConditions, type Answers } from "../configuration/responseConditions"
import { hasOwnText, openShape, teacherEdits, writtenValue } from "../configuration/teacherText"
import {
  blank,
  expandBlock,
  fieldConditions,
  listTable,
  normalizeFieldDocument,
  RESPONSE_NODE,
  responseAnswered,
  responseLines,
  responsesEnabled,
  responseTemplate,
  TemplateValidationError,
  withoutOwnOptions,
  type TemplateDefinition,
} from "../configuration/templateRuntime"
import type { TemplateStore } from "../shared/templateStore"
import { draftDocument, draftFieldLimit, draftLimitProblem } from "../syllabus/draftField"
import { buildIdentification } from "../syllabus/identificationCard"
import { canonical } from "./php"
import { aiReadableFields, holdsDisabilityData } from "./readableFields"

export const SYSTEM_DATA = "[dato del sistema]"
export const OMITTED = "[contenido omitido]"
export const EMPTY_PROPOSAL = "Escriba el texto de la propuesta."
export const INVALID_PROPOSAL = "El texto de la propuesta no es válido."
export const MARKER_PROPOSAL = "La propuesta no puede incluir «[dato del sistema]» ni «[contenido omitido]». Escriba el texto sin esas marcas."
const HIDDEN_DATA_MARKER = /\[\s*(datos?\s+del\s+sistema|contenido\s+omitido)\s*\]/i

const UNFILLED = "[espacio sin llenar]"
const PLAIN_TEXT_NODES = ["doc", "paragraph", "bulletList", "orderedList", "listItem", "text", "hardBreak"]
const PROPOSAL_CHARACTERS = 20000
const RESPONSE_CHARACTERS = 3000
const BULLET = /^\s*[-•*]\s+(.*)$/u
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/u
const LEFT = { textAlign: "left" }

export type SubjectData = {
  asignatura: string
  horas_docencia: string
  horas_practicas: string
  horas_autonomas: string
  horas_totales: string
  creditos: string
  semanas: string
}

export type SnapshotSource = {
  template: SyllabusTemplate
  templates: Record<string, PhpRecord>
  values: Map<string, unknown>
  allowedKeys: ReadonlySet<string>
  academicContext: unknown
}

export type SyllabusReading = {
  templates: TemplateStore
  values(syllabusId: string): Promise<Map<string, unknown>>
  academicContext(syllabusId: string): Promise<unknown>
  allowedKeys(templateId: string): Promise<Set<string>>
}

export type TargetKind = "campo" | "espacio"
export type AssistantTarget = {
  name: string
  kind: TargetKind
  space: number | null
  path: number[]
  baseHash: string
  text: string
  maxCharacters: number | null
}
export type ReadableField = { field: TemplateField; sectionTitle: string; label: string; document: PhpRecord; text: string; limit: number | null; targets: AssistantTarget[] }
export type AssistantSnapshot = SnapshotSource & { subject: SubjectData; fields: ReadableField[] }

type Space = { path: number[]; mold: PhpRecord; node: PhpRecord }
type Rendering = { definition: TemplateDefinition; answers: Answers; markers: Map<string, string> }

export function sendable(text: string, definition: TemplateDefinition): string {
  return holdsDisabilityData(text, definition) ? OMITTED : text
}

function subjectData(context: unknown, definition: TemplateDefinition): SubjectData {
  const found = buildIdentification(context, [], [], [])
  const safe = (value: string) => sendable(value, definition)
  return {
    asignatura: safe(found.subject),
    horas_docencia: safe(found.hours_ac),
    horas_practicas: safe(found.hours_pae),
    horas_autonomas: safe(found.hours_aa),
    horas_totales: safe(found.total_hours),
    creditos: safe(found.credits),
    semanas: safe(found.teaching_weeks),
  }
}

const childrenOf = (node: PhpRecord): PhpRecord[] => (typeof node.content === "object" && node.content !== null ? list(node.content).map(record) : [])

function innerText(node: PhpRecord, rendering: Rendering, path: number[] | null): string {
  const type = node.type
  if (type === "text") return phpString(node.text ?? "")
  if (type === "hardBreak") return "\n"
  if (type === "variable") return SYSTEM_DATA
  if (type === RESPONSE_NODE) return responseVisible(node.attrs, rendering.answers) ? responseLines(node.attrs).join(", ") : ""
  if (type === "documentBlock") return expandBlock(node, {}, rendering.definition).map((child) => rendered(record(child), rendering, null)).join("\n")
  const parts = childrenOf(node).map((child, index) => rendered(child, rendering, path === null ? null : [...path, index]))
  if (type === "tableRow") return parts.join(" | ")
  if (type === "listItem") return `• ${parts.join("\n")}`
  return parts.join(type === "paragraph" ? "" : "\n")
}

function rendered(node: PhpRecord, rendering: Rendering, path: number[] | null): string {
  const text = innerText(node, rendering, path)
  const marker = path === null ? undefined : rendering.markers.get(path.join("."))
  if (marker !== undefined) return `[destino ${marker}: ${text.trim() === "" ? "vacío" : text}]`
  return node.type === RESPONSE_NODE && text === "" && responseVisible(node.attrs, rendering.answers) ? UNFILLED : text
}

function tidy(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim()
}

function answerShape(source: unknown, definition: TemplateDefinition): PhpRecord {
  return record(withoutOwnOptions(responseTemplate(normalizeFieldDocument(openShape(source), definition))))
}

function plainOnly(node: PhpRecord): boolean {
  return PLAIN_TEXT_NODES.includes(String(node.type)) && childrenOf(node).every(plainOnly)
}

function currentDocument(source: unknown, stored: unknown, content: unknown, definition: TemplateDefinition): { document: PhpRecord; fits: boolean } | null {
  try {
    const held = writtenValue(source, stored)
    if (teacherEdits(source)) return { document: normalizeFieldDocument(hasOwnText(held) ? held : openShape(source), definition), fits: true }
    try {
      return { document: fieldResponseNormalize(source, stored, definition, "value", content), fits: true }
    } catch (error) {
      if (!(error instanceof TemplateValidationError)) throw error
      const untouched = phpEquals(normalizeFieldDocument(held, definition), normalizeFieldDocument(openShape(source), definition))
      return untouched ? { document: answerShape(source, definition), fits: true } : { document: normalizeFieldDocument(held, definition), fits: false }
    }
  } catch (error) {
    if (error instanceof TemplateValidationError) return null
    throw error
  }
}

function writtenWhole(source: unknown, definition: TemplateDefinition): boolean {
  if (teacherEdits(source)) return true
  return responsesEnabled(definition) ? blank(answerShape(source, definition)) : plainOnly(normalizeFieldDocument(openShape(source), definition))
}

function textSpaces(mold: PhpRecord, node: PhpRecord, path: number[], inTable: boolean, answers: Answers): Space[] {
  if (mold.type === RESPONSE_NODE) {
    const attrs = record(mold.attrs)
    return attrs.kind === "texto" && !responseAnswered(attrs) && node.type === RESPONSE_NODE && responseVisible(node.attrs, answers) ? [{ path, mold, node }] : []
  }
  if (mold.type === "tableHeader" || mold.type === "documentBlock") return []
  if (blank(mold)) return mold.type === "paragraph" && node.type === "paragraph" && !inTable ? [{ path, mold, node }] : []
  const expected = childrenOf(mold)
  const actual = childrenOf(node)
  if (mold.type === "table" && listTable(mold)) while (expected.length < actual.length) expected.push(expected[expected.length - 1])
  return actual.flatMap((child, index) => (expected[index] === undefined ? [] : textSpaces(expected[index], child, [...path, index], inTable || mold.type === "table", answers)))
}

const hashOf = (node: unknown): string => definitionHash(canonical(node))

function targetsOf(key: string, source: unknown, document: PhpRecord, rendering: Omit<Rendering, "markers">): AssistantTarget[] {
  const { definition } = rendering
  const plain: Rendering = { ...rendering, markers: new Map() }
  const textOf = (node: PhpRecord) => sendable(tidy(innerText(node, plain, null)), definition)
  if (writtenWhole(source, definition)) {
    if (!plainOnly(document)) return []
    return [{ name: key, kind: "campo", space: null, path: [], baseHash: hashOf(document), text: textOf(document), maxCharacters: null }]
  }
  if (!responsesEnabled(definition)) return []
  return textSpaces(answerShape(source, definition), document, [], false, rendering.answers).map(({ path, node }, index) => ({
    name: `${key}#${index + 1}`,
    kind: "espacio",
    space: index + 1,
    path,
    baseHash: hashOf(node),
    text: textOf(node),
    maxCharacters: node.type === RESPONSE_NODE ? Number(record(node.attrs).maxLength ?? RESPONSE_CHARACTERS) : null,
  }))
}

export function assistantSnapshot(source: SnapshotSource): AssistantSnapshot {
  const { template, templates, values, allowedKeys } = source
  const definition = template.definition
  const conditions = syllabusConditions(template, fieldConditions(definition), values, templates)
  const fields: ReadableField[] = []
  for (const field of aiReadableFields(definition, templateFields(template), allowedKeys)) {
    if (!teacherEditable(field, templates) || conditions.hidden.has(field.id)) continue
    const fieldSource = templates[field.id] ?? field.content
    const stored = values.get(field.id) ?? fieldSource
    if ([fieldSource, stored].some((candidate) => holdsDisabilityData(candidate, definition))) continue
    const current = currentDocument(fieldSource, stored, field.content, definition)
    if (current === null || holdsDisabilityData(current.document, definition)) continue
    const base = { definition, answers: conditions.answers }
    const targets = current.fits ? targetsOf(field.key, fieldSource, current.document, base) : []
    const markers = new Map(targets.filter((target) => target.kind === "espacio").map((target) => [target.path.join("."), target.name]))
    const sectionTitle = sendable(fieldSection(template, field)?.title ?? "", definition)
    fields.push({
      field,
      sectionTitle,
      label: sendable(field.label.trim(), definition) || sectionTitle,
      document: current.document,
      text: sendable(tidy(rendered(current.document, { ...base, markers }, [])), definition),
      limit: draftFieldLimit(field, templates[field.id], definition),
      targets,
    })
  }
  return { ...source, subject: subjectData(source.academicContext, definition), fields }
}

export async function readAssistantSnapshot(reading: SyllabusReading, syllabus: { id: string; subjectId: string }): Promise<AssistantSnapshot | null> {
  const template = await reading.templates.template()
  if (template === null) return null
  return assistantSnapshot({
    template,
    templates: await profileTemplates({ template, definition: template.definition, store: reading.templates }, syllabus.subjectId),
    values: await reading.values(syllabus.id),
    allowedKeys: await reading.allowedKeys(template.id),
    academicContext: await reading.academicContext(syllabus.id),
  })
}

export function proposalText(text: string): string {
  return text
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(/\t/g, " ")
    .replace(/(?!\n)[\p{Cc}\u200b\u202a-\u202e\u2066-\u2069]/gu, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

const paragraphOf = (text: string): PhpRecord => ({ type: "paragraph", attrs: LEFT, content: [{ type: "text", text }] })

function textBlocks(text: string): PhpRecord[] {
  const blocks: PhpRecord[] = []
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue
    const bullet = BULLET.exec(line)
    const numbered = bullet === null ? NUMBERED.exec(line) : null
    const kind = bullet !== null ? "bulletList" : numbered !== null ? "orderedList" : null
    if (kind === null) {
      blocks.push(paragraphOf(line.trim()))
      continue
    }
    const item = { type: "listItem", content: [paragraphOf((bullet ?? (numbered as RegExpExecArray))[1].trim())] }
    const last = blocks[blocks.length - 1]
    if (last?.type === kind) (last.content as PhpRecord[]).push(item)
    else blocks.push({ type: kind, content: [item] })
  }
  return blocks
}

function lines(text: string): PhpRecord[] {
  return text.split("\n").flatMap((line, index) => [...(index > 0 ? [{ type: "hardBreak" }] : []), ...(line === "" ? [] : [{ type: "text", text: line }])])
}

function replacedAt(node: PhpRecord, path: number[], change: (found: PhpRecord) => PhpRecord): PhpRecord {
  if (path.length === 0) return change(node)
  const [head, ...rest] = path
  return { ...node, content: childrenOf(node).map((child, index) => (index === head ? replacedAt(child, rest, change) : child)) }
}

export function applyToTarget(snapshot: AssistantSnapshot, readable: ReadableField, target: AssistantTarget, text: string): { value: PhpRecord } | { problem: string } {
  const definition = snapshot.template.definition
  const written = proposalText(text)
  if (written === "") return { problem: EMPTY_PROPOSAL }
  if (HIDDEN_DATA_MARKER.test(written)) return { problem: MARKER_PROPOSAL }
  if ([...written].length > PROPOSAL_CHARACTERS || holdsDisabilityData(written, definition)) return { problem: INVALID_PROPOSAL }
  const value =
    target.kind === "campo"
      ? { type: "doc", content: textBlocks(written) }
      : replacedAt(readable.document, target.path, (node) =>
          node.type === RESPONSE_NODE ? { ...node, attrs: { ...record(node.attrs), value: written } } : { ...node, content: lines(written) },
        )
  const { field } = readable
  let document: PhpRecord
  try {
    document = draftDocument(field, snapshot.templates[field.id], value, definition)
  } catch (error) {
    if (error instanceof TemplateValidationError) return { problem: Object.values(error.errors).flat()[0] ?? INVALID_PROPOSAL }
    throw error
  }
  if (readable.limit !== null) {
    const problem = draftLimitProblem({ template: snapshot.template, field, templates: snapshot.templates }, readable.limit, snapshot.values, document)
    if (problem !== null) return { problem }
  }
  return { value: document }
}
