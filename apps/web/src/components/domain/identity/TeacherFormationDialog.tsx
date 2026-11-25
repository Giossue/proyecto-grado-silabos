"use client"

import { Save } from "lucide-react"
import Link from "next/link"
import type { FormEvent } from "react"
import { TeacherFormationField } from "@/components/domain/identity/TeacherFormationField"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { useTeacherFormation } from "@/composables/useTeacherFormation"
import { paths } from "@/lib/routes"

type TeacherFormationDialogProps = {
  required?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}

export function TeacherFormationDialog({ required = false, open, onOpenChange, onSaved }: TeacherFormationDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const { formation, setFormation, saving, error, changed, reset, save } = useTeacherFormation()
  useOpened(isOpen, reset, true)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!(await save())) return
    setOpen(false)
    onSaved?.()
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(value) => {
        if (value || !required) setOpen(value)
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        onEscapeKeyDown={(event) => {
          if (required) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{required ? "Complete su formación y experiencia" : "Formación y experiencia"}</DialogTitle>
          <DialogDescription>{required ? "La necesita para abrir sus sílabos" : "Sus títulos y su experiencia como docente"}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <TeacherFormationField id="dialog-formation" value={formation} onValueChange={setFormation} error={error} hideHint />
          <DialogFooter>
            {required ? (
              <Button asChild type="button" variant="outline">
                <Link href={paths.teacher.syllabi} data-test="leave-formation-button">
                  Volver a mis sílabos
                </Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled={saving} data-test="cancel-formation-button" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={saving || !changed} data-test="save-formation-button">
              {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
