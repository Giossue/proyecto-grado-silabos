"use client"

import type { ChainedCommands, Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, Braces, Italic, List, ListOrdered, Redo2, Table2, Underline, Undo2 } from "lucide-react"
import type { MouseEvent } from "react"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { TemplateRibbonDivider, TemplateRibbonGroup } from "@/components/domain/configuration/TemplateRibbonGroup"
import { variableNode } from "@/components/domain/syllabus/fieldDocumentExtensions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DOCUMENT_CELL_COLORS, DOCUMENT_TEXT_COLORS, paintCell } from "@/lib/documentPalette"
import type { TemplateVariable } from "@silabos/shared/lib/templateDocument"
import { cn } from "@/lib/utils"

type TemplateFormatToolsProps = {
  editor: Editor | null
  disabled?: boolean
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
}

type TemplateInsertToolsProps = {
  editor: Editor | null
  disabled?: boolean
  variables?: TemplateVariable[]
}

type Chain = (chain: ChainedCommands) => ChainedCommands

const HISTORY = [
  { label: "Deshacer", icon: Undo2, structure: "undo", apply: (chain: ChainedCommands) => chain.undo(), allowed: (editor: Editor) => editor.can().undo() },
  { label: "Rehacer", icon: Redo2, structure: "redo", apply: (chain: ChainedCommands) => chain.redo(), allowed: (editor: Editor) => editor.can().redo() },
] as const
type HistoryStep = (typeof HISTORY)[number]

const MARKS = [
  { name: "bold", label: "Negrita", icon: Bold, toggle: (chain: ChainedCommands) => chain.toggleBold() },
  { name: "italic", label: "Cursiva", icon: Italic, toggle: (chain: ChainedCommands) => chain.toggleItalic() },
  { name: "underline", label: "Subrayado", icon: Underline, toggle: (chain: ChainedCommands) => chain.toggleUnderline() },
] as const
const ALIGNMENTS = [
  { value: "left", label: "Alinear a la izquierda", icon: AlignLeft },
  { value: "center", label: "Centrar", icon: AlignCenter },
  { value: "right", label: "Alinear a la derecha", icon: AlignRight },
  { value: "justify", label: "Justificar", icon: AlignJustify },
] as const
const LISTS = [
  { name: "bulletList", label: "Lista con viñetas", icon: List, toggle: (chain: ChainedCommands) => chain.toggleBulletList() },
  { name: "orderedList", label: "Lista numerada", icon: ListOrdered, toggle: (chain: ChainedCommands) => chain.toggleOrderedList() },
] as const
const TABLE_ACTIONS: Array<{ label: string; apply: Chain; allowed?: (editor: Editor) => boolean }> = [
  { label: "Agregar fila debajo", apply: (chain) => chain.addRowAfter() },
  { label: "Quitar fila", apply: (chain) => chain.deleteRow() },
  { label: "Agregar columna a la derecha", apply: (chain) => chain.addColumnAfter() },
  { label: "Quitar columna", apply: (chain) => chain.deleteColumn() },
  { label: "Combinar celdas", apply: (chain) => chain.mergeCells(), allowed: (editor) => editor.can().mergeCells() },
  { label: "Separar celda", apply: (chain) => chain.splitCell(), allowed: (editor) => editor.can().splitCell() },
  { label: "Celda de encabezado", apply: (chain) => chain.toggleHeaderCell() },
]

const keepFocus = (event: MouseEvent): void => event.preventDefault()

function useFormatCommands(editor: Editor | null, disabled: boolean) {
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber })

  const ready = !disabled && editor !== null && !editor.isDestroyed && editor.isEditable
  const run = (command: Chain): void => {
    if (ready) command(editor.chain().focus()).run()
  }
  const active = (name: string, attributes?: Record<string, unknown>): boolean => ready && editor.isActive(name, attributes)
  const can = (check: (current: Editor) => boolean): boolean => ready && check(editor)
  const returnFocus = (event: Event): void => {
    event.preventDefault()
    if (ready) editor.commands.focus()
  }
  const focused = (): boolean => ready && editor.isFocused
  return { ready, focused, run, active, can, returnFocus }
}

export function TemplateFormatTools({ editor, disabled = false, canUndo = false, canRedo = false, onUndo, onRedo }: TemplateFormatToolsProps) {
  const { ready, focused, run, active, can, returnFocus } = useFormatCommands(editor, disabled)
  const structureAllowed = (step: HistoryStep): boolean => !disabled && (step.structure === "undo" ? canUndo : canRedo)
  const historyAllowed = (step: HistoryStep): boolean => can(step.allowed) || structureAllowed(step)
  const stepHistory = (step: HistoryStep): void => {
    if (focused() && can(step.allowed)) run(step.apply)
    else if (structureAllowed(step)) {
      if (step.structure === "undo") onUndo?.()
      else onRedo?.()
    } else run(step.apply)
  }

  return (
    <div className="flex shrink-0 items-stretch" role="group" aria-label="Formato del texto">
      <TemplateRibbonGroup label="Deshacer">
        {HISTORY.map((step) => (
          <IconTooltip key={step.label} label={step.label}>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={step.label} disabled={!historyAllowed(step)} onMouseDown={keepFocus} onClick={() => stepHistory(step)}>
              <step.icon aria-hidden="true" />
            </Button>
          </IconTooltip>
        ))}
      </TemplateRibbonGroup>
      <TemplateRibbonDivider />
      <TemplateRibbonGroup label="Fuente">
        {MARKS.map((mark) => (
          <IconTooltip key={mark.name} label={mark.label}>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={mark.label} aria-pressed={active(mark.name)} disabled={!ready} className={cn(active(mark.name) && "bg-accent text-accent-foreground")} onMouseDown={keepFocus} onClick={() => run(mark.toggle)}>
              <mark.icon aria-hidden="true" />
            </Button>
          </IconTooltip>
        ))}
        <MenuTooltip label="Color del texto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Color del texto" disabled={!ready} onMouseDown={keepFocus}>
                <Baseline aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onCloseAutoFocus={returnFocus}>
              <DropdownMenuGroup>
                {DOCUMENT_TEXT_COLORS.map((color) => (
                  <DropdownMenuItem key={color.value} onSelect={() => run((chain) => chain.setColor(color.value))}>
                    <span className="size-3 shrink-0 rounded-full ring-1 ring-border" style={{ backgroundColor: color.value }} aria-hidden="true" />
                    {color.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </MenuTooltip>
      </TemplateRibbonGroup>
      <TemplateRibbonDivider />
      <TemplateRibbonGroup label="Párrafo">
        {ALIGNMENTS.map((alignment) => (
          <IconTooltip key={alignment.value} label={alignment.label}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={alignment.label}
              aria-pressed={active("paragraph", { textAlign: alignment.value })}
              disabled={!ready}
              className={cn(active("paragraph", { textAlign: alignment.value }) && "bg-accent text-accent-foreground")}
              onMouseDown={keepFocus}
              onClick={() => run((chain) => chain.setTextAlign(alignment.value))}
            >
              <alignment.icon aria-hidden="true" />
            </Button>
          </IconTooltip>
        ))}
        <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        {LISTS.map((list) => (
          <IconTooltip key={list.name} label={list.label}>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={list.label} aria-pressed={active(list.name)} disabled={!ready} className={cn(active(list.name) && "bg-accent text-accent-foreground")} onMouseDown={keepFocus} onClick={() => run(list.toggle)}>
              <list.icon aria-hidden="true" />
            </Button>
          </IconTooltip>
        ))}
      </TemplateRibbonGroup>
    </div>
  )
}

export function TemplateTextTableTool({ editor, disabled = false }: Omit<TemplateInsertToolsProps, "variables">) {
  const { ready, run, active, can, returnFocus } = useFormatCommands(editor, disabled)
  const inTable = active("table")

  return (
    <MenuTooltip label="Tabla">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label="Tabla" disabled={!ready} className={cn(inTable && "bg-accent text-accent-foreground")}>
            <Table2 data-icon="inline-start" aria-hidden="true" />
            Tabla
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={returnFocus}>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => run((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}>Insertar tabla</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {TABLE_ACTIONS.map((action) => (
              <DropdownMenuItem key={action.label} disabled={!inTable || (action.allowed !== undefined && !can(action.allowed))} onSelect={() => run(action.apply)}>
                {action.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!inTable}>Fondo de celda</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {DOCUMENT_CELL_COLORS.map((color) => (
                  <DropdownMenuItem key={color.value ?? "none"} onSelect={() => run((chain) => paintCell(chain, color))}>
                    {color.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={!inTable} onSelect={() => run((chain) => chain.deleteTable())}>
              Quitar tabla
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuTooltip>
  )
}

export function TemplateVariableTool({ editor, disabled = false, variables }: TemplateInsertToolsProps) {
  const { ready, run, returnFocus } = useFormatCommands(editor, disabled)
  if (!variables?.length) return null

  return (
    <MenuTooltip label="Insertar un dato que el sistema completa solo">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label="Dato automático" disabled={!ready} onMouseDown={keepFocus}>
            <Braces data-icon="inline-start" aria-hidden="true" />
            Dato automático
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto" onCloseAutoFocus={returnFocus}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Datos del sistema</DropdownMenuLabel>
            {variables.map((variable) => (
              <DropdownMenuItem key={variable.key} onSelect={() => run((chain) => chain.insertContent(variableNode(variable)))}>
                {variable.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuTooltip>
  )
}
