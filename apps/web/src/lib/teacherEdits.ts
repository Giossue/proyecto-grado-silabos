import { TEACHER_EDITS, teacherEditsAllowed, withinResponse } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

const unmarked = (document: DocumentNode): DocumentNode => {
  const copy = { ...document }
  delete copy.attrs
  return copy
}

export const withoutDocumentMarks = (document: DocumentNode): DocumentNode => {
  if (!teacherEditsAllowed(document)) return document
  return unmarked(document)
}

export const keepTeacherEdits = (document: DocumentNode, allowed: boolean): DocumentNode => {
  const rest = unmarked(document)
  return allowed && !withinResponse(document) ? { ...rest, attrs: { [TEACHER_EDITS]: true } } : rest
}
