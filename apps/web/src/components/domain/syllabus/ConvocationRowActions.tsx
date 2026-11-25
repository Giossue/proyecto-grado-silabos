"use client"

import { CalendarPlus, LockKeyhole, Trash2 } from "lucide-react"
import { useImperativeHandle, useRef, useState, type Ref } from "react"
import { deleteAcademicRecord } from "@/api/academic"
import { ApiError } from "@/api/client"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { TableActionsMenu } from "@/components/domain/TableActionsMenu"
import type { ConvocationRow } from "@/components/domain/syllabus/convocationRows"
import { SyllabusProcessActions, type ProcessActionKey, type SyllabusProcessActionsHandle } from "@/components/domain/syllabus/SyllabusProcessActions"
import { SyllabusProcessDialog } from "@/components/domain/syllabus/SyllabusProcessDialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { afterDialogExit } from "@/lib/dialogExit"
import { withoutFinalPeriod } from "@/lib/utils"

export type ConvocationRowActionsHandle = { run: (key: string) => void }

type ConvocationRowActionsProps = {
  row: ConvocationRow
  menu?: boolean
  onChanged?: (message: string) => void
  ref?: Ref<ConvocationRowActionsHandle>
}

export function ConvocationRowActions({ row, menu = true, onChanged, ref }: ConvocationRowActionsProps) {
  const [processOpen, setProcessOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const processActions = useRef<SyllabusProcessActionsHandle>(null)

  const run = (key: string): void => {
    if (key === "abrir") setProcessOpen(true)
    else if (key === "eliminar-periodo") {
      setError(null)
      setDeleteOpen(true)
    } else processActions.current?.run(key as ProcessActionKey)
  }
  useImperativeHandle(ref, () => ({ run }))

  const changedAfterExit = async (message: string): Promise<void> => {
    await afterDialogExit()
    onChanged?.(message)
  }

  const remove = async (): Promise<void> => {
    setDeleting(true)
    setError(null)
    try {
      const result = await deleteAcademicRecord("periodo", row.id)
      setDeleteOpen(false)
      await changedAfterExit(result.message)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo eliminar el periodo")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex justify-end">
      {row.process ? (
        <SyllabusProcessActions ref={processActions} menu={menu} process={row.process} onCompleted={(message) => onChanged?.(message)} />
      ) : menu ? (
        <TableActionsMenu label={`Acciones para ${row.code}`} disabled={Boolean(row.lock_reason)}>
          {!row.lock_reason ? (
            <DropdownMenuItem onSelect={() => setProcessOpen(true)}>
              <CalendarPlus aria-hidden="true" />
              Abrir convocatoria
            </DropdownMenuItem>
          ) : null}
          {row.lock_reason ? (
            <DropdownMenuItem disabled>
              <LockKeyhole aria-hidden="true" />
              {withoutFinalPeriod(row.lock_reason)}
            </DropdownMenuItem>
          ) : null}
          {!row.lock_reason ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden="true" />
              Eliminar periodo
            </DropdownMenuItem>
          ) : null}
        </TableActionsMenu>
      ) : null}

      {!row.process ? (
        <SyllabusProcessDialog
          open={processOpen}
          onOpenChange={setProcessOpen}
          template={null}
          periods={[]}
          period={{ id: row.id, codigo: row.code, starts_on: row.starts_on, ends_on: row.ends_on }}
          display="menu"
          triggerLabel="Abrir convocatoria"
          onSaved={(message) => void changedAfterExit(message)}
        />
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar periodo</DialogTitle>
            <DialogDescription>
              Se eliminará el período «{row.code}»: sus fechas y sus semanas lectivas. Las materias, los paralelos y los docentes de las carreras no se borran. Si el período ya tiene una convocatoria, el sistema no permitirá eliminarlo. Esta acción no se puede deshacer
            </DialogDescription>
          </DialogHeader>
          {error ? <FeedbackAlert message={error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void remove()}>
              {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Eliminar periodo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
