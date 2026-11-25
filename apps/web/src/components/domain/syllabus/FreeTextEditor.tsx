"use client"

import { Extension, type Editor } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { Table, TableRow } from "@tiptap/extension-table"
import TextAlign from "@tiptap/extension-text-align"
import { Color, TextStyle } from "@tiptap/extension-text-style"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Bold, Braces, ChevronDown, Italic, List, ListOrdered, Plus, Table2, Underline } from "lucide-react"
import { useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from "react"
import { TemplateResponseTool } from "@/components/domain/configuration/TemplateResponseTool"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { DocumentBlock, DocumentResponse, DocumentTableCell, DocumentTableHeader, DocumentVariable, DocumentWithBlocks, variableNode } from "@/components/domain/syllabus/fieldDocumentExtensions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { characterLimitPlugin } from "@/lib/editorCharacterLimit"
import { pageSpacersPlugin } from "@/lib/editorPageSpacers"
import { DOCUMENT_CELL_COLORS, paintCell } from "@/lib/documentPalette"
import type { DocumentNode, TemplateVariable } from "@silabos/shared/lib/templateDocument"
import { cn } from "@/lib/utils"
import { emptyDocument } from "@/types/configuration"
import "./FreeTextEditor.css"

export type FreeTextEditorHandle = { editor: Editor | null }

type FreeTextEditorProps = {
  id: string
  label: string
  value?: DocumentNode | null
  onValueChange?: (value: DocumentNode) => void
  disabled?: boolean
  variables?: TemplateVariable[]
  bare?: boolean
  toolbar?: boolean
  blocks?: "configure" | "fill"
  allowTables?: boolean
  align?: boolean
  spaces?: boolean
  limit?: number | null
  ref?: Ref<FreeTextEditorHandle>
}

type Slash = { open: boolean; left: number; top: number; query: string; index: number }

const NO_VARIABLES: TemplateVariable[] = []
const CLOSED: Slash = { open: false, left: 0, top: 0, query: "", index: 0 }
const SLASH_PATTERN = /(?:^|\s)\/([\p{L}\p{N}_ ]{0,24})$/u

const PageSpacers = Extension.create({ name: "pageSpacers", addProseMirrorPlugins: () => [pageSpacersPlugin()] })

type LimitStorage = { limit: number | null }
type SlashStorage = { handle: ((event: KeyboardEvent) => boolean) | null }

const CharacterLimit = Extension.create<unknown, LimitStorage>({
  name: "characterLimit",
  addStorage: () => ({ limit: null }),
  addProseMirrorPlugins() {
    const storage = this.storage
    return [characterLimitPlugin(() => storage.limit)]
  },
})

const SlashKeys = Extension.create<unknown, SlashStorage>({
  name: "slashKeys",
  addStorage: () => ({ handle: null }),
  addProseMirrorPlugins() {
    const storage = this.storage
    return [new Plugin({ props: { handleKeyDown: (_view, event) => storage.handle?.(event) ?? false } })]
  },
})

const storageOf = (editor: Editor): { characterLimit: LimitStorage; slashKeys: SlashStorage } =>
  editor.storage as unknown as { characterLimit: LimitStorage; slashKeys: SlashStorage }

type ExtensionOptions = { bare: boolean; align: boolean; blocks: "configure" | "fill"; labels: Record<string, string> }

const editorExtensions = ({ bare, align, blocks, labels }: ExtensionOptions) => [
  StarterKit.configure({ document: false, heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, link: false, strike: false, ...(bare ? { trailingNode: false } : {}) }),
  ...(align ? [TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right", "justify"] })] : []),
  TextStyle,
  Color,
  Table.configure({ resizable: false }),
  TableRow,
  DocumentTableHeader,
  DocumentTableCell,
  DocumentWithBlocks,
  PageSpacers,
  CharacterLimit,
  SlashKeys,
  DocumentBlock.configure({ mode: blocks }),
  DocumentVariable.configure({ labels }),
  DocumentResponse,
]

const slashMatches = (variables: TemplateVariable[], query: string): TemplateVariable[] =>
  variables.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8)

function Separator() {
  return <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
}

function ToolButton({ label, pressed, disabled, onClick, children }: { label: string; pressed?: boolean; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <IconTooltip label={label}>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
        {children}
      </Button>
    </IconTooltip>
  )
}

export function FreeTextEditor({
  id,
  label,
  value = null,
  onValueChange,
  disabled = false,
  variables = NO_VARIABLES,
  bare = false,
  toolbar = true,
  blocks = "fill",
  allowTables = true,
  align = false,
  spaces = false,
  limit = null,
  ref,
}: FreeTextEditorProps) {
  const [slash, setSlash] = useState<Slash>(CLOSED)

  const closeSlash = (): void => setSlash((current) => (current.open ? { ...current, open: false } : current))
  const refreshSlash = (current: Editor): void => {
    const { state, view } = current
    const { $from, empty } = state.selection
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc")
    const match = SLASH_PATTERN.exec(before)
    if (!empty || !match || disabled || variables.length === 0) {
      closeSlash()
      return
    }
    const coords = view.coordsAtPos($from.pos)
    const query = match[1] ?? ""
    setSlash((previous) => ({ open: true, left: coords.left, top: coords.bottom + 4, query, index: query === previous.query ? previous.index : 0 }))
  }

  const [setup] = useState(() => ({
    content: value ?? emptyDocument(),
    editorProps: {
      handleDrop: () => true,
      handleDOMEvents: {
        dragstart: (_view: unknown, event: DragEvent) => {
          event.preventDefault()
          return true
        },
      },
      attributes: { id, "aria-label": label, role: "textbox", "aria-multiline": "true", class: "free-text-editor__content" },
    },
    extensions: editorExtensions({ bare, align, blocks, labels: Object.fromEntries(variables.map((item) => [item.key, item.label])) }),
  }))

  const editorProps = useMemo(() => ({ ...setup.editorProps, attributes: { ...setup.editorProps.attributes, "aria-label": label } }), [setup, label])

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    content: setup.content,
    editable: !disabled,
    editorProps,
    extensions: setup.extensions,
    onUpdate: ({ editor: current }) => {
      onValueChange?.(current.getJSON() as DocumentNode)
      refreshSlash(current)
    },
    onSelectionUpdate: ({ editor: current }) => refreshSlash(current),
    onBlur: () => closeSlash(),
  })

  const slashItems = slash.open ? slashMatches(variables, slash.query) : []
  const chooseSlash = (key: string): void => {
    const variable = variables.find((item) => item.key === key)
    if (!variable || !editor) return
    const to = editor.state.selection.from
    editor.chain().focus().deleteRange({ from: to - slash.query.length - 1, to }).insertContent(variableNode(variable)).run()
    closeSlash()
  }
  const onSlashKey = (event: KeyboardEvent): boolean => {
    if (!slash.open || slashItems.length === 0) return false
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1
      setSlash({ ...slash, index: (slash.index + step + slashItems.length) % slashItems.length })
      return true
    }
    if (event.key === "Enter" || event.key === "Tab") {
      chooseSlash(slashItems[slash.index]!.key)
      return true
    }
    if (event.key === "Escape") {
      closeSlash()
      return true
    }
    return false
  }

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const storage = storageOf(editor)
    storage.characterLimit.limit = limit
    storage.slashKeys.handle = onSlashKey
  })

  useImperativeHandle(ref, () => ({ editor }), [editor])

  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable === disabled) editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (editor && !editor.isDestroyed && JSON.stringify(value ?? emptyDocument()) !== JSON.stringify(editor.getJSON())) {
      editor.commands.setContent(value ?? emptyDocument(), { emitUpdate: false })
    }
  }, [editor, value])

  const hasTable = allowTables && JSON.stringify(value ?? {}).includes('"type":"table"')

  const addTableRow = (): void => {
    if (!editor || disabled) return
    if (editor.isActive("table")) {
      editor.chain().focus().addRowAfter().run()
      return
    }
    let lastCell = -1
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === "tableCell" || node.type.name === "tableHeader") lastCell = position
    })
    if (lastCell >= 0) editor.chain().focus().setTextSelection(lastCell + 2).addRowAfter().run()
  }
  const insertVariable = (key: string): void => {
    const variable = variables.find((item) => item.key === key)
    if (!variable || disabled) return
    editor?.chain().focus().insertContent(variableNode(variable)).run()
  }

  return (
    <div className={cn("free-text-editor flex min-w-0 flex-col", bare ? "bg-transparent" : "rounded-md border border-border bg-background")} data-disabled={disabled || undefined}>
      {editor && toolbar ? (
        <div role="toolbar" aria-label={`Formato de ${label}`} className="flex flex-wrap items-center gap-1 border-b p-1.5">
          <ToolButton label="Negrita" pressed={editor.isActive("bold")} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Cursiva" pressed={editor.isActive("italic")} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Subrayado" pressed={editor.isActive("underline")} disabled={disabled} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline aria-hidden="true" />
          </ToolButton>
          <Separator />
          <ToolButton label="Lista con viñetas" pressed={editor.isActive("bulletList")} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Lista numerada" pressed={editor.isActive("orderedList")} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered aria-hidden="true" />
          </ToolButton>
          {spaces ? (
            <>
              <Separator />
              <TemplateResponseTool
                editor={editor}
                disabled={disabled}
                label="Espacio para el docente"
                hint="El docente solo responde: no cambia el tipo ni las opciones"
                optionsHint="Escriba las opciones que podrá elegir el docente"
                requireOptions
              />
            </>
          ) : null}
          {allowTables ? (
            <ToolButton label="Insertar tabla" disabled={disabled} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              <Table2 aria-hidden="true" />
            </ToolButton>
          ) : null}
          {editor.isActive("table") ? (
            <>
              <Separator />
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => editor.chain().focus().addRowAfter().run()}>
                + Fila
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => editor.chain().focus().deleteRow().run()}>
                − Fila
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => editor.chain().focus().addColumnAfter().run()}>
                + Columna
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => editor.chain().focus().deleteColumn().run()}>
                − Columna
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled || !editor.can().mergeCells()} onClick={() => editor.chain().focus().mergeCells().run()}>
                Combinar
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled || !editor.can().splitCell()} onClick={() => editor.chain().focus().splitCell().run()}>
                Separar
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => editor.chain().focus().toggleHeaderCell().run()}>
                Encabezado
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" aria-label="Fondo de celda" disabled={disabled}>
                    Fondo
                    <ChevronDown data-icon="inline-end" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {DOCUMENT_CELL_COLORS.map((color) => (
                    <DropdownMenuItem key={color.value ?? "none"} onSelect={() => paintCell(editor.chain().focus(), color).run()}>
                      {color.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => editor.chain().focus().deleteTable().run()}>
                Quitar tabla
              </Button>
              <Separator />
            </>
          ) : null}
          {variables.length ? (
            <MenuTooltip label="Insertar dato del sistema">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Insertar dato del sistema" disabled={disabled}>
                    <Braces aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuLabel>Datos del sistema</DropdownMenuLabel>
                  {variables.map((variable) => (
                    <DropdownMenuItem key={variable.key} onSelect={() => insertVariable(variable.key)}>
                      {variable.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </MenuTooltip>
          ) : null}
        </div>
      ) : null}
      <EditorContent editor={editor} className={cn("overflow-x-auto", !bare && "min-h-32 px-3 py-2 text-sm")} />
      {editor && toolbar && hasTable && !disabled ? (
        <div className="px-3 pb-2">
          <Button type="button" variant="outline" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={addTableRow}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Agregar fila
          </Button>
        </div>
      ) : null}
      {slash.open && slashItems.length ? (
        <div
          role="listbox"
          aria-label="Datos del sistema"
          className="fixed z-50 flex min-w-48 flex-col rounded-md bg-popover p-1 text-sm shadow-menu ring-1 ring-surface-ring"
          style={{ left: `${slash.left}px`, top: `${slash.top}px` }}
        >
          {slashItems.map((item, position) => (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={position === slash.index}
              className={cn("justify-start", position === slash.index && "bg-accent text-accent-foreground")}
              onMouseDown={(event) => {
                event.preventDefault()
                chooseSlash(item.key)
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
