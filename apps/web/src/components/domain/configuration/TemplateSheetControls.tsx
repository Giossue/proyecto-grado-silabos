"use client"

import { GripVertical } from "lucide-react"
import { memo, type DragEvent } from "react"
import type { TemplateSectionPayload } from "@/api/template"
import { TemplateInlineText } from "@/components/domain/configuration/TemplateInlineText"
import { TemplateInsertPoint, type InsertAction } from "@/components/domain/configuration/TemplateInsertPoint"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SheetItemKind = "field" | "section"
export type InsertPlace = "section-top" | "field-top" | "after-last" | "empty"

type TemplateDragHandleProps = {
  kind: SheetItemKind
  id: string
  label: string
  disabled: boolean
  selected: boolean
  className?: string
  onSelect: (kind: SheetItemKind, id: string) => void
  onDragStart: (event: DragEvent, item: { kind: SheetItemKind; id: string }) => void
  onDragEnd: () => void
}

type TemplateSheetInsertPointProps = {
  place: InsertPlace
  sectionId: string
  sectionIndex: number
  fieldIndex: number
  disabled: boolean
  onInsert: (key: string, place: InsertPlace, sectionId: string, sectionIndex: number, fieldIndex: number) => void
}

const SECTION: InsertAction[] = [{ key: "section", label: "Nueva sección" }]
const FIELD: InsertAction[] = [{ key: "field", label: "Agregar campo" }]
const BOTH: InsertAction[] = [...SECTION, ...FIELD]

export const TemplateDragHandle = memo(function TemplateDragHandle({ kind, id, label, disabled, selected, className, onSelect, onDragStart, onDragEnd }: TemplateDragHandleProps) {
  return (
    <IconTooltip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-drag-handle
        draggable={!disabled}
        disabled={disabled}
        aria-label={label}
        className={cn("absolute cursor-grab text-muted-foreground opacity-0 focus-visible:opacity-100", className, selected && "opacity-100")}
        onClick={() => onSelect(kind, id)}
        onDragStart={(event) => onDragStart(event, { kind, id })}
        onDragEnd={onDragEnd}
      >
        <GripVertical aria-hidden="true" />
      </Button>
    </IconTooltip>
  )
})

export const TemplateSheetInsertPoint = memo(function TemplateSheetInsertPoint({ place, sectionId, sectionIndex, fieldIndex, disabled, onInsert }: TemplateSheetInsertPointProps) {
  const actions = place === "section-top" ? SECTION : place === "after-last" ? BOTH : FIELD
  const position = place === "after-last" ? "bottom" : place === "empty" ? "inline" : "top"
  return (
    <TemplateInsertPoint
      disabled={disabled}
      actions={actions}
      position={position}
      gap={place === "section-top" ? "section" : "field"}
      onInsert={(key) => onInsert(key, place, sectionId, sectionIndex, fieldIndex)}
    />
  )
})

type TemplateSectionTitleProps = {
  section: TemplateSectionPayload
  disabled: boolean
  autoFocus: boolean
  onTitle: (section: TemplateSectionPayload, title: string) => void
  onAutoFocused: () => void
}

export const TemplateSectionTitle = memo(function TemplateSectionTitle({ section, disabled, autoFocus, onTitle, onAutoFocused }: TemplateSectionTitleProps) {
  return (
    <TemplateInlineText
      value={section.title}
      maxLength={180}
      disabled={disabled}
      label={`Sección ${section.title}`}
      className="[text-align:inherit]"
      autoFocus={autoFocus}
      onAutoFocused={onAutoFocused}
      onValueChange={(title) => onTitle(section, title)}
    />
  )
})
