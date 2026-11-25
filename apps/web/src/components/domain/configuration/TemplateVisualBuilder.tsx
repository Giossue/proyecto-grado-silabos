"use client"

import type { Editor } from "@tiptap/core"
import { Braces, CircleAlert, Eye, EyeOff, GripVertical, ImageUp, Pencil, Plus, Ruler, Save, Settings2, Trash2 } from "lucide-react"
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type Ref } from "react"
import { ApiError } from "@/api/client"
import { checkTemplateDraft, getTemplateDraftImpact, importTemplateJson, previewTemplateDraft, uploadTemplateLogo } from "@/api/template"
import type { DesignedTable, RepeatableTableDesign, TemplateDraftImpact, TemplateDraftPayload, TemplateField, TemplatePayload, TemplatePreset, TemplateSectionPayload } from "@/api/template"
import type { TemplateAssistantDraft, TemplateAssistantProposal } from "@/api/templateAssistant"
import { TemplateFieldConditionTool } from "@/components/domain/configuration/TemplateFieldConditionTool"
import { TemplateFieldContent } from "@/components/domain/configuration/TemplateFieldContent"
import { TemplateFieldLimitTool } from "@/components/domain/configuration/TemplateFieldLimitTool"
import { TemplateFormatTools } from "@/components/domain/configuration/TemplateFormatTools"
import { TemplateImpactDialog } from "@/components/domain/configuration/TemplateImpactDialog"
import { TemplateInlineText } from "@/components/domain/configuration/TemplateInlineText"
import { TemplateInsertPoint } from "@/components/domain/configuration/TemplateInsertPoint"
import { TemplateJsonDialog } from "@/components/domain/configuration/TemplateJsonDialog"
import { TemplateResponseTool } from "@/components/domain/configuration/TemplateResponseTool"
import { TemplateSelectionTools, type TemplateSectionTarget, type TemplateSelection } from "@/components/domain/configuration/TemplateSelectionTools"
import { TemplateSheetField } from "@/components/domain/configuration/TemplateSheetField"
import { TemplateTableDesigner } from "@/components/domain/configuration/TemplateTableDesigner"
import { TemplateTableTool, type FieldTable } from "@/components/domain/configuration/TemplateTableTool"
import { draftProblemsByTarget, locateDraftProblems, problemCount, type DraftProblem } from "@/components/domain/configuration/templateDraftProblems"
import { paginateSheet } from "@/components/domain/configuration/templatePagination"
import { apiMessage, uniqueKey } from "@/components/domain/configuration/templateStructure"
import { useStructureHistory } from "@/components/domain/configuration/useStructureHistory"
import { ConfirmPhrase } from "@/components/domain/ConfirmPhrase"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { UnsavedChangesDialog } from "@/components/domain/UnsavedChangesDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { setTemplateRuntime, templateRuntime } from "@/lib/blocks/runtime"
import type { BlockDefinition, DocumentStyle, TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import { matchesPhrase } from "@/lib/confirmPhrase"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { layoutOf, layoutStyle, paperOf, sheetPixels, type DocumentLayout } from "@/lib/documentLayout"
import { limitLabel } from "@/lib/fieldLimits"
import { conditionLabel, conditionSources, newResponseId, responseIds, withNewResponseIds, withResponseId, type ConditionSource } from "@/lib/responseConditions"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { templateEditorState } from "@/state/templateEditor"
import { emptyDocument, type FieldResponsible } from "@/types/configuration"
import { scrollBehavior } from "@/lib/motion"

type Template = NonNullable<TemplatePayload["template"]>
type Sections = TemplateSectionPayload[]
type Marks = { sections: string[]; fields: string[] }
type TableChange = { definition: BlockDefinition; design: RepeatableTableDesign | null }
type Tables = Record<string, TableChange>
type BuilderState = { sections: Sections; title: string; layout: DocumentLayout; marks: Marks; tables: Tables }
type Removal = { kind: "section" | "field"; id: string; name: string; count: number }
type DragItem = { kind: "field" | "section"; id: string }
type DropMark = { kind: "field"; sectionId: string; index: number } | { kind: "section"; index: number }
type SheetEntry = { section: TemplateSectionPayload; fields: TemplateField[]; landscape: boolean; index: number }
type Sheet = { landscape: boolean; items: SheetEntry[] }
type Selected = { section: TemplateSectionPayload; sectionIndex: number; fieldIndex: number }

export type TemplateVisualBuilderHandle = {
  askEdit: () => void
  leave: () => void
  snapshot: () => TemplateAssistantDraft
  applyProposal: (proposal: TemplateAssistantProposal) => void
  draftVersion: string
  payload: () => TemplateDraftPayload
}

type TemplateVisualBuilderProps = {
  template: Template
  processLock?: string | null
  logos?: TemplatePayload["logos"]
  variables?: TemplatePayload["variables"]
  presets?: TemplatePayload["presets"]
  blockDesigns?: TemplatePayload["blockDesigns"]
  onChanged?: () => void
  onDirty?: (value: boolean) => void
  onEditing?: (value: boolean) => void
  onDraftVersionChange?: (version: string) => void
  ref?: Ref<TemplateVisualBuilderHandle>
}

const EDIT_PHRASE = "editar plantilla"
const NO_MARKS: Marks = { sections: [], fields: [] }
const NO_TABLES: Tables = {}
const SELECTION_KEEPERS = '[data-field], [data-section-heading], [data-insert-point], [data-template-ribbon], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-slot="popover-content"]'
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const moved = <T,>(items: T[], index: number, direction: -1 | 1): T[] => {
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(index + direction, 0, item!)
  return next
}
const inserted = <T,>(items: T[], index: number, item: T): T[] => [...items.slice(0, index), item, ...items.slice(index)]
const fieldName = (field: TemplateField): string => field.label.trim() || "Campo sin nombre"
const isBlank = (content: DocumentNode): boolean => (content.content ?? []).every((node) => node.type === "paragraph" && !(node.content ?? []).length)
const inLowerHalf = (event: DragEvent, element: Element): boolean => {
  const rect = element.getBoundingClientRect()
  return event.clientY > rect.top + rect.height / 2
}
const withTableValues = (content: DocumentNode, kind: string, table: DesignedTable): DocumentNode => {
  const list = table.design.list
  return {
    ...content,
    content: (content.content ?? []).map((node) => {
      const rows = (node.attrs?.value as Record<string, unknown> | undefined)?.[list]
      return node.type === "documentBlock" && node.attrs?.kind === kind && Array.isArray(rows) && rows.length > table.design.max ? { ...node, attrs: { ...node.attrs, value: table.initial } } : node
    }),
  }
}
const sheetsOf = (entries: SheetEntry[]): Sheet[] => {
  const groups: Sheet[] = []
  for (const item of entries) {
    const last = groups[groups.length - 1]
    if (last && last.landscape === item.landscape) last.items.push(item)
    else groups.push({ landscape: item.landscape, items: [item] })
  }
  return groups.length > 0 ? groups : [{ landscape: false, items: [] }]
}

let temporary = 0
const temporaryId = (): string => {
  temporary += 1
  return `nuevo-${temporary}`
}

export function TemplateVisualBuilder({ template, processLock = null, logos, variables, presets, blockDesigns, onChanged, onDirty, onEditing, onDraftVersionChange, ref }: TemplateVisualBuilderProps) {
  const locked = Boolean(processLock)
  const [preview, setPreview] = useState(true)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [editWarningOpen, setEditWarningOpen] = useState(false)
  const [editTyped, setEditTyped] = useState("")
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)
  const [naming, setNaming] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [available, setAvailable] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Sections>([])
  const [revision, setRevision] = useState(0)
  const [awaitingReload, setAwaitingReload] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [draftPreview, setDraftPreview] = useState<Sections>([])
  const [editSession, setEditSession] = useState("")
  const [assistantMarks, setAssistantMarks] = useState<Marks>(NO_MARKS)
  const [dirty, setDirty] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [layoutDraft, setLayoutDraft] = useState<DocumentLayout>(() => layoutOf(template.layout))
  const [tables, setTables] = useState<Tables>(NO_TABLES)
  const [designOpen, setDesignOpen] = useState(false)
  const [logoOverride, setLogoOverride] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [impact, setImpact] = useState<TemplateDraftImpact | null>(null)
  const [problems, setProblems] = useState<DraftProblem[]>([])
  const [removal, setRemoval] = useState<Removal | null>(null)
  const [designerOpen, setDesignerOpen] = useState(false)
  const [designerKind, setDesignerKind] = useState<string | null>(null)
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [dropMark, setDropMark] = useState<DropMark | null>(null)
  const [seenTemplate, setSeenTemplate] = useState(template)
  const removalShown = useShownWhileClosing(removal)

  const root = useRef<HTMLDivElement | null>(null)
  const baseDefinition = useRef<TemplateDefinitionPayload | null>(null)
  const savedState = useRef("")
  const checkRun = useRef(0)
  const sheetElements = useRef(new Map<number, HTMLElement>())
  const contentObserver = useRef<ResizeObserver | null>(null)
  const paginationFrame = useRef(0)
  const paginationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef<{ sheets: Sheet[]; documentStyle: DocumentStyle | null }>({ sheets: [], documentStyle: null })
  const lastDirty = useRef(false)

  if (template !== seenTemplate) {
    setSeenTemplate(template)
    if (awaitingReload) {
      setAwaitingReload(false)
      setDraft([])
      setRevision((value) => value + 1)
    }
  }

  const documentStyle = templateRuntime().definition?.document ?? null
  const readOnly = preview || previewing
  const source = previewing ? draftPreview : preview && !awaitingReload ? template.sections : draft
  const sections: SheetEntry[] = source.map((section, index) => ({ section, fields: section.fields, landscape: section.orientation === "landscape", index }))
  const sheets = sheetsOf(sections)
  const shownLayout = preview && !awaitingReload ? layoutOf(template.layout) : layoutDraft
  const shownTitle = preview && !awaitingReload ? template.titleBlock.text : titleDraft
  const changed = !preview && dirty
  const structureEditable = !readOnly && !locked && !busy
  const draftVersion = `${editSession}:${revision}`
  const problemsByTarget = draftProblemsByTarget(problems)
  const usedSectionKeys = source.map((section) => section.key)
  const usedFieldKeys = sections.flatMap((entry) => entry.fields.map((field) => field.key))
  const orderedFields = draft.flatMap((section) => section.fields)
  const usedResponseIds = responseIds(orderedFields.map((field) => field.content))
  const allSources = conditionSources(orderedFields)
  const paper = paperOf(documentStyle)
  const toolbarWidth = `min(${sheets[0]?.landscape ? paper.height : paper.width}mm, 100%)`
  const options = template.layoutOptions
  const layoutControls = options
    ? ([
        { key: "margin_cm", label: "Márgenes", options: options.margins },
        { key: "title_font_size", label: "Tamaño del título", options: options.title_sizes },
        { key: "section_font_size", label: "Tamaño de las secciones", options: options.section_sizes },
        { key: "body_font_size", label: "Tamaño del contenido", options: options.body_sizes },
      ] as const)
    : []

  const scaleFor = (landscape: boolean): number => {
    const pixels = sheetPixels(documentStyle)
    const width = landscape ? pixels.landscape : pixels.portrait
    return available > 0 ? Math.min(1, available / width) : 1
  }
  const proposedSection = (section: TemplateSectionPayload): boolean => !preview && assistantMarks.sections.includes(section.key)
  const proposedField = (field: TemplateField): boolean => !preview && assistantMarks.fields.includes(field.key)

  const paginate = (): void => {
    cancelAnimationFrame(paginationFrame.current)
    paginationFrame.current = requestAnimationFrame(() => {
      sheetElements.current.forEach((element, index) => paginateSheet(element, latest.current.sheets[index]?.landscape ?? false, latest.current.documentStyle))
    })
  }
  const paginateSoon = (): void => {
    clearTimeout(paginationTimer.current)
    paginationTimer.current = setTimeout(paginate, 250)
  }
  const setSheet = (index: number, element: HTMLElement | null): void => {
    if (!element) {
      sheetElements.current.delete(index)
      return
    }
    sheetElements.current.set(index, element)
    if (typeof ResizeObserver === "undefined") return
    contentObserver.current ??= new ResizeObserver(() => paginateSoon())
    const content = element.querySelector(":scope > [data-sheet-content]")
    if (content) contentObserver.current.observe(content)
  }

  const selectField = (id: string, editor: Editor | null): void => {
    setSelectedField(id)
    setSelectedSection(null)
    setActiveEditor(editor)
  }
  const selectSection = (id: string): void => {
    setSelectedSection(id)
    setSelectedField(null)
    setActiveEditor(null)
  }
  const clearSelection = (): void => {
    setSelectedField(null)
    setSelectedSection(null)
    setActiveEditor(null)
  }

  const updateDraft = (change: (current: Sections) => Sections): void => {
    setDraft(change)
    setRevision((value) => value + 1)
  }
  const updateSection = (sectionId: string, change: (section: TemplateSectionPayload) => TemplateSectionPayload): void =>
    updateDraft((current) => current.map((section) => (section.id === sectionId ? change(section) : section)))
  const showTables = (next: Tables): void => {
    const base = baseDefinition.current
    if (!base) return
    setTemplateRuntime({ ...base, blocks: { ...base.blocks, ...Object.fromEntries(Object.entries(next).map(([kind, table]) => [kind, table.definition])) } }, templateRuntime().variables)
  }
  const changeTables = (next: Tables): void => {
    setTables(next)
    showTables(next)
  }
  const touched = (): void => {
    setDirty(true)
    paginateSoon()
  }

  const captureState = (): BuilderState => ({ sections: draft, title: titleDraft, layout: layoutDraft, marks: assistantMarks, tables })
  const structure = useStructureHistory<BuilderState>({
    capture: captureState,
    restore: (state) => {
      updateDraft(() => state.sections)
      setTitleDraft(state.title)
      setLayoutDraft(state.layout)
      setAssistantMarks(state.marks)
      changeTables(state.tables)
      const sectionIds = new Set(state.sections.map((section) => section.id))
      const fieldIds = new Set(state.sections.flatMap((section) => section.fields.map((field) => field.id)))
      if (selectedSection && !sectionIds.has(selectedSection)) setSelectedSection(null)
      if (selectedField && !fieldIds.has(selectedField)) {
        setSelectedField(null)
        setActiveEditor(null)
      }
      setDirty(JSON.stringify(state) !== savedState.current)
      paginateSoon()
    },
  })
  const record = (group?: string): void => {
    if (!preview) structure.record(group)
  }
  const undoStructure = (): void => {
    if (structureEditable) structure.undo()
  }
  const redoStructure = (): void => {
    if (structureEditable) structure.redo()
  }

  const setLayout = (key: keyof DocumentLayout, value: string): void => {
    const number = Number(value)
    if (!Number.isFinite(number)) return
    record()
    setLayoutDraft((current) => ({ ...current, [key]: number }))
    touched()
  }
  const setDocumentTitle = (value: string): void => {
    record("document-title")
    setTitleDraft(value)
    touched()
  }
  const changeLogo = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ""
    if (!file || uploadingLogo) return
    setUploadingLogo(true)
    setError(null)
    try {
      setLogoOverride((await uploadTemplateLogo(template.id, file)).logo)
      toast.success("Logo actualizado")
    } catch (reason) {
      setError(apiMessage(reason, "No se pudo cambiar el logo"))
    } finally {
      setUploadingLogo(false)
    }
  }

  const draftSections = (): TemplateDraftPayload["sections"] => draft.map((section) => ({
    key: section.key,
    title: section.title.trim(),
    orientation: section.orientation,
    fields: section.fields.map((field) => ({
      key: field.key,
      label: field.label.trim(),
      quien_llena: field.quien_llena,
      content: field.content,
      ...(field.show_if ? { show_if: field.show_if } : {}),
      ...(field.max_length && field.quien_llena !== "institucional" ? { max_length: field.max_length } : {}),
    })),
  }))
  const draftPayload = (): TemplateDraftPayload => ({
    version: 1,
    title: titleDraft.trim() || template.titleBlock.text,
    layout: layoutDraft,
    sections: draftSections(),
    ...(Object.keys(tables).length ? { block_changes: Object.fromEntries(Object.entries(tables).map(([kind, table]) => [kind, table.definition])) } : {}),
  })
  const snapshot = (): TemplateAssistantDraft => ({ sections: draftSections(), version: draftVersion })

  const startEditing = (): void => {
    setEditWarningOpen(false)
    const sections = awaitingReload ? draft : clone(template.sections)
    const title = awaitingReload ? titleDraft : template.titleBlock.text
    const layout = awaitingReload ? layoutDraft : layoutOf(template.layout)
    if (!awaitingReload) {
      updateDraft(() => sections)
      setTitleDraft(title)
      setLayoutDraft(layout)
      setDirty(false)
    }
    setError(null)
    baseDefinition.current = templateRuntime().definition
    changeTables(NO_TABLES)
    setEditSession(crypto.randomUUID())
    setAssistantMarks(NO_MARKS)
    structure.reset()
    savedState.current = JSON.stringify({ sections, title, layout, marks: NO_MARKS, tables: NO_TABLES } satisfies BuilderState)
    setPreview(false)
  }
  const cancelEditing = (): void => {
    setPreview(true)
    setPreviewing(false)
    setProblems([])
    setAssistantMarks(NO_MARKS)
    updateDraft(() => [])
    changeTables(NO_TABLES)
    structure.reset()
    setError(null)
    clearSelection()
  }
  const leave = (): void => {
    if (changed) setLeaveOpen(true)
    else cancelEditing()
  }
  const discardAndLeave = (): void => {
    setLeaveOpen(false)
    cancelEditing()
  }
  const askEdit = (): void => {
    if (locked) return
    setEditTyped("")
    setEditWarningOpen(true)
  }
  const applyProposal = (proposal: TemplateAssistantProposal): void => {
    record()
    if (proposal.block_changes) changeTables({ ...tables, ...Object.fromEntries(Object.entries(proposal.block_changes).map(([kind, definition]) => [kind, { definition, design: null }])) })
    const sectionIds = new Map(draft.map((section) => [section.key, section.id]))
    const fieldIds = new Map(draft.flatMap((section) => section.fields.map((field) => [field.key, field.id] as const)))
    updateDraft(() => proposal.sections.map((section) => ({
      id: sectionIds.get(section.key) ?? temporaryId(),
      key: section.key,
      title: section.title,
      orientation: section.orientation,
      fields: section.fields.map((field) => ({
        id: fieldIds.get(field.key) ?? temporaryId(),
        key: field.key,
        label: field.label,
        quien_llena: field.quien_llena,
        content: field.content,
        ...(field.show_if ? { show_if: field.show_if } : {}),
        ...(field.max_length ? { max_length: field.max_length } : {}),
      })),
    })))
    setAssistantMarks({
      sections: [...new Set([...assistantMarks.sections, ...proposal.changed.sections])],
      fields: [...new Set([...assistantMarks.fields, ...proposal.changed.fields])],
    })
    clearSelection()
    touched()
  }

  useImperativeHandle(ref, () => ({ askEdit, leave, snapshot, applyProposal, draftVersion, payload: draftPayload }))

  const persist = async (body: TemplateDraftPayload): Promise<void> => {
    try {
      await importTemplateJson(template.id, body)
      toast.success("Plantilla guardada")
      setAssistantMarks(NO_MARKS)
      setAwaitingReload(true)
      structure.reset()
      setPreview(true)
      setPreviewing(false)
      setProblems([])
      clearSelection()
      onChanged?.()
    } catch (reason) {
      setError(apiMessage(reason, "No se pudo guardar la plantilla"))
    } finally {
      setBusy(false)
    }
  }
  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    const body = draftPayload()
    let result: TemplateDraftImpact | undefined
    try {
      result = await getTemplateDraftImpact(template.id, body)
    } catch (reason) {
      setBusy(false)
      if (reason instanceof ApiError && reason.status === 422) {
        setError(apiMessage(reason, "No se pudo guardar la plantilla"))
        return
      }
      setImpact({ affected: true, counted: false, in_progress: 0, keep: 0, lose: 0, back_to_draft: 0, careers: [] })
      return
    }
    if (result?.affected) {
      setImpact(result)
      setBusy(false)
      return
    }
    await persist(body)
  }
  const confirmImpact = (): void => {
    setImpact(null)
    setBusy(true)
    void persist(draftPayload())
  }
  const reloadAfterJson = (): void => {
    toast.success("Plantilla actualizada desde el JSON")
    cancelEditing()
    onChanged?.()
  }
  const togglePreview = async (): Promise<void> => {
    if (previewing) {
      setPreviewing(false)
      return
    }
    if (previewLoading) return
    setPreviewLoading(true)
    setError(null)
    try {
      setDraftPreview((await previewTemplateDraft(template.id, draftPayload())).sheets)
      clearSelection()
      setPreviewing(true)
    } catch (reason) {
      setError(apiMessage(reason, "No se pudo armar la vista previa"))
    } finally {
      setPreviewLoading(false)
    }
  }
  const showFirstProblem = (): void => {
    const first = problems.find((problem) => problem.target !== "general") ?? problems[0]
    if (!first) return
    if (previewing) setPreviewing(false)
    setTimeout(() => {
      const selector = first.target === "field" ? `[data-field="${first.id}"]` : first.target === "section" ? `[data-section="${first.id}"]` : "[data-general-problems]"
      root.current?.querySelector<HTMLElement>(selector)?.scrollIntoView?.({ behavior: scrollBehavior(), block: "center" })
      if (first.target === "field" && first.id) selectField(first.id, null)
      if (first.target === "section" && first.id) selectSection(first.id)
    }, 0)
  }

  const moveSection = (index: number, direction: -1 | 1): void => {
    record()
    updateDraft((current) => moved(current, index, direction))
    touched()
  }
  const moveField = (sectionId: string, index: number, direction: -1 | 1): void => {
    if (!draft.some((section) => section.id === sectionId)) return
    record()
    updateSection(sectionId, (section) => ({ ...section, fields: moved(section.fields, index, direction) }))
    touched()
  }
  const addSection = (index?: number): void => {
    const created: TemplateSectionPayload = { id: temporaryId(), key: uniqueKey("nueva seccion", "seccion", usedSectionKeys), title: "Nueva sección", orientation: "portrait", fields: [] }
    record()
    updateDraft((current) => inserted(current, index ?? current.length, created))
    setFocusId(created.id)
    touched()
  }
  const addField = (sectionId: string, index?: number): void => {
    if (!draft.some((section) => section.id === sectionId)) return
    record()
    const created: TemplateField = { id: temporaryId(), key: uniqueKey("", "campo", usedFieldKeys), label: "", quien_llena: "carrera", content: emptyDocument() }
    updateSection(sectionId, (section) => ({ ...section, fields: inserted(section.fields, index ?? section.fields.length, created) }))
    setFocusId(created.id)
    touched()
  }
  const insertAfterLastField = (key: string, sectionId: string, sectionIndex: number): void => {
    if (key === "section") addSection(sectionIndex + 1)
    else addField(sectionId)
  }
  const setField = (sectionId: string, fieldId: string, value: TemplateField): void => {
    const section = draft.find((item) => item.id === sectionId)
    const current = section?.fields.find((item) => item.id === fieldId)
    if (!section || !current) return
    const duplicated = value.key !== current.key && sections.some((entry) => entry.fields.some((field) => field.id !== fieldId && field.key === value.key))
    if (duplicated) {
      setError("Esa plantilla ya está en el sílabo")
      return
    }
    record(value.label !== current.label ? `field-label:${fieldId}` : value.content !== current.content ? `field-content:${fieldId}` : undefined)
    updateSection(sectionId, (item) => ({ ...item, fields: item.fields.map((field) => (field.id === fieldId ? value : field)) }))
    touched()
  }
  const setTitle = (section: TemplateSectionPayload, title: string): void => {
    record(`section-title:${section.id}`)
    updateSection(section.id, (item) => ({ ...item, title }))
    touched()
  }

  const selected = ((): Selected | null => {
    for (const [sectionIndex, section] of draft.entries()) {
      if (selectedSection === section.id) return { section, sectionIndex, fieldIndex: -1 }
      const fieldIndex = section.fields.findIndex((field) => field.id === selectedField)
      if (fieldIndex >= 0) return { section, sectionIndex, fieldIndex }
    }
    return null
  })()
  const selection: TemplateSelection | null = !selected
    ? null
    : selected.fieldIndex < 0
      ? { kind: "section", section: selected.section, canMoveUp: selected.sectionIndex > 0, canMoveDown: selected.sectionIndex < draft.length - 1 }
      : { kind: "field", field: selected.section.fields[selected.fieldIndex]!, canMoveUp: selected.fieldIndex > 0, canMoveDown: selected.fieldIndex < selected.section.fields.length - 1 }
  const selectedTemplateField = selection?.kind === "field" ? selection.field : null
  const ribbonEditor = selection?.kind === "field" && activeEditor && !activeEditor.isDestroyed ? activeEditor : null
  const editableField = selection?.kind === "field" && selection.field.quien_llena !== "institucional"

  const patchSelectedField = (changes: Partial<TemplateField>): void => {
    const field = selected && selected.fieldIndex >= 0 ? selected.section.fields[selected.fieldIndex] : undefined
    if (selected && field) setField(selected.section.id, field.id, { ...field, ...changes })
  }
  const designOf = (kind: string): RepeatableTableDesign | null => (tables[kind] ? tables[kind]!.design : blockDesigns?.[kind]?.design ?? null)
  const reasonOf = (kind: string): string | null => {
    if (designOf(kind)) return null
    if (tables[kind]) return "Esta tabla llegó del asistente; ábrala de nuevo después de guardar para cambiarla."
    return blockDesigns?.[kind]?.reason ?? "Esta tabla no se puede editar aquí. Para cambiarla use Opciones avanzadas → Editar JSON."
  }
  const fieldTables: FieldTable[] = [...new Set((selectedTemplateField?.content.content ?? [])
    .filter((node) => node.type === "documentBlock" && typeof node.attrs?.kind === "string")
    .map((node) => String(node.attrs!.kind)))]
    .map((kind) => ({ kind, label: templateRuntime().definition?.blocks[kind]?.label ?? kind, editable: designOf(kind) !== null }))
  const takenKinds = Object.keys(templateRuntime().definition?.blocks ?? {})
  const openDesigner = (kind: string | null): void => {
    setDesignerKind(kind)
    setDesignerOpen(true)
  }
  const applyTable = (table: DesignedTable, created: boolean): void => {
    record()
    changeTables({ ...tables, [table.kind]: { definition: table.definition, design: table.design } })
    const field = selectedTemplateField
    if (created && field) {
      const node: DocumentNode = { type: "documentBlock", attrs: { kind: table.kind, props: {}, value: table.initial } }
      patchSelectedField({ content: { ...field.content, content: isBlank(field.content) ? [node] : [...(field.content.content ?? []), node] } })
    } else {
      updateDraft((current) => current.map((section) => ({ ...section, fields: section.fields.map((item) => ({ ...item, content: withTableValues(item.content, table.kind, table) })) })))
    }
    touched()
  }
  const applyPreset = (preset: TemplatePreset): void => patchSelectedField({ quien_llena: preset.quien_llena, content: clone(preset.content) })
  const moveSelected = (direction: -1 | 1): void => {
    if (!selected) return
    if (selected.fieldIndex < 0) moveSection(selected.sectionIndex, direction)
    else moveField(selected.section.id, selected.fieldIndex, direction)
  }
  const removeSelected = (): void => {
    if (!selected) return
    const field = selected.section.fields[selected.fieldIndex]
    setRemoval(field ? { kind: "field", id: field.id, name: fieldName(field), count: 0 } : { kind: "section", id: selected.section.id, name: selected.section.title, count: selected.section.fields.length })
  }
  const toggleOrientation = (): void => {
    if (!selected || selected.fieldIndex >= 0) return
    record()
    updateSection(selected.section.id, (section) => ({ ...section, orientation: section.orientation === "landscape" ? "portrait" : "landscape" }))
    touched()
  }
  const confirmRemoval = (): void => {
    const target = removal
    if (!target) return
    record()
    if (target.kind === "section") updateDraft((current) => current.filter((section) => section.id !== target.id))
    else updateDraft((current) => current.map((section) => ({ ...section, fields: section.fields.filter((field) => field.id !== target.id) })))
    setRemoval(null)
    touched()
  }

  const copyField = (field: TemplateField, used: string[], label: string, responses: Set<string>): TemplateField => {
    const key = uniqueKey(field.key, "campo", used)
    used.push(key)
    return { ...clone(field), id: temporaryId(), key, label, content: withNewResponseIds(clone(field.content), responses) }
  }
  const sourcesBefore = (fieldId: string | null): ConditionSource[] => {
    const position = orderedFields.findIndex((field) => field.id === fieldId)
    return position < 0 ? [] : conditionSources(orderedFields.slice(0, position))
  }
  const claimSource = (source: ConditionSource): string | null => {
    if (source.id) return source.id
    const section = draft.find((item) => item.fields.some((field) => field.id === source.field))
    if (!section) return null
    const id = newResponseId(usedResponseIds)
    updateSection(section.id, (item) => ({ ...item, fields: item.fields.map((field) => (field.id === source.field ? { ...field, content: withResponseId(field.content, source.index, id) } : field)) }))
    return id
  }
  const setSelectedCondition = (source: ConditionSource | null, choices: string[]): void => {
    if (!selectedTemplateField) return
    record()
    const response = source ? claimSource(source) : null
    patchSelectedField({ show_if: response ? { response, options: choices } : null })
  }
  const setSelectedLimit = (limit: number | null): void => {
    if (!selectedTemplateField) return
    record()
    patchSelectedField({ max_length: limit })
  }
  const setSelectedResponsible = (responsible: FieldResponsible): void => {
    patchSelectedField(responsible === "institucional" ? { quien_llena: responsible, max_length: null } : { quien_llena: responsible })
  }
  const duplicateSelected = (): void => {
    if (!selected || locked || busy) return
    record()
    const used = [...usedFieldKeys]
    const responses = new Set(usedResponseIds)
    const field = selected.section.fields[selected.fieldIndex]
    if (field) {
      const copy = copyField(field, used, field.label.trim() ? `${field.label.trim()} (copia)` : "", responses)
      updateSection(selected.section.id, (section) => ({ ...section, fields: inserted(section.fields, selected.fieldIndex + 1, copy) }))
      setSelectedField(copy.id)
      setActiveEditor(null)
    } else {
      const section = selected.section
      const copy: TemplateSectionPayload = { ...clone(section), id: temporaryId(), key: uniqueKey(section.key, "seccion", usedSectionKeys), title: `${section.title.trim()} (copia)`, fields: section.fields.map((item) => copyField(item, used, item.label, responses)) }
      updateDraft((current) => inserted(current, selected.sectionIndex + 1, copy))
      setSelectedSection(copy.id)
    }
    touched()
  }
  const relocateField = (fieldId: string, sectionId: string, index: number): void => {
    const from = draft.find((section) => section.fields.some((field) => field.id === fieldId))
    const to = draft.find((section) => section.id === sectionId)
    if (!from || !to || locked || busy) return
    const position = from.fields.findIndex((field) => field.id === fieldId)
    const target = from === to && position < index ? index - 1 : index
    if (from === to && target === position) return
    record()
    const field = from.fields[position]!
    updateDraft((current) => current.map((section) => {
      const fields = section.id === from.id ? section.fields.filter((item) => item.id !== fieldId) : section.fields
      return section.id === to.id ? { ...section, fields: inserted(fields, target, field) } : { ...section, fields }
    }))
    touched()
  }
  const relocateSection = (sectionId: string, index: number): void => {
    const position = draft.findIndex((section) => section.id === sectionId)
    const target = position < index ? index - 1 : index
    if (position < 0 || target === position || locked || busy) return
    record()
    updateDraft((current) => {
      const next = [...current]
      const [section] = next.splice(position, 1)
      next.splice(target, 0, section!)
      return next
    })
    touched()
  }
  const moveTargets: TemplateSectionTarget[] = !selected || selected.fieldIndex < 0 ? [] : draft.filter((section) => section.id !== selected.section.id).map((section) => ({ id: section.id, title: section.title }))
  const moveSelectedTo = (sectionId: string): void => {
    const field = selected && selected.fieldIndex >= 0 ? selected.section.fields[selected.fieldIndex] : undefined
    const destination = draft.find((section) => section.id === sectionId)
    if (field && destination) relocateField(field.id, sectionId, destination.fields.length)
  }

  const startDrag = (event: DragEvent, item: DragItem): void => {
    if (locked || busy) {
      event.preventDefault()
      return
    }
    setDragging(item)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("application/x-template-item", item.id)
    }
  }
  const endDrag = (): void => {
    setDragging(null)
    setDropMark(null)
  }
  const markFor = (event: DragEvent): DropMark | null => {
    const element = event.target instanceof Element ? event.target.closest("[data-section]") : null
    const sectionIndex = element ? draft.findIndex((entry) => entry.id === element.getAttribute("data-section")) : -1
    const section = draft[sectionIndex]
    if (!dragging || !element || !section) return null
    if (dragging.kind === "section") return { kind: "section", index: sectionIndex + (inLowerHalf(event, element) ? 1 : 0) }
    const row = event.target instanceof Element ? event.target.closest("[data-field]") : null
    const index = row ? section.fields.findIndex((field) => field.id === row.getAttribute("data-field")) : -1
    return { kind: "field", sectionId: section.id, index: row && index >= 0 ? index + (inLowerHalf(event, row) ? 1 : 0) : section.fields.length }
  }
  const dragOver = (event: DragEvent<HTMLDivElement>): void => {
    const mark = markFor(event)
    if (!mark) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    setDropMark(mark)
  }
  const dropDragged = (event: DragEvent<HTMLDivElement>): void => {
    const mark = markFor(event) ?? dropMark
    if (!dragging || !mark) return
    event.preventDefault()
    if (dragging.kind === "field" && mark.kind === "field") relocateField(dragging.id, mark.sectionId, mark.index)
    if (dragging.kind === "section" && mark.kind === "section") relocateSection(dragging.id, mark.index)
    endDrag()
  }
  const fieldMarked = (sectionId: string, index: number): boolean => dropMark?.kind === "field" && dropMark.sectionId === sectionId && dropMark.index === index
  const sectionMarked = (index: number): boolean => dropMark?.kind === "section" && dropMark.index === index

  const runCheck = useEffectEvent(async (run: number): Promise<void> => {
    const sent = draft.map((section) => ({ id: section.id, fields: section.fields.map((field) => field.id) }))
    let result: Awaited<ReturnType<typeof checkTemplateDraft>> | undefined
    try {
      result = await checkTemplateDraft(template.id, draftPayload())
    } catch {
      result = undefined
    }
    if (run !== checkRun.current || !result) return
    setProblems(locateDraftProblems(result.problems, sent))
  })
  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key === "s") {
      if (preview) return
      event.preventDefault()
      if (changed) void save()
      return
    }
    if (event.altKey || event.defaultPrevented || (key !== "z" && key !== "y")) return
    const target = event.target
    if (target instanceof Element && target.closest('[contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return
    if (!structureEditable) return
    event.preventDefault()
    if (key === "y" || event.shiftKey) redoStructure()
    else undoStructure()
  })
  const onPointerDown = useEffectEvent((event: PointerEvent): void => {
    const target = event.target
    if (!(target instanceof Element) || target.closest(SELECTION_KEEPERS)) return
    clearSelection()
  })
  const onResize = useEffectEvent((width: number): void => setAvailable(width))
  const paginateLater = useEffectEvent((): void => paginate())

  useEffect(() => {
    latest.current = { sheets, documentStyle }
  })

  useEffect(() => {
    templateEditorState.setOpen(!preview)
    onEditing?.(!preview)
  }, [preview, onEditing])

  useEffect(() => {
    if (changed === lastDirty.current) return
    lastDirty.current = changed
    onDirty?.(changed)
  }, [changed, onDirty])

  useEffect(() => {
    onDraftVersionChange?.(draftVersion)
  }, [draftVersion, onDraftVersionChange])

  useEffect(() => {
    checkRun.current += 1
    const run = checkRun.current
    if (preview) return
    const timer = setTimeout(() => void runCheck(run), 800)
    return () => clearTimeout(timer)
  }, [revision, titleDraft, preview])

  useEffect(() => {
    paginateLater()
  }, [template, preview])

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => onKeyDown(event)
    const pointerdown = (event: PointerEvent): void => onPointerDown(event)
    const element = root.current
    const timers = { frame: paginationFrame, timer: paginationTimer }
    const elements = sheetElements.current
    document.addEventListener("pointerdown", pointerdown)
    document.addEventListener("keydown", keydown)
    const resize = element && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => onResize(element.clientWidth)) : null
    if (element) resize?.observe(element)
    void document.fonts?.ready.then(() => paginateLater())
    return () => {
      templateEditorState.setOpen(false)
      document.removeEventListener("pointerdown", pointerdown)
      document.removeEventListener("keydown", keydown)
      resize?.disconnect()
      contentObserver.current?.disconnect()
      cancelAnimationFrame(timers.frame.current)
      clearTimeout(timers.timer.current)
      elements.clear()
    }
  }, [])

  const editingDisabled = locked || busy || previewing
  const removalTitle = removalShown?.kind === "section" ? "Eliminar sección" : "Eliminar campo"
  const removalText = removalShown?.kind === "section" ? `Se quitará «${removalShown.name}» con sus ${removalShown.count} campos de la plantilla` : `Se quitará «${removalShown?.name}» de la plantilla`

  return (
    <div ref={root} className="flex min-w-0 flex-col gap-4" aria-label="Constructor visual de la plantilla del sílabo" role="region" onDragOver={dragOver} onDrop={dropDragged}>
      {error ? (
        <Alert variant="destructive" role="alert" className="mx-auto max-w-3xl">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!preview ? (
        <div className="pointer-events-none sticky top-16 z-20 flex w-full justify-center">
          <div data-template-ribbon role="toolbar" aria-label="Cinta de edición de la plantilla" style={{ minWidth: toolbarWidth }} className="pointer-events-auto flex w-max max-w-[calc(100vw-2rem)] shrink-0 items-start gap-1 rounded-md bg-card p-1.5 shadow-menu ring-1 ring-surface-ring">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <TemplateFormatTools editor={ribbonEditor} disabled={editingDisabled} variables={variables} canUndo={structure.canUndo} canRedo={structure.canRedo} onUndo={undoStructure} onRedo={redoStructure} />
              <TemplateResponseTool editor={ribbonEditor} allowed={editableField} disabled={editingDisabled} sources={sourcesBefore(selectedField)} usedIds={usedResponseIds} claimSource={claimSource} />
              <TemplateFieldConditionTool allowed={selection?.kind === "field"} disabled={editingDisabled} condition={selectedTemplateField?.show_if ?? null} sources={sourcesBefore(selectedField)} onApply={setSelectedCondition} />
              <TemplateFieldLimitTool selected={selection?.kind === "field"} editable={editableField} disabled={editingDisabled} limit={selectedTemplateField?.max_length ?? null} onApply={setSelectedLimit} />
              <TemplateTableTool allowed={editableField} disabled={editingDisabled} tables={fieldTables} onCreate={() => openDesigner(null)} onEdit={openDesigner} />
              <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
              <TemplateSelectionTools
                selection={selection}
                presets={presets}
                locked={locked || previewing}
                busy={busy}
                targets={moveTargets}
                onDuplicate={duplicateSelected}
                onMoveTo={moveSelectedTo}
                onResponsible={setSelectedResponsible}
                onPreset={applyPreset}
                onName={() => setNaming(selectedField)}
                onMove={moveSelected}
                onRemove={removeSelected}
                onOrientation={toggleOrientation}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
              <div className="flex shrink-0 items-center gap-1">
                <MenuTooltip label="Opciones avanzadas">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Opciones avanzadas" disabled={busy || locked}>
                        <Settings2 aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        {layoutControls.length ? (
                          <DropdownMenuItem disabled={locked} onSelect={() => setDesignOpen(true)}>
                            <Ruler aria-hidden="true" />
                            Diseño
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem disabled={locked} onSelect={() => setJsonOpen(true)}>
                          <Braces aria-hidden="true" />
                          Editar JSON
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </MenuTooltip>
              </div>
              <IconTooltip label={previewing ? "Volver a editar" : "Vista previa"}>
                <Button type="button" variant={previewing ? "secondary" : "ghost"} size="icon-sm" aria-label={previewing ? "Volver a editar" : "Vista previa"} aria-pressed={previewing} disabled={busy || previewLoading} data-draft-preview onClick={() => void togglePreview()}>
                  {previewLoading ? <Spinner /> : previewing ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </IconTooltip>
              <div className="flex shrink-0 items-center gap-2">
                {problems.length ? (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-problems onClick={showFirstProblem}>
                    <CircleAlert data-icon="inline-start" aria-hidden="true" />
                    {problemCount(problems.length)}
                  </Button>
                ) : null}
                <span className="sr-only" aria-live="polite">{changed ? "Sin guardar" : null}</span>
                <Button type="button" className="relative" data-tour="template-save" disabled={busy || !changed} onClick={() => void save()}>
                  {busy ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
                  Guardar
                  {changed ? <span data-unsaved className="absolute -top-1 -right-1 size-2.5 rounded-full bg-warning ring-2 ring-background" aria-hidden="true" /> : null}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {sheets.map((sheet, sheetIndex) => (
        <div key={sheetIndex} className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label={`Hoja ${sheetIndex + 1} de la plantilla con desplazamiento horizontal`}>
          <article
            ref={(element) => setSheet(sheetIndex, element)}
            data-sheet
            data-preview={readOnly ? "true" : "false"}
            style={{ zoom: scaleFor(sheet.landscape), ...layoutStyle(shownLayout, documentStyle) } as CSSProperties}
            className={cn("template-sheet relative shadow-none", sheet.landscape && "template-sheet--landscape")}
          >
            <div data-sheet-content className="flex flex-col gap-6">
              {sheetIndex === 0 ? (
                <header className="flex flex-col gap-3">
                  {logos ? (
                    <div className="flex items-center justify-between gap-4">
                      <label className={cn("group relative block", !readOnly && !locked && "cursor-pointer")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoOverride ?? logos.institution} alt="Logo de la universidad" className="h-12 w-auto object-contain" onLoad={paginate} />
                        {!readOnly && !locked ? (
                          <>
                            <span className="absolute inset-0 flex items-center justify-center gap-1 rounded-sm bg-background/80 text-sm font-medium opacity-0 outline outline-1 outline-border group-focus-within:opacity-100 group-hover:opacity-100">
                              {uploadingLogo ? <Spinner /> : <ImageUp className="size-4" aria-hidden="true" />}
                              Cambiar logo
                            </span>
                            <input type="file" accept="image/png" className="sr-only" aria-label="Cambiar el logo de la universidad" disabled={uploadingLogo} onChange={(event) => void changeLogo(event)} />
                          </>
                        ) : null}
                      </label>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logos.faculty} alt="Logo de la facultad" className="h-12 w-auto object-contain" onLoad={paginate} />
                    </div>
                  ) : null}
                  <div className="flex items-center justify-center px-2 py-1">
                    {!readOnly && !locked ? (
                      <div className="template-sheet-title w-full">
                        <TemplateInlineText value={titleDraft} maxLength={180} label="Título del documento" className="rounded-sm text-center hover:outline hover:outline-1 hover:outline-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onValueChange={setDocumentTitle} />
                      </div>
                    ) : (
                      <h2 className="template-sheet-title">{shownTitle}</h2>
                    )}
                  </div>
                  {!preview && problemsByTarget.general.length ? (
                    <ul data-general-problems className="flex flex-col gap-1 font-sans text-xs text-destructive">
                      {problemsByTarget.general.map((problem, index) => (
                        <li key={index} className="flex items-start gap-1" data-problem>
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          {problem.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </header>
              ) : null}

              {sheet.items.map(({ section, fields, index: sectionIndex }) => (
                <section key={section.id} data-section={section.id} data-orientation={sheet.landscape ? "landscape" : "portrait"} className="relative flex min-w-0 scroll-mt-36 flex-col gap-3">
                  {sectionMarked(sectionIndex) ? <span data-drop-mark className="pointer-events-none absolute inset-x-0 -top-3 z-10 h-0.5 rounded-full bg-primary" aria-hidden="true" /> : null}
                  {sectionIndex === sections.length - 1 && sectionMarked(sections.length) ? <span data-drop-mark className="pointer-events-none absolute inset-x-0 -bottom-3 z-10 h-0.5 rounded-full bg-primary" aria-hidden="true" /> : null}
                  {!readOnly && !locked && (sectionIndex === 0 || (sections[sectionIndex - 1]?.fields.length ?? 0) === 0) ? (
                    <TemplateInsertPoint disabled={locked || busy} actions={[{ key: "section", label: "Nueva sección" }]} position="top" gap="section" onInsert={() => addSection(sectionIndex)} />
                  ) : null}
                  {readOnly ? (
                    <h3 className="font-bold" data-section-title>{section.title}</h3>
                  ) : (
                    <div
                      data-section-heading
                      data-section-title
                      data-changed={proposedSection(section) || undefined}
                      className={cn("group/heading relative rounded-sm font-bold outline-offset-2", proposedSection(section) && "rounded-md bg-warning/10 ring-2 ring-warning/60", selectedSection === section.id ? "outline outline-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-primary/40")}
                      onFocus={() => selectSection(section.id)}
                    >
                      {proposedSection(section) ? <span className="absolute -top-2.5 right-2 z-10 rounded-full bg-warning px-2 py-0.5 font-sans text-xs font-medium text-warning-foreground" data-change-mark>Cambió</span> : null}
                      <IconTooltip label={`Arrastrar la sección ${section.title}`}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          data-drag-handle
                          draggable={!locked && !busy}
                          disabled={locked || busy}
                          aria-label={`Arrastrar la sección ${section.title}`}
                          className={cn("absolute top-1/2 -left-8 -translate-y-1/2 cursor-grab font-normal text-muted-foreground opacity-0 group-hover/heading:opacity-100 focus-visible:opacity-100", selectedSection === section.id && "opacity-100")}
                          onClick={() => selectSection(section.id)}
                          onDragStart={(event) => startDrag(event, { kind: "section", id: section.id })}
                          onDragEnd={endDrag}
                        >
                          <GripVertical aria-hidden="true" />
                        </Button>
                      </IconTooltip>
                      <TemplateInlineText
                        value={section.title}
                        maxLength={180}
                        disabled={locked}
                        label={`Sección ${section.title}`}
                        autoFocus={focusId === section.id}
                        onAutoFocused={() => setFocusId(null)}
                        onValueChange={(title) => setTitle(section, title)}
                      />
                    </div>
                  )}
                  {!preview && problemsByTarget.sections[section.id]?.length ? (
                    <ul className="flex flex-col gap-1 font-sans text-xs text-destructive" data-section-problems={section.id}>
                      {problemsByTarget.sections[section.id]!.map((problem, index) => (
                        <li key={index} className="flex items-start gap-1" data-problem>
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          {problem.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <ol className="flex flex-col gap-3">
                    {fields.map((field, fieldIndex) => {
                      const fieldProblems = !preview ? problemsByTarget.fields[field.id] ?? [] : []
                      return (
                        <li
                          key={field.id}
                          data-field={field.id}
                          data-field-responsible={field.quien_llena}
                          data-changed={proposedField(field) || undefined}
                          data-invalid={fieldProblems.length > 0 || undefined}
                          className={cn(
                            "relative min-w-0 rounded-sm px-2 py-1",
                            proposedField(field) && "rounded-md bg-warning/10 ring-2 ring-warning/60",
                            fieldProblems.length > 0 && "bg-destructive/5 ring-1 ring-destructive/60",
                            !readOnly && ["group outline-offset-2", selectedField === field.id ? "outline outline-2 outline-primary" : "outline outline-1 outline-transparent hover:outline-primary/40"],
                          )}
                        >
                          {proposedField(field) ? <span className="absolute -top-2.5 right-2 z-10 rounded-full bg-warning px-2 py-0.5 font-sans text-xs font-medium text-warning-foreground" data-change-mark>Cambió</span> : null}
                          {!readOnly && fieldMarked(section.id, fieldIndex) ? <span data-drop-mark className="pointer-events-none absolute inset-x-0 -top-2 z-10 h-0.5 rounded-full bg-primary" aria-hidden="true" /> : null}
                          {!readOnly && fieldIndex === fields.length - 1 && fieldMarked(section.id, fields.length) ? <span data-drop-mark className="pointer-events-none absolute inset-x-0 -bottom-2 z-10 h-0.5 rounded-full bg-primary" aria-hidden="true" /> : null}
                          {!readOnly ? (
                            <IconTooltip label={`Arrastrar el campo ${fieldName(field)}`}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                data-drag-handle
                                draggable={!locked && !busy}
                                disabled={locked || busy}
                                aria-label={`Arrastrar el campo ${fieldName(field)}`}
                                className={cn("absolute top-0 -left-8 z-10 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100", selectedField === field.id && "opacity-100")}
                                onClick={() => selectField(field.id, null)}
                                onDragStart={(event) => startDrag(event, { kind: "field", id: field.id })}
                                onDragEnd={endDrag}
                              >
                                <GripVertical aria-hidden="true" />
                              </Button>
                            </IconTooltip>
                          ) : null}
                          {!readOnly && !locked ? <TemplateInsertPoint disabled={busy} actions={[{ key: "field", label: "Agregar campo" }]} position="top" gap="field" onInsert={() => addField(section.id, fieldIndex)} /> : null}
                          {!readOnly && !locked && fieldIndex === fields.length - 1 ? (
                            <TemplateInsertPoint disabled={busy} actions={[{ key: "section", label: "Nueva sección" }, { key: "field", label: "Agregar campo" }]} position="bottom" gap="field" onInsert={(key) => insertAfterLastField(key, section.id, sectionIndex)} />
                          ) : null}
                          {readOnly ? (
                            <TemplateFieldContent field={field} variables={variables} preview />
                          ) : (
                            <TemplateSheetField
                              field={field}
                              locked={locked}
                              focusOnCreate={focusId === field.id}
                              naming={naming === field.id}
                              variables={variables}
                              onSelect={(editor) => selectField(field.id, editor)}
                              onNamed={() => setNaming(null)}
                              onFieldChange={(value) => setField(section.id, field.id, value)}
                            />
                          )}
                          {!readOnly && field.show_if ? <p className="mt-1 font-sans text-xs text-muted-foreground" data-field-condition={field.id}>{conditionLabel(field.show_if, allSources)}</p> : null}
                          {!readOnly && field.max_length && field.quien_llena !== "institucional" ? <p className="mt-1 font-sans text-xs text-muted-foreground" data-field-limit={field.id}>{limitLabel(field.max_length)}</p> : null}
                          {fieldProblems.length ? (
                            <ul className="mt-1 flex flex-col gap-1 font-sans text-xs text-destructive" data-field-problems={field.id}>
                              {fieldProblems.map((problem, index) => (
                                <li key={index} className="flex items-start gap-1" data-problem>
                                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                                  {problem.message}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                  </ol>
                  {fields.length === 0 && !readOnly ? (
                    <p className={cn("relative rounded-sm py-1 text-sm text-muted-foreground", fieldMarked(section.id, 0) && "outline outline-2 outline-dashed outline-primary")}>
                      Sección sin campos.
                      {!locked ? <TemplateInsertPoint disabled={busy} actions={[{ key: "field", label: "Agregar campo" }]} position="inline" gap="field" onInsert={() => addField(section.id)} /> : null}
                    </p>
                  ) : null}
                </section>
              ))}
              {sheetIndex === 0 && !readOnly && sections.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
                  <p>La plantilla no tiene secciones</p>
                  <Button type="button" variant="outline" disabled={locked || busy} onClick={() => addSection()}>
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Nueva sección
                  </Button>
                </div>
              ) : null}
            </div>
          </article>
        </div>
      ))}

      <TemplateImpactDialog impact={impact} onConfirm={confirmImpact} onCancel={() => setImpact(null)} />
      <UnsavedChangesDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Hay cambios sin guardar"
        description="Los cambios de la plantilla no se guardaron. Si vuelve, los perderá"
        discardLabel="Volver y descartar cambios"
        onContinue={() => setLeaveOpen(false)}
        onDiscard={discardAndLeave}
      />

      <Dialog open={designOpen} onOpenChange={setDesignOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Diseño</DialogTitle>
            <DialogDescription>Márgenes y tamaños del documento. La letra, los colores y la alineación son los institucionales</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            {layoutControls.map((control) => (
              <Field key={control.key}>
                <FieldLabel htmlFor={`template-layout-${control.key}`}>{control.label}</FieldLabel>
                <Select value={String(layoutDraft[control.key])} onValueChange={(value) => setLayout(control.key, value)}>
                  <SelectTrigger id={`template-layout-${control.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {control.options.map((option) => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TemplateTableDesigner
        open={designerOpen}
        onOpenChange={setDesignerOpen}
        templateId={template.id}
        design={designerKind ? designOf(designerKind) : null}
        reason={designerKind ? reasonOf(designerKind) : null}
        name={designerKind ? templateRuntime().definition?.blocks[designerKind]?.label : undefined}
        takenKinds={takenKinds}
        onApplied={applyTable}
      />
      <TemplateJsonDialog open={jsonOpen} onOpenChange={setJsonOpen} templateId={template.id} locked={locked} onImported={reloadAfterJson} />

      <Dialog open={editWarningOpen} onOpenChange={setEditWarningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar la plantilla</DialogTitle>
            <DialogDescription>Si guarda cambios:</DialogDescription>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>Al reanudar una convocatoria en pausa, sus sílabos vuelven a borrador y conservan lo escrito en los campos que siguen igual</li>
              <li>En el próximo período, los docentes no conservan lo que escribieron</li>
            </ul>
          </DialogHeader>
          <ConfirmPhrase id="template-edit-confirm" phrase={EDIT_PHRASE} value={editTyped} onValueChange={setEditTyped} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditWarningOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={!matchesPhrase(editTyped, EDIT_PHRASE)} onClick={startEditing}>
              <Pencil data-icon="inline-start" aria-hidden="true" />
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removal !== null} onOpenChange={(value) => { if (!value) setRemoval(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{removalTitle}</DialogTitle>
            <DialogDescription>{`${removalText} Se aplica al guardar la plantilla`}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoval(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={confirmRemoval}>
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
