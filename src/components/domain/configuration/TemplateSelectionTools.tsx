"use client"

import { ArrowDown, ArrowUp, ChevronDown, Copy, FolderInput, RectangleHorizontal, RectangleVertical, Trash2 } from "lucide-react"
import type { TemplateField, TemplatePreset, TemplateSectionPayload } from "@/api/template"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FIELD_EDITABILITY, editabilityLabel, type FieldResponsible } from "@/types/configuration"

export type TemplateSelection =
  | { kind: "field"; field: TemplateField; canMoveUp: boolean; canMoveDown: boolean }
  | { kind: "section"; section: TemplateSectionPayload; canMoveUp: boolean; canMoveDown: boolean }

export type TemplateSectionTarget = { id: string; title: string }

type TemplateSelectionToolsProps = {
  selection: TemplateSelection | null
  presets?: TemplatePreset[]
  locked: boolean
  busy: boolean
  targets?: TemplateSectionTarget[]
  onResponsible: (value: FieldResponsible) => void
  onPreset: (preset: TemplatePreset) => void
  onName: () => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onOrientation: () => void
  onDuplicate: () => void
  onMoveTo: (sectionId: string) => void
}

export function TemplateSelectionTools({ selection, presets, locked, busy, targets, onResponsible, onPreset, onName, onMove, onRemove, onOrientation, onDuplicate, onMoveTo }: TemplateSelectionToolsProps) {
  const fieldName = selection?.kind === "field" ? selection.field.label.trim() || "Campo sin nombre" : ""

  return (
    <div data-tour="template-selection" className="flex shrink-0 items-center gap-0.5" role="group" aria-label={selection?.kind === "section" ? "Sección seleccionada" : "Campo seleccionado"}>
      {selection?.kind === "field" ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={locked} aria-label={`Si se puede editar el campo ${fieldName}`} data-field-responsible>
                {editabilityLabel(selection.field.quien_llena)}
                <ChevronDown data-icon="inline-end" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>¿Se puede editar?</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={selection.field.quien_llena} onValueChange={(value) => onResponsible(value as FieldResponsible)}>
                {FIELD_EDITABILITY.map((item) => (
                  <DropdownMenuRadioItem key={item.value} value={item.value}>{item.label}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {presets?.length ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Plantilla</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {presets.map((preset) => (
                        <DropdownMenuItem key={preset.key} onSelect={() => onPreset(preset)}>{preset.label}</DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              ) : null}
              {!selection.field.label.trim() ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onName}>Ponerle nombre</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <IconTooltip label={`Subir el campo ${fieldName}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy || !selection.canMoveUp} aria-label={`Subir el campo ${fieldName}`} onClick={() => onMove(-1)}>
              <ArrowUp aria-hidden="true" />
            </Button>
          </IconTooltip>
          <IconTooltip label={`Bajar el campo ${fieldName}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy || !selection.canMoveDown} aria-label={`Bajar el campo ${fieldName}`} onClick={() => onMove(1)}>
              <ArrowDown aria-hidden="true" />
            </Button>
          </IconTooltip>
          <IconTooltip label={`Duplicar el campo ${fieldName}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy} aria-label={`Duplicar el campo ${fieldName}`} onClick={onDuplicate}>
              <Copy aria-hidden="true" />
            </Button>
          </IconTooltip>
          <MenuTooltip label="Mover a…">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy || !targets?.length} aria-label={`Mover el campo ${fieldName} a otra sección`}>
                  <FolderInput aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
                {targets?.map((target) => (
                  <DropdownMenuItem key={target.id} onSelect={() => onMoveTo(target.id)}>{target.title.trim() || "Sección sin título"}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </MenuTooltip>
          <IconTooltip label={`Eliminar el campo ${fieldName}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked} aria-label={`Eliminar el campo ${fieldName}`} onClick={onRemove}>
              <Trash2 aria-hidden="true" />
            </Button>
          </IconTooltip>
        </>
      ) : selection?.kind === "section" ? (
        <>
          <Button type="button" variant="ghost" size="sm" disabled={locked || busy} aria-label={`Orientación de la sección ${selection.section.title}`} aria-pressed={selection.section.orientation === "landscape"} onClick={onOrientation}>
            {selection.section.orientation === "landscape" ? <RectangleHorizontal data-icon="inline-start" aria-hidden="true" /> : <RectangleVertical data-icon="inline-start" aria-hidden="true" />}
            {selection.section.orientation === "landscape" ? "Horizontal" : "Vertical"}
          </Button>
          <IconTooltip label={`Subir la sección ${selection.section.title}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy || !selection.canMoveUp} aria-label={`Subir la sección ${selection.section.title}`} onClick={() => onMove(-1)}>
              <ArrowUp aria-hidden="true" />
            </Button>
          </IconTooltip>
          <IconTooltip label={`Bajar la sección ${selection.section.title}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy || !selection.canMoveDown} aria-label={`Bajar la sección ${selection.section.title}`} onClick={() => onMove(1)}>
              <ArrowDown aria-hidden="true" />
            </Button>
          </IconTooltip>
          <IconTooltip label={`Duplicar la sección ${selection.section.title}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy} aria-label={`Duplicar la sección ${selection.section.title}`} onClick={onDuplicate}>
              <Copy aria-hidden="true" />
            </Button>
          </IconTooltip>
          <IconTooltip label={`Eliminar la sección ${selection.section.title}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked} aria-label={`Eliminar la sección ${selection.section.title}`} onClick={onRemove}>
              <Trash2 aria-hidden="true" />
            </Button>
          </IconTooltip>
        </>
      ) : (
        <span className="min-w-0 basis-0 grow truncate px-2 text-sm text-muted-foreground">Seleccione un campo</span>
      )}
    </div>
  )
}
