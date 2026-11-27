"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { teacherEditsAllowed, withinResponse } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

const LABEL = "El docente puede editar este texto"

export function TeacherEditsToggle({ id, document, disabled = false, onChange }: { id: string; document: DocumentNode | null | undefined; disabled?: boolean; onChange: (allowed: boolean) => void }) {
  const hasSpaces = withinResponse(document)

  return (
    <Field orientation="horizontal" data-disabled={disabled || hasSpaces || undefined}>
      <Checkbox
        id={`teacher-edits-${id}`}
        aria-label={LABEL}
        checked={!hasSpaces && teacherEditsAllowed(document)}
        disabled={disabled || hasSpaces}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
      <FieldContent>
        <FieldLabel htmlFor={`teacher-edits-${id}`} className="font-normal">
          {LABEL}
        </FieldLabel>
        {hasSpaces ? <FieldDescription>Quite los espacios de respuesta para activarla</FieldDescription> : null}
      </FieldContent>
    </Field>
  )
}
