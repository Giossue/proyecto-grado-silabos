import { OWN_TEXT, TEACHER_EDITS } from "@silabos/shared/lib/responseKinds"
import { isPhpArray, type PhpRecord } from "./phpValues"

function rootAttr(value: unknown, name: string): unknown {
  const attrs = isPhpArray(value) ? (value as PhpRecord).attrs : null
  return isPhpArray(attrs) ? (attrs as PhpRecord)[name] : undefined
}

export function teacherEdits(value: unknown): boolean {
  return rootAttr(value, TEACHER_EDITS) === true
}

export function hasOwnText(value: unknown): boolean {
  return rootAttr(value, OWN_TEXT) === true
}

export function markTeacherEdits(document: PhpRecord): PhpRecord {
  const attrs = isPhpArray(document.attrs) ? (document.attrs as PhpRecord) : {}
  return { ...document, attrs: { ...attrs, [TEACHER_EDITS]: true } }
}

export function markOwnText(document: PhpRecord): PhpRecord {
  return { ...document, attrs: { [OWN_TEXT]: true } }
}

const OWN_RULES = ["maxLength", "showIf", "required"]

function nodesIn(node: unknown): PhpRecord[] {
  const content = isPhpArray(node) ? (node as PhpRecord).content : null
  return Array.isArray(content) ? (content as PhpRecord[]) : []
}

function loneSpace(document: unknown): PhpRecord | null {
  const blocks = nodesIn(document)
  const inlines = blocks.flatMap(nodesIn)
  if (blocks.some((block) => block.type !== "paragraph") || inlines.length !== 1 || inlines[0].type !== "response") return null
  const attrs = (inlines[0].attrs ?? {}) as PhpRecord
  const ruled = OWN_RULES.some((rule) => attrs[rule] !== undefined && attrs[rule] !== null && !(rule === "required" && attrs[rule] === true))
  return attrs.kind === "texto" && !ruled ? attrs : null
}

function paragraph(text: string): PhpRecord {
  return { type: "paragraph", attrs: { textAlign: "left" }, ...(text === "" ? {} : { content: [{ type: "text", text }] }) }
}

/** A field that is nothing but an unanswered «Texto libre» space is written as a whole text, with format. */
export function openShape(template: unknown): unknown {
  const space = loneSpace(template)
  return space !== null && !space.value ? { type: "doc", content: [paragraph("")] } : template
}

export function writtenValue(template: unknown, value: unknown): unknown {
  if (openShape(template) === template) return value
  const space = loneSpace(value)
  return space === null ? value : { type: "doc", content: String(space.value ?? "").split("\n").map(paragraph) }
}
