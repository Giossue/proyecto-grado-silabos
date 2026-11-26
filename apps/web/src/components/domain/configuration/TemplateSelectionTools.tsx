"use client"

import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, Copy, FileStack, FolderInput, RectangleHorizontal, RectangleVertical, Trash2 } from "lucide-react"
import type { TemplateField, TemplatePreset, TemplateSectionPayload } from "@/api/template"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { TemplateRibbonDivider, TemplateRibbonGroup } from "@/components/domain/configuration/TemplateRibbonGroup"
import { Button } from "@/components/ui/button"
import { TemplateEditabilityToggle, TemplateFieldNameInput } from "@/components/domain/configuration/TemplateFieldControls"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { FieldResponsible } from "@/types/configuration"

export type TemplateSelection =
  | { kind: "field"; field: TemplateField; canMoveUp: boolean; canMoveDown: boolean }
  | { kind: "section"; section: TemplateSectionPayload; canMoveUp: boolean; canMoveDown: boolean }

export type TemplateSectionTarget = { id: string; title: string }

type TemplateSelectionToolsProps = {
  selection: TemplateSelection | null
  locked: boolean
  busy: boolean
  targets?: TemplateSectionTarget[]
  children?: ReactNode
  onResponsible: (value: FieldResponsible) => void
  onName: (label: string) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onOrientation: () => void
  onDuplicate: () => void
  onMoveTo: (sectionId: string) => void
}

type TemplatePresetToolProps = {
  presets?: TemplatePreset[]
  allowed: boolean
  disabled?: boolean
  onPreset: (preset: TemplatePreset) => void
}

const nameOf = (field: TemplateField): string => field.label.trim() || "Campo sin nombre"

export function TemplatePresetTool({ presets, allowed, disabled = false, onPreset }: TemplatePresetToolProps) {
  if (!presets?.length) return null
  const tooltip = allowed ? "Reemplaza el contenido del campo por uno ya armado" : "Contenido predefinido: elija un campo"

  return (
    <MenuTooltip label={tooltip}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label="Contenido predefinido" disabled={disabled || !allowed} data-preset-tool onMouseDown={(event) => event.preventDefault()}>
            <FileStack data-icon="inline-start" aria-hidden="true" />
            Contenido predefinido
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Contenido predefinido</DropdownMenuLabel>
            {presets.map((preset) => (
              <DropdownMenuItem key={preset.key} onSelect={() => onPreset(preset)}>{preset.label}</DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuTooltip>
  )
}

export function TemplateSelectionTools({ selection, locked, busy, targets, children, onResponsible, onName, onMove, onRemove, onOrientation, onDuplicate, onMoveTo }: TemplateSelectionToolsProps) {
  if (selection?.kind === "field") {
    const fieldName = nameOf(selection.field)
    return (
      <div data-tour="template-selection" className="flex shrink-0 items-stretch" role="group" aria-label="Campo seleccionado">
        <TemplateRibbonGroup label="Nombre">
          <TemplateFieldNameInput field={selection.field} disabled={locked} className="w-44" onName={onName} />
        </TemplateRibbonGroup>
        <TemplateRibbonDivider />
        <TemplateRibbonGroup label="Quién lo llena">
          <TemplateEditabilityToggle field={selection.field} disabled={locked} onResponsible={onResponsible} />
        </TemplateRibbonGroup>
        {children ? (
          <>
            <TemplateRibbonDivider />
            {children}
          </>
        ) : null}
        <TemplateRibbonDivider />
        <TemplateRibbonGroup label="Organizar">
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
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
                  {targets?.map((target) => (
                    <DropdownMenuItem key={target.id} onSelect={() => onMoveTo(target.id)}>{target.title.trim() || "Sección sin título"}</DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </MenuTooltip>
          <IconTooltip label={`Eliminar el campo ${fieldName}`}>
            <Button type="button" variant="ghost" size="icon-sm" disabled={locked} aria-label={`Eliminar el campo ${fieldName}`} onClick={onRemove}>
              <Trash2 aria-hidden="true" />
            </Button>
          </IconTooltip>
        </TemplateRibbonGroup>
      </div>
    )
  }
  if (selection?.kind !== "section") return null
  const title = selection.section.title
  const landscape = selection.section.orientation === "landscape"

  return (
    <div data-tour="template-selection" className="flex shrink-0 items-stretch" role="group" aria-label="Sección seleccionada">
      <TemplateRibbonGroup label="Orientación">
        <Button type="button" variant="ghost" size="sm" disabled={locked || busy} aria-label={`Orientación de la sección ${title}`} aria-pressed={landscape} onClick={onOrientation}>
          {landscape ? <RectangleHorizontal data-icon="inline-start" aria-hidden="true" /> : <RectangleVertical data-icon="inline-start" aria-hidden="true" />}
          {landscape ? "Horizontal" : "Vertical"}
        </Button>
      </TemplateRibbonGroup>
      <TemplateRibbonDivider />
      <TemplateRibbonGroup label="Organizar">
        <IconTooltip label={`Subir la sección ${title}`}>
          <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy || !selection.canMoveUp} aria-label={`Subir la sección ${title}`} onClick={() => onMove(-1)}>
            <ArrowUp aria-hidden="true" />
          </Button>
        </IconTooltip>
        <IconTooltip label={`Bajar la sección ${title}`}>
          <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy || !selection.canMoveDown} aria-label={`Bajar la sección ${title}`} onClick={() => onMove(1)}>
            <ArrowDown aria-hidden="true" />
          </Button>
        </IconTooltip>
        <IconTooltip label={`Duplicar la sección ${title}`}>
          <Button type="button" variant="ghost" size="icon-sm" disabled={locked || busy} aria-label={`Duplicar la sección ${title}`} onClick={onDuplicate}>
            <Copy aria-hidden="true" />
          </Button>
        </IconTooltip>
        <IconTooltip label={`Eliminar la sección ${title}`}>
          <Button type="button" variant="ghost" size="icon-sm" disabled={locked} aria-label={`Eliminar la sección ${title}`} onClick={onRemove}>
            <Trash2 aria-hidden="true" />
          </Button>
        </IconTooltip>
      </TemplateRibbonGroup>
    </div>
  )
}
