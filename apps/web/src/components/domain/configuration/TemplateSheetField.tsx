"use client"

import type { Editor } from "@tiptap/core"
import { useEffect, useRef, useState } from "react"
import type { TemplateField } from "@/api/template"
import { TemplateInlineText, type TemplateInlineTextHandle } from "@/components/domain/configuration/TemplateInlineText"
import { FreeTextEditor, type FreeTextEditorHandle } from "@/components/domain/syllabus/FreeTextEditor"
import type { DocumentNode, TemplateVariable } from "@silabos/shared/lib/templateDocument"

type TemplateSheetFieldProps = {
  field: TemplateField
  onFieldChange: (field: TemplateField) => void
  block?: boolean
  locked: boolean
  focusOnCreate?: boolean
  naming?: boolean
  variables?: TemplateVariable[]
  onSelect?: (editor: Editor | null) => void
  onNamed?: () => void
}

export function TemplateSheetField({ field, onFieldChange, block = false, locked, focusOnCreate = false, naming = false, variables, onSelect, onNamed }: TemplateSheetFieldProps) {
  const editorHandle = useRef<FreeTextEditorHandle | null>(null)
  const focused = useRef(false)
  const labelInput = useRef<TemplateInlineTextHandle | null>(null)
  const [labelFocused, setLabelFocused] = useState(false)
  const showsLabel = field.label.trim() !== "" || naming || labelFocused
  const name = field.label.trim() || "Campo sin nombre"

  const patch = (changes: Partial<TemplateField>): void => onFieldChange({ ...field, ...changes })
  const attachEditor = (handle: FreeTextEditorHandle | null): void => {
    editorHandle.current = handle
    if (!focusOnCreate || focused.current || !handle?.editor) return
    focused.current = true
    handle.editor.commands.focus("end")
  }
  const select = (): void => onSelect?.(editorHandle.current?.editor ?? null)
  const leaveLabel = (): void => {
    setLabelFocused(false)
    onNamed?.()
  }

  useEffect(() => {
    if (naming) labelInput.current?.focus()
  }, [naming])

  return (
    <div data-field-editor={field.id} className="flex min-w-0 flex-col gap-1" onFocus={select} onPointerDown={select}>
      {showsLabel ? (
        <div data-field-label className="flex min-w-0 font-bold">
          <TemplateInlineText
            ref={labelInput}
            value={field.label}
            maxLength={180}
            placeholder="Nombre del campo"
            label={`Nombre del campo ${name}`}
            disabled={locked || block}
            onValueChange={(label) => patch({ label })}
            onFocus={() => setLabelFocused(true)}
            onBlur={leaveLabel}
          />
        </div>
      ) : null}
      <div data-field-body>
        <FreeTextEditor
          id={`field-content-${field.id}`}
          ref={attachEditor}
          value={field.content}
          label={`Contenido de ${name}`}
          blocks={field.quien_llena === "institucional" ? "fill" : "configure"}
          disabled={locked || block}
          variables={variables}
          toolbar={false}
          align
          bare
          onValueChange={(content: DocumentNode) => patch({ content })}
        />
      </div>
    </div>
  )
}
