"use client"

import { Handle, Position } from "@xyflow/react"
import { ArrowLeft, ArrowRight, Link2, Pencil, Plus, Trash2, Unlink } from "lucide-react"
import { useState, type MouseEvent } from "react"
import { ApiError } from "@/api/client"
import { deleteCurriculumSubject } from "@/api/career-academics"
import type { RelationMode } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { TableActionsMenu } from "@/components/domain/TableActionsMenu"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { afterDialogExit } from "@/lib/dialogExit"
import { useFocusReturn } from "@/lib/focusReturn"
import { formatNumericDisplay } from "@/lib/numberDisplay"
import { cn } from "@/lib/utils"
import type { CurriculumBuilderProps, CurriculumBuilderSubject, FixedSubjectField } from "@/types/academic"

export type SubjectNodeData = {
  career: CurriculumBuilderProps["career"]
  curriculum: CurriculumBuilderProps["curriculum"]
  fixedFields: FixedSubjectField[]
  subject: CurriculumBuilderSubject
  unitStyle: { backgroundColor: string; color: string }
  editable: boolean
  onEdit: () => void
  canMoveLeft: boolean
  canMoveRight: boolean
  onMoveLeft: () => void
  onMoveRight: () => void
  onRelate: (mode: RelationMode) => void
  onSaved: (message?: string) => void
}

const stop = (event: MouseEvent): void => event.stopPropagation()

function ConnectHandle({ editable, type }: { editable: boolean; type: "source" | "target" }) {
  const handle = (
    <Handle
      type={type}
      position={type === "target" ? Position.Top : Position.Bottom}
      isConnectable={editable}
      className={cn(editable && "curriculum-handle")}
      role={editable ? "button" : undefined}
      aria-label={editable ? (type === "target" ? "Conectar el requisito de esta materia" : "Conectar a la materia que requiere esta") : undefined}
      aria-hidden={editable ? undefined : "true"}
    >
      {editable ? <Plus className="pointer-events-none size-3 text-success-foreground" strokeWidth={3.5} aria-hidden="true" /> : null}
    </Handle>
  )
  if (!editable) return handle

  return (
    <Tooltip>
      <TooltipTrigger asChild>{handle}</TooltipTrigger>
      <TooltipContent>Conectar materias</TooltipContent>
    </Tooltip>
  )
}

export function CurriculumSubjectNode({ data, dragging }: { data: SubjectNodeData; dragging?: boolean }) {
  const [deleteRequested, setDeleteOpen] = useState(false)
  const deleteOpen = deleteRequested && data.editable
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  useFocusReturn(deleteOpen)

  const totalFieldIds = new Set(data.fixedFields.filter((field) => field.system_key === "total_hours").map((field) => field.id))
  const regularFields = data.subject?.display_fields.filter((field) => !totalFieldIds.has(field.id)) ?? []
  const totalFields = data.subject?.display_fields.filter((field) => totalFieldIds.has(field.id)) ?? []

  const deleteSubject = async (): Promise<void> => {
    if (!data.subject || !data.editable) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const result = await deleteCurriculumSubject(data.curriculum.id, data.subject.id)
      setDeleteOpen(false)
      setDeleting(false)
      await afterDialogExit()
      data.onSaved(result.message)
    } catch (reason) {
      setDeleteError(reason instanceof ApiError ? reason.message : "No se pudo eliminar la materia")
      setDeleting(false)
    }
  }

  if (!data.subject) return null

  const canRequire = data.subject.cycle !== 1
  const canBeRequired = data.subject.cycle !== data.curriculum.cycle_count

  return (
    <TooltipProvider>
      {/* A requirement comes from an earlier cycle: nothing enters the first one or leaves the last one. */}
      <ConnectHandle editable={data.editable && canRequire} type="target" />
      <article
        className={cn(
          "relative w-full overflow-hidden rounded-md bg-card text-card-foreground shadow-surface ring-1 ring-surface-ring data-[dragging=true]:shadow-menu data-[dragging=true]:ring-3 data-[dragging=true]:ring-ring/50",
          data.editable && "cursor-move",
        )}
        data-dragging={dragging ? "true" : "false"}
        aria-label={`${data.subject.code}: ${data.subject.name}`}
      >
        {data.editable ? (
          <div className="nodrag nopan absolute top-1 right-1" onClick={stop} onMouseDown={stop}>
            <TableActionsMenu label={`Acciones para ${data.subject.name}`}>
              <DropdownMenuItem onSelect={data.onEdit}>
                <Pencil aria-hidden="true" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!data.canMoveLeft} onSelect={data.onMoveLeft}>
                <ArrowLeft aria-hidden="true" />
                Mover a la izquierda
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!data.canMoveRight} onSelect={data.onMoveRight}>
                <ArrowRight aria-hidden="true" />
                Mover a la derecha
              </DropdownMenuItem>
              {canRequire ? (
                <DropdownMenuItem onSelect={() => data.onRelate("requires")}>
                  <Link2 aria-hidden="true" />
                  Requiere otra materia…
                </DropdownMenuItem>
              ) : null}
              {canBeRequired ? (
                <DropdownMenuItem onSelect={() => data.onRelate("required-by")}>
                  <Unlink aria-hidden="true" />
                  Es requisito de otra materia…
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden="true" />
                Eliminar
              </DropdownMenuItem>
            </TableActionsMenu>
          </div>
        ) : null}

        <div className="flex h-24">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex w-9 shrink-0 items-center justify-center border-r px-1 py-2" style={data.unitStyle}>
                <span className="-rotate-90 text-curriculum-code font-semibold whitespace-nowrap">{data.subject.code}</span>
              </div>
            </TooltipTrigger>
            {data.subject.organization_unit_label ? <TooltipContent>{data.subject.organization_unit_label}</TooltipContent> : null}
          </Tooltip>
          <div className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 p-2 text-center", data.editable && "pr-9")}>
            <h2 className="line-clamp-3 text-xs leading-snug font-semibold uppercase">{data.subject.name}</h2>
          </div>
        </div>

        <p className="border-t px-2 py-0.5 text-center text-curriculum-code tracking-wide text-muted-foreground uppercase">
          {data.subject.modality_label ?? data.career.modality?.label ?? "Sin modalidad"}
          {data.subject.generates_syllabus === false ? " · Sin sílabo" : null}
        </p>

        {data.subject.display_fields.length > 0 ? (
          <div className="border-t bg-muted/40">
            {regularFields.length > 0 ? (
              <dl className="grid" style={{ gridTemplateColumns: `repeat(${regularFields.length}, minmax(0, 1fr))` }}>
                {regularFields.map((field) => (
                  <div key={field.id} className="border-r text-center last:border-r-0">
                    <dt className="px-1 py-1 text-curriculum-metric font-semibold" style={data.unitStyle}>
                      {field.label}
                    </dt>
                    <dd className="px-1 py-1 text-xs font-medium">{formatNumericDisplay(field.value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {totalFields.map((field) => (
              <dl key={field.id} className={cn("text-center", regularFields.length > 0 && "border-t")}>
                <dt className="px-1 py-1 text-curriculum-metric font-semibold" style={data.unitStyle}>
                  {field.label}
                </dt>
                <dd className="px-1 py-1 text-xs font-medium">{formatNumericDisplay(field.value)}</dd>
              </dl>
            ))}
          </div>
        ) : null}
      </article>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="nodrag nopan" onMouseDown={stop} onKeyDown={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Eliminar materia</DialogTitle>
            <DialogDescription>
              Se eliminará «{data.subject.name}» junto con sus relaciones académicas. Esta acción solo se completará si la materia no tiene programaciones ni sílabos relacionados
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <FeedbackAlert message={deleteError} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={deleting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void deleteSubject()}>
              {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Eliminar materia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConnectHandle editable={data.editable && canBeRequired} type="source" />
    </TooltipProvider>
  )
}
