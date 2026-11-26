"use client"

import "@xyflow/react/dist/style.css"
import { ConnectionMode, NodeChangeset, ReactFlow, type Connection, type Edge, type Node } from "@xyflow/react"
import { Info } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFillHeight } from "@/composables/useFillHeight"
import { ApiError } from "@/api/client"
import { updateSubjectLayout } from "@/api/career-academics"
import {
  buildCurriculumNodes,
  buildRequirementEdges,
  CANVAS_ZOOM,
  FALLBACK_UNIT_STYLE,
  laneHeight,
  laneInset,
  laneStart,
  navigationPadding,
  subjectOffset,
  subjectStep,
  UNIT_PALETTE,
  ZOOM_LEVELS,
  type CurriculumRequirement,
  type ZoomChoice,
} from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { CurriculumLegend } from "@/components/domain/academic/curriculum/CurriculumLegend"
import { CurriculumNavigationControls } from "@/components/domain/academic/curriculum/CurriculumNavigationControls"
import { CurriculumAddContext, curriculumEdgeTypes, curriculumNodeTypes } from "@/components/domain/academic/curriculum/curriculumNodeTypes"
import { CurriculumRelationPicker, type RelationPickerState } from "@/components/domain/academic/curriculum/CurriculumRelationPicker"
import { CurriculumRequirementDialogs, useRequirementConnection } from "@/components/domain/academic/curriculum/CurriculumRequirementDialogs"
import { CurriculumVisualSubjectForm } from "@/components/domain/academic/curriculum/CurriculumVisualSubjectForm"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { useFocusReturn } from "@/lib/focusReturn"
import { formatNumericDisplay } from "@/lib/numberDisplay"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import type { CurriculumBuilderProps, CurriculumBuilderSubject } from "@/types/academic"

type CurriculumCanvasProps = Pick<CurriculumBuilderProps, "curriculum" | "fixedFields" | "fixedFieldTotals" | "subjects" | "requirements" | "career"> & {
  editing: boolean
  fullScreen?: boolean
  organizationUnits: CurriculumBuilderProps["organizationUnitOptions"]
  modalityOptions: CurriculumBuilderProps["modalityOptions"]
  onChanged: (message: string) => void
}

type DragPreview = { subjectId: string; cycle: number; index: number }

const ZOOM_STORAGE_KEY = "curriculum-zoom"

const storedZoom = (): ZoomChoice => {
  if (typeof window === "undefined") return "fit"
  const saved = localStorage.getItem(ZOOM_STORAGE_KEY)

  return ZOOM_LEVELS.find((value) => String(value) === saved) ?? "fit"
}

const withMeasures = (next: Node[], previous: Node[]): Node[] => {
  const byId = new Map(previous.map((item) => [item.id, item]))

  return next.map((item) => {
    const measured = byId.get(item.id)?.measured

    return measured ? { ...item, measured } : item
  })
}

const sameList = (left: unknown[], right: unknown[]): boolean => left.length === right.length && left.every((value, index) => Object.is(value, right[index]))

export function CurriculumCanvas({ curriculum, fixedFields, fixedFieldTotals, subjects, requirements, career, editing, fullScreen = false, organizationUnits, modalityOptions, onChanged }: CurriculumCanvasProps) {
  const scrollElement = useRef<HTMLDivElement>(null)
  const canvasElement = useRef<HTMLDivElement>(null)
  const fillHeight = useFillHeight(canvasElement, !fullScreen)
  const legendAnchor = useRef<HTMLSpanElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [legendOpen, setLegendOpen] = useState(false)
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null)
  const [draftCycle, setDraftCycle] = useState<number | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [savingLayout, setSavingLayout] = useState(false)
  const [editorOpenings, setEditorOpenings] = useState(0)
  const [relationPicker, setRelationPicker] = useState<RelationPickerState>(null)
  const [selectedRequirement, setSelectedRequirement] = useState<CurriculumRequirement | null>(null)
  const [zoomChoice, setZoomChoice] = useState<ZoomChoice>(storedZoom)
  const editable = editing && curriculum.editable && !curriculum.lock_reason
  const hasOpenEditor = editingSubjectId !== null || draftCycle !== null
  useFocusReturn(hasOpenEditor)

  const [seenEditable, setSeenEditable] = useState(editable)
  if (seenEditable !== editable) {
    setSeenEditable(editable)
    if (!editable) {
      setEditingSubjectId(null)
      setDraftCycle(null)
      setSelectedRequirement(null)
      setDragPreview(null)
    }
  }

  const [seenSubjects, setSeenSubjects] = useState(subjects)
  if (seenSubjects !== subjects) {
    setSeenSubjects(subjects)
    setDragPreview(null)
  }

  useEffect(() => {
    const element = scrollElement.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setCanvasWidth(rect.width)
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  const unitStyleFor = (unit: string | null | undefined): (typeof UNIT_PALETTE)[number] => {
    const index = organizationUnits.findIndex((option) => option.value === unit)

    return index === -1 ? FALLBACK_UNIT_STYLE : UNIT_PALETTE[index % UNIT_PALETTE.length]!
  }

  const summaryLabel = (fieldId: string, label: string): string => fixedFields.find((field) => field.id === fieldId)?.system_label ?? label
  const legendUnits = organizationUnits.map((option) => ({ unit: option.label, style: unitStyleFor(option.value) }))
  const summaryRows = [
    { id: "modality", label: "Modalidad", value: career.modality?.label ?? "—" },
    { id: "subjects", label: "N° asignaturas", value: String(subjects.length) },
    ...fixedFieldTotals.map((total) => ({ id: total.id, label: summaryLabel(total.id, total.label), value: formatNumericDisplay(total.value) })),
  ]

  const subjectsForCycle = (cycle: number): CurriculumBuilderSubject[] =>
    subjects
      .filter((subject) => subject.cycle === cycle)
      .sort((left, right) => (left.position === right.position ? left.name.localeCompare(right.name) : left.position - right.position))

  const previewSubjectsForCycle = (cycle: number, preview: DragPreview | null): CurriculumBuilderSubject[] => {
    const list = subjectsForCycle(cycle)
    if (!preview || preview.cycle !== cycle) return list
    const sourceIndex = list.findIndex((subject) => subject.id === preview.subjectId)
    if (sourceIndex === -1) return list
    const [moved] = list.splice(sourceIndex, 1)
    if (moved) list.splice(preview.index, 0, moved)

    return list
  }

  const widestCycle = Array.from({ length: curriculum.cycle_count }, (_, index) => laneStart + subjectsForCycle(index + 1).length * subjectStep + (editable ? subjectStep : 0)).reduce(
    (widest, width) => Math.max(widest, width),
    0,
  )
  const laneWidth = Math.max(1120, widestCycle + 200)
  const contentHeight = Math.max(laneHeight - laneInset, curriculum.cycle_count * laneHeight - laneInset)
  const boardWidth = laneWidth + navigationPadding * 2
  const boardHeight = contentHeight + navigationPadding * 2
  const zoom = zoomChoice !== "fit" ? zoomChoice : canvasWidth === 0 ? 1 : Math.min(CANVAS_ZOOM.max, Math.max(CANVAS_ZOOM.min, canvasWidth / boardWidth))

  const chooseZoom = (choice: ZoomChoice): void => {
    setZoomChoice(choice)
    localStorage.setItem(ZOOM_STORAGE_KEY, String(choice))
  }

  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects])
  const edges: Edge[] = useMemo(() => buildRequirementEdges(requirements, subjectById), [requirements, subjectById])

  const editorTarget = useMemo(() => (hasOpenEditor ? { subjectId: editingSubjectId, cycle: draftCycle } : null), [hasOpenEditor, editingSubjectId, draftCycle])
  const shownEditor = useShownWhileClosing(editorTarget)
  const editorSubject = shownEditor?.subjectId ? (subjectById.get(shownEditor.subjectId) ?? null) : null
  const editorCycle = editorSubject?.cycle ?? shownEditor?.cycle ?? 1
  const editorPosition = editorSubject?.position ?? Math.max(-1, ...subjectsForCycle(editorCycle).map((subject) => subject.position)) + 1

  const beginSubjectEdit = (subjectId: string): void => {
    if (!editable) return
    if (!hasOpenEditor) setEditorOpenings((count) => count + 1)
    setDraftCycle(null)
    setEditingSubjectId(subjectId)
  }

  const beginSubjectCreation = (cycle: number): void => {
    if (!editable) return
    if (!hasOpenEditor) setEditorOpenings((count) => count + 1)
    setEditingSubjectId(null)
    setDraftCycle(cycle)
  }

  const closeEditor = (): void => {
    setEditingSubjectId(null)
    setDraftCycle(null)
  }

  const moveSubject = async (subjectId: string, delta: -1 | 1): Promise<void> => {
    const subject = subjectById.get(subjectId)
    if (!editable || savingLayout || !subject || typeof subject.cycle !== "number") return
    const cycleSubjects = subjectsForCycle(subject.cycle)
    const index = cycleSubjects.findIndex((item) => item.id === subjectId) + delta
    if (index < 0 || index >= cycleSubjects.length) return
    setSavingLayout(true)
    try {
      const result = await updateSubjectLayout(curriculum.id, { subject_id: subjectId, cycle: subject.cycle, position: index })
      onChanged(result.message)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo mover la materia")
    } finally {
      setSavingLayout(false)
    }
  }

  const buildNodes = (preview: DragPreview | null, saving = savingLayout): Node[] =>
    buildCurriculumNodes({
      career,
      curriculum,
      fixedFields,
      subjectsForCycle: (cycle) => previewSubjectsForCycle(cycle, preview),
      unitStyleFor,
      laneWidth,
      editable,
      hasOpenEditor,
      savingLayout: saving,
      draggingSubjectId: preview?.subjectId,
      onEdit: (subjectId) => beginSubjectEdit(subjectId),
      onMove: (subjectId, delta) => void moveSubject(subjectId, delta),
      onRelate: (subjectId, mode) => setRelationPicker({ subjectId, mode }),
      onSaved: (message) => {
        if (message) onChanged(message)
      },
    })

  const [nodes, setNodes] = useState<Node[]>(() => buildNodes(null))
  const nodeInputs = [subjects, requirements, organizationUnits, curriculum.cycle_count, editable, editingSubjectId, draftCycle, savingLayout]
  const [seenInputs, setSeenInputs] = useState(nodeInputs)
  if (!sameList(seenInputs, nodeInputs)) {
    setSeenInputs(nodeInputs)
    setNodes((current) => withMeasures(buildNodes(dragPreview), current))
  }

  const synchronizeNodePositions = (preview: DragPreview | null, saving: boolean): void => setNodes((current) => withMeasures(buildNodes(preview, saving), current))

  const subjectName = (id: string | null | undefined): string => (id && subjectById.get(id)?.name) || "materia"
  const subjectCycle = (id: string | null | undefined): number | null => (id && subjectById.get(id)?.cycle) || null
  const { connect } = useRequirementConnection({ curriculumId: curriculum.id, editable, subjectCycle, onChanged })

  const onConnect = (connection: Connection): void => {
    if (!editable || hasOpenEditor || !connection.source || !connection.target) return
    void connect({ sourceId: connection.source, targetId: connection.target })
  }

  const onNodeClick = (_event: unknown, node: Node): void => {
    const cycle = node.data.cycle
    if (node.type === "addSubject" && node.data.disabled !== true && typeof cycle === "number") beginSubjectCreation(cycle)
  }

  const onEdgeClick = (_event: unknown, edge: Edge): void => {
    if (!editable || hasOpenEditor) return
    setSelectedRequirement(requirements.find((requirement) => requirement.id === edge.id) ?? null)
  }

  const onNodeDrag = (_event: unknown, node: Node): void => {
    const subject = subjectById.get(node.id)
    if (!editable || savingLayout || node.type !== "subject" || !subject || typeof subject.cycle !== "number") return
    const cycleSubjects = subjectsForCycle(subject.cycle)
    const cycleY = (subject.cycle - 1) * laneHeight + subjectOffset
    const maxX = laneStart + (cycleSubjects.length - 1) * subjectStep
    const x = Math.max(laneStart, Math.min(maxX, node.position.x))
    const index = Math.max(0, Math.min(cycleSubjects.length - 1, Math.round((x - laneStart) / subjectStep)))
    const preview = dragPreview?.subjectId === node.id && dragPreview.index === index ? dragPreview : { subjectId: node.id, cycle: subject.cycle, index }
    if (preview !== dragPreview) setDragPreview(preview)
    const slots = new Map(previewSubjectsForCycle(subject.cycle, preview).map((item, slot) => [item.id, slot]))
    setNodes((current) =>
      current.map((item) => {
        if (item.id === node.id) return { ...item, position: { x, y: cycleY }, zIndex: 10 }
        const slot = slots.get(item.id)

        return slot === undefined ? item : { ...item, position: { ...item.position, x: laneStart + slot * subjectStep } }
      }),
    )
  }

  const onNodeDragStop = async (_event: unknown, node: Node): Promise<void> => {
    const subject = subjectById.get(node.id)
    if (!editable || node.type !== "subject" || !subject || typeof subject.cycle !== "number") return
    const originalIndex = subjectsForCycle(subject.cycle).findIndex((item) => item.id === node.id)
    const index = dragPreview?.subjectId === node.id ? dragPreview.index : originalIndex
    if (index === originalIndex) {
      setDragPreview(null)
      synchronizeNodePositions(null, savingLayout)
      return
    }
    setSavingLayout(true)
    synchronizeNodePositions(dragPreview, true)
    try {
      const result = await updateSubjectLayout(curriculum.id, { subject_id: node.id, cycle: subject.cycle, position: index })
      onChanged(result.message)
    } catch (reason) {
      setDragPreview(null)
      synchronizeNodePositions(null, true)
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo mover la materia")
    } finally {
      setSavingLayout(false)
    }
  }

  const onNodesChange = (changes: NodeChangeset<Node>): void => {
    const list = changes.toArray()
    setNodes((current) => new NodeChangeset(list).applyTo(current))
  }

  return (
    <div
      ref={canvasElement}
      className={cn("curriculum-canvas relative min-h-96 overflow-hidden bg-background", fullScreen ? "h-(--curriculum-canvas-full-height)" : "h-(--curriculum-canvas-height)")}
      style={fillHeight !== null ? { height: `${fillHeight}px` } : undefined}
      aria-label={editing ? "Editor interactivo de la malla" : "Vista de la malla"}
    >
      <CurriculumRelationPicker subjects={subjects} picker={relationPicker} onPickerChange={setRelationPicker} onPick={(pending) => void connect(pending)} />
      <CurriculumNavigationControls choice={zoomChoice} zoom={zoom} onChoiceChange={chooseZoom}>
        <Popover open={legendOpen} onOpenChange={setLegendOpen}>
          <PopoverAnchor asChild>
            <span ref={legendAnchor} className="inline-flex">
              <IconTooltip label="Ver leyenda y totales de la malla">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="bg-card/90"
                  aria-label="Ver leyenda y totales de la malla"
                  aria-haspopup="dialog"
                  aria-expanded={legendOpen}
                  onClick={() => setLegendOpen((open) => !open)}
                >
                  <Info aria-hidden="true" />
                </Button>
              </IconTooltip>
            </span>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            className="w-64 p-3"
            onInteractOutside={(event) => {
              if (event.target instanceof globalThis.Node && legendAnchor.current?.contains(event.target)) event.preventDefault()
            }}
          >
            <CurriculumLegend units={legendUnits} rows={summaryRows} />
          </PopoverContent>
        </Popover>
      </CurriculumNavigationControls>
      <div ref={scrollElement} data-curriculum-scroll className="absolute inset-x-0 top-14 bottom-0 overflow-auto">
        <div data-curriculum-board className="relative mx-auto" style={{ width: `${boardWidth * zoom}px`, height: `${boardHeight * zoom}px` }}>
          <CurriculumAddContext.Provider value={beginSubjectCreation}>
            <ReactFlow
              id={`curriculum-${curriculum.id}`}
              nodes={nodes}
              edges={edges}
              nodeTypes={curriculumNodeTypes}
              edgeTypes={curriculumEdgeTypes}
              onNodesChange={onNodesChange}
              viewport={{ x: navigationPadding * zoom, y: navigationPadding * zoom, zoom }}
              minZoom={CANVAS_ZOOM.min}
              maxZoom={CANVAS_ZOOM.max}
              autoPanOnNodeDrag={false}
              panOnDrag={false}
              panOnScroll={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              connectionMode={ConnectionMode.Loose}
              nodesDraggable={editable && !hasOpenEditor}
              nodesConnectable={editable && !hasOpenEditor}
              elementsSelectable
              disableKeyboardA11y
              proOptions={{ hideAttribution: true }}
              onConnect={onConnect}
              onEdgeClick={onEdgeClick}
              onNodeClick={onNodeClick}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={(event, node) => void onNodeDragStop(event, node)}
            />
          </CurriculumAddContext.Provider>
        </div>
      </div>
      <CurriculumRequirementDialogs
        curriculumId={curriculum.id}
        editable={editable}
        subjectName={subjectName}
        subjectCycle={subjectCycle}
        selectedRequirement={selectedRequirement}
        onSelectedRequirementChange={setSelectedRequirement}
        onChanged={onChanged}
      />
      <Dialog
        open={hasOpenEditor}
        onOpenChange={(open) => {
          if (!open) closeEditor()
        }}
      >
        <DialogContent className="flex max-h-(--overlay-max-height) flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-2rem)]">
            <div className="grid gap-4 p-6">
              <DialogHeader>
                <DialogTitle>{editorSubject ? "Editar materia" : "Agregar materia"}</DialogTitle>
                <DialogDescription>{editorSubject ? "Cambie los datos de la materia" : "Complete los datos de la nueva materia"}</DialogDescription>
              </DialogHeader>
              <CurriculumVisualSubjectForm
                key={`${editorSubject?.id ?? `new-${editorCycle}`}-${editorOpenings}`}
                career={career}
                modalityOptions={modalityOptions}
                curriculum={curriculum}
                fixedFields={fixedFields}
                organizationUnits={organizationUnits}
                subject={editorSubject}
                cycle={editorCycle}
                position={editorPosition}
                onCancel={closeEditor}
                onSaved={(message) => {
                  closeEditor()
                  if (message) onChanged(message)
                }}
              />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
