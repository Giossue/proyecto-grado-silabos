"use client"

import { Trash2 } from "lucide-react"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { deleteSubjectRequirement } from "@/api/career-academics"
import type { CurriculumRequirement } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { toast } from "@/lib/toast"

type CurriculumRequirementDialogsProps = {
  curriculumId: string
  editable: boolean
  subjectName: (id: string | null | undefined) => string
  selectedRequirement: CurriculumRequirement | null
  onSelectedRequirementChange: (requirement: CurriculumRequirement | null) => void
  /** Takes out a prerequisite that was never saved; false when it has to be deleted in the server. */
  removePending: (requirementId: string) => boolean
  onChanged: (message: string) => void
}

export function CurriculumRequirementDialogs({ curriculumId, editable, subjectName, selectedRequirement, onSelectedRequirementChange, removePending, onChanged }: CurriculumRequirementDialogsProps) {
  const shownRequirement = useShownWhileClosing(selectedRequirement)
  const [deleting, setDeleting] = useState(false)

  const deleteRequirement = async (): Promise<void> => {
    const requirement = selectedRequirement
    if (!editable || !requirement) return
    if (removePending(requirement.id)) {
      onSelectedRequirementChange(null)
      return
    }
    setDeleting(true)
    try {
      const result = await deleteSubjectRequirement(curriculumId, requirement.id)
      toast.success("Relación académica eliminada")
      onChanged(result.message)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo eliminar la relación")
    } finally {
      setDeleting(false)
      onSelectedRequirementChange(null)
    }
  }

  return (
    <Dialog
      open={selectedRequirement !== null}
      onOpenChange={(open) => {
        if (!open) onSelectedRequirementChange(null)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prerrequisito</DialogTitle>
          <DialogDescription>
            «{subjectName(shownRequirement?.requirement_id)}» → «{subjectName(shownRequirement?.subject_id)}». Si la relación se creó por error, puede eliminarla; las materias no se modifican
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={deleting}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={deleting} onClick={() => void deleteRequirement()}>
            {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
            Eliminar relación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
