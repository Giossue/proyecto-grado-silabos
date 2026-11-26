"use client"

import { CalendarPlus, Power, PowerOff, Trash2 } from "lucide-react"
import { useState } from "react"
import { deleteAcademicRecord, setAcademicRecordStatus } from "@/api/academic"
import { ApiError } from "@/api/client"
import { CatalogEditDialog } from "@/components/domain/academic/CatalogEditDialog"
import type { DialogAction } from "@/components/domain/DialogActions"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { SyllabusProcessDialog } from "@/components/domain/syllabus/SyllabusProcessDialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { afterDialogExit } from "@/lib/dialogExit"
import type { CatalogRecord, GovernanceCatalogEntity } from "@/types/academic"

type Option = { value: string; label: string }

type CatalogActionsProps = {
  entity: GovernanceCatalogEntity
  recordId: string
  logoUrl?: string | null
  recordName: string
  recordCode?: string | null
  active?: boolean
  facultyId?: string | null
  modality?: string | null
  modalityOptions: Option[]
  campus?: string | null
  campusOptions: Option[]
  catalogLibraries?: string[]
  startsOn?: string | null
  endsOn?: string | null
  institutionalProcess?: { id: string; state: "abierto" | "pausado" | "cerrado" } | null
  faculties: CatalogRecord[]
  lockReason?: string | null
  deactivateBlockedReason?: string | null
  deactivateUsers?: { coordinators: number; teachers: number } | null
  editOpen: boolean
  onEditOpenChange: (open: boolean) => void
  onChanged: (message: string) => void
}

const NO_LIBRARIES: string[] = []

export function CatalogActions({
  entity,
  recordId,
  logoUrl,
  recordName,
  recordCode,
  active,
  facultyId,
  modality,
  modalityOptions,
  campus,
  campusOptions,
  catalogLibraries = NO_LIBRARIES,
  startsOn,
  endsOn,
  institutionalProcess,
  faculties,
  lockReason,
  deactivateBlockedReason,
  deactivateUsers,
  editOpen,
  onEditOpenChange,
  onChanged,
}: CatalogActionsProps) {
  const [processOpen, setProcessOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusEntity = entity === "facultad" || entity === "carrera"
  const noun = entity === "facultad" ? "facultad" : "carrera"

  const changedAfterExit = async (message: string): Promise<void> => {
    await afterDialogExit()
    onChanged(message)
  }

  const sheetActions: DialogAction[] = []
  if (!lockReason) {
    if (entity === "periodo" && !institutionalProcess) sheetActions.push({ key: "process", label: "Abrir periodo académico", icon: CalendarPlus })
    if (statusEntity) {
      sheetActions.push(
        active
          ? {
              key: "status",
              label: `Desactivar ${noun}`,
              icon: PowerOff,
              destructive: true,
              disabled: Boolean(deactivateBlockedReason),
              disabledReason: deactivateBlockedReason ?? undefined,
            }
          : { key: "status", label: `Reactivar ${noun}`, icon: Power },
      )
    }
    if (entity === "periodo") sheetActions.push({ key: "delete", label: "Eliminar", icon: Trash2, destructive: true })
  }

  const runAction = (key: string): void => {
    onEditOpenChange(false)
    if (key === "process") setProcessOpen(true)
    if (key === "delete") setDeleteOpen(true)
    if (key === "status") {
      setError(null)
      setStatusOpen(true)
    }
  }

  const statusDescription = (): string => {
    if (entity === "facultad") {
      return active
        ? `«${recordName}» no se podrá elegir para carreras nuevas. Su historial se conserva y podrá reactivarla después`
        : `«${recordName}» volverá a estar disponible`
    }
    if (!active) return `«${recordName}» volverá a participar en los próximos periodos académicos`
    const { coordinators = 0, teachers = 0 } = deactivateUsers ?? {}
    const people = [coordinators && `${coordinators} ${coordinators === 1 ? "coordinador" : "coordinadores"}`, teachers && `${teachers} ${teachers === 1 ? "docente" : "docentes"}`]
      .filter(Boolean)
      .join(" y ")
    const retire = people ? `. Se retirarán ${people} de esta carrera; quien tenga rol en otra carrera lo conserva` : ""

    return `«${recordName}» dejará de participar en nuevos periodos académicos${retire}. Su historial se conserva y podrá reactivarla después`
  }

  const changeStatus = async (): Promise<void> => {
    if (entity !== "facultad" && entity !== "carrera") return
    setChangingStatus(true)
    setError(null)
    try {
      const result = await setAcademicRecordStatus(entity, recordId, !active)
      setStatusOpen(false)
      await changedAfterExit(result.message)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : `No se pudo cambiar el estado de la ${noun}`)
    } finally {
      setChangingStatus(false)
    }
  }

  const remove = async (): Promise<void> => {
    setDeleting(true)
    setError(null)
    try {
      const result = await deleteAcademicRecord(entity, recordId)
      setDeleteOpen(false)
      await changedAfterExit(result.message)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo eliminar el registro")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="contents">
      {entity === "periodo" && !institutionalProcess ? (
        <SyllabusProcessDialog
          open={processOpen}
          onOpenChange={setProcessOpen}
          template={null}
          periods={[]}
          period={{ id: recordId, codigo: recordName, starts_on: startsOn ?? undefined, ends_on: endsOn ?? undefined }}
          display="menu"
          triggerLabel="Abrir periodo académico"
          onSaved={(message) => void changedAfterExit(message)}
        />
      ) : null}
      <CatalogEditDialog
        key={recordId}
        open={editOpen}
        onOpenChange={onEditOpenChange}
        lockReason={lockReason ?? null}
        entity={entity}
        recordId={recordId}
        recordName={recordName}
        recordCode={recordCode ?? null}
        facultyId={facultyId}
        modality={modality}
        campus={campus}
        catalogLibraries={catalogLibraries}
        campusOptions={campusOptions}
        modalityOptions={modalityOptions}
        logoUrl={logoUrl}
        startsOn={startsOn}
        endsOn={endsOn}
        faculties={faculties}
        showTrigger={false}
        actions={sheetActions}
        onAction={runAction}
        onSaved={onChanged}
      />

      {entity === "periodo" ? (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar período</DialogTitle>
              <DialogDescription>Se eliminará «{recordName}». Se rechazará si ya tiene un periodo académico</DialogDescription>
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
                Eliminar registro
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {statusEntity ? (
        <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{active ? `Desactivar ${noun}` : `Reactivar ${noun}`}</DialogTitle>
              <DialogDescription>{statusDescription()}</DialogDescription>
            </DialogHeader>
            {error ? <FeedbackAlert message={error} /> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="button" variant={active ? "destructive" : "default"} disabled={changingStatus} onClick={() => void changeStatus()}>
                {changingStatus ? (
                  <Spinner data-icon="inline-start" />
                ) : active ? (
                  <PowerOff data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <Power data-icon="inline-start" aria-hidden="true" />
                )}
                {active ? "Desactivar" : "Reactivar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
