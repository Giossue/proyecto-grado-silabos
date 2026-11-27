import { OWN_TEXT, responseAttrs, responseLines, TEACHER_EDITS, TEACHER_FILLS } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { isPhpArray, phpEquals, type PhpRecord } from "./phpValues"

const TEACHER_DEFAULT = "teacherDefault"

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

export function teacherFills(value: unknown): boolean {
  return rootAttr(value, TEACHER_FILLS) === true
}

export function markTeacherFills(document: PhpRecord): PhpRecord {
  const attrs = isPhpArray(document.attrs) ? (document.attrs as PhpRecord) : {}
  return { ...document, attrs: { ...attrs, [TEACHER_FILLS]: true } }
}

export function withoutTeacherFills(document: PhpRecord): PhpRecord {
  if (!teacherFills(document)) return document
  const { attrs, ...rest } = document
  const kept = Object.entries(attrs as PhpRecord).filter(([name]) => name !== TEACHER_FILLS)
  return kept.length === 0 ? rest : { ...rest, attrs: Object.fromEntries(kept) }
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

function spaceAsText(value: unknown): unknown {
  const space = loneSpace(value)
  return space === null ? value : { type: "doc", content: String(space.value ?? "").split("\n").map(paragraph) }
}

export function markTeacherDefault(document: PhpRecord, wholeText: boolean): PhpRecord {
  return { ...document, attrs: { ...(wholeText ? { [TEACHER_EDITS]: true } : {}), [TEACHER_DEFAULT]: true } }
}

export function teacherDefault(value: unknown): boolean {
  return rootAttr(value, TEACHER_DEFAULT) === true
}

function hasNode(node: unknown, type: string): boolean {
  return (isPhpArray(node) && (node as PhpRecord).type === type) || nodesIn(node).some((child) => hasNode(child, type))
}

function written(node: unknown): string {
  const current = (isPhpArray(node) ? node : {}) as PhpRecord
  if (current.type === "text") return String(current.text ?? "").trim()
  if (current.type === "variable" || current.type === "documentBlock") return String(current.type)
  return nodesIn(current).map(written).join("")
}

function responsesAsText(node: PhpRecord): PhpRecord {
  if (!Array.isArray(node.content)) return node
  const content = nodesIn(node).flatMap((child) => {
    if (child.type !== "response") return [responsesAsText(child)]
    const text = responseLines(responseAttrs(child as unknown as DocumentNode)).join(", ")
    return text === "" ? [] : [{ type: "text", text, ...(child.marks === undefined ? {} : { marks: child.marks }) }]
  })
  if (content.length > 0 || node.type !== "paragraph") return { ...node, content }
  const { content: _emptied, ...rest } = node
  void _emptied
  return rest
}

function emptyBlock(node: PhpRecord): boolean {
  return ["paragraph", "tableCell"].includes(String(node.type)) && nodesIn(node).every((child) => child.type === "paragraph" && emptyBlock(child))
}

function withoutEmptyParts(node: PhpRecord): PhpRecord {
  if (!Array.isArray(node.content)) return node
  const kept = nodesIn(node).filter((child) => {
    if (child.type === "tableRow") return !nodesIn(child).every((cell) => cell.type === "tableCell" && emptyBlock(cell))
    return !(node.type === "doc" && child.type === "paragraph" && emptyBlock(child))
  })
  return { type: node.type, ...(node.type === "doc" || node.attrs === undefined ? {} : { attrs: node.attrs }), content: kept.map(withoutEmptyParts) }
}

export function addsNothing(template: unknown, value: unknown): boolean {
  return phpEquals(withoutEmptyParts(template as PhpRecord), withoutEmptyParts(value as PhpRecord))
}

function teacherHeld(template: unknown, value: unknown): unknown {
  if (!isPhpArray(value) || (value as PhpRecord).type !== "doc") return value
  const document = value as PhpRecord
  const plain = hasNode(document, "response") ? responsesAsText(spaceAsText(document) as PhpRecord) : document
  if (!teacherEdits(template)) return plain
  if (hasOwnText(document)) return document
  if (teacherDefault(document) || written(plain) === "" || addsNothing(template, plain)) return template
  return markOwnText(plain)
}

export function writtenValue(template: unknown, value: unknown): unknown {
  if (teacherDefault(template)) return teacherHeld(template, value)
  return openShape(template) === template ? value : spaceAsText(value)
}
