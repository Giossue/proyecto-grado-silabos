import { TEACHER_EDITS, TEACHER_FILLS, teacherEditsAllowed, teacherFillsAllowed, teacherFillsMarked, withinResponse } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

const unmarked = (document: DocumentNode): DocumentNode => {
  const copy = { ...document }
  delete copy.attrs
  return copy
}

export const withoutDocumentMarks = (document: DocumentNode): DocumentNode => {
  if (!teacherEditsAllowed(document) && !teacherFillsMarked(document)) return document
  return unmarked(document)
}

export const keepDocumentMarks = (next: DocumentNode, current: DocumentNode | null | undefined, template: DocumentNode): DocumentNode => {
  const rest = unmarked(next)
  if (teacherEditsAllowed(current)) return withinResponse(rest) ? rest : { ...rest, attrs: { [TEACHER_EDITS]: true } }
  return teacherFillsMarked(current) && teacherFillsAllowed(template, rest) ? { ...rest, attrs: { [TEACHER_FILLS]: true } } : rest
}
