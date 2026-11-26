"use client"

import { UserMinus } from "lucide-react"
import { useRef, useState } from "react"
import { reactivateCareerTeacher, removeCareerTeacher, resendCareerTeacherInvitation, type TeacherAssignments } from "@/api/career-academics"
import { ApiError } from "@/api/client"
import { CareerTeacherEditDialog } from "@/components/domain/academic/CareerTeacherEditDialog"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortStatus } from "@/components/domain/TableSort"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableEmpty, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { useTableSort, type SortColumns } from "@/composables/useTableSort"
import { afterDialogExit, useShownWhileClosing } from "@/lib/dialogExit"
import { activateRow, rowButtonClass } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"

type TeacherRow = TeacherAssignments["careerTeachers"][number]

const searchable = (item: TeacherRow) => [item.name, item.email]
const stateOf = (item: TeacherRow): "inactive" | "pending" | "active" => (!item.active ? "inactive" : item.pending_activation ? "pending" : "active")
const stateTones = { inactive: "neutral", pending: "warning", active: "success" } as const
const filters: Record<string, ClientFilterDefinition<TeacherRow>> = {
  estado: { matches: (item, value) => stateOf(item) === value },
}
const statusOf = (item: TeacherRow): string => {
  if (!item.active) return "Inactivo"
  return item.pending_activation ? (item.invitation_expired ? "Invitación vencida" : "Pendiente") : "Activo"
}
const sortColumns = {
  name: { label: "Docente", value: (item: TeacherRow) => item.name },
  email: { label: "Correo", value: (item: TeacherRow) => item.email },
  status: { label: "Estado", value: statusOf },
} satisfies SortColumns<TeacherRow>

export function TeacherAssignmentsPanel({ data, onChanged }: { data: TeacherAssignments; onChanged: (message: string) => void }) {
  const filter = useClientFilter(data.careerTeachers, searchable, filters)
  const sort = useTableSort(filter.items, sortColumns)
  const pagination = useClientPagination(sort.items, 20, `${filter.criteria}|${sort.criteria}`)
  const [editing, setEditing] = useState<TeacherRow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [removing, setRemoving] = useState<TeacherRow | null>(null)
  const [removeProcessing, setRemoveProcessing] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const removingShown = useShownWhileClosing(removing)
  const sheetShown = useRef(false)

  const changeSheet = (open: boolean): void => {
    sheetShown.current = open
    setSheetOpen(open)
    if (open) return
    void afterDialogExit().then(() => {
      if (!sheetShown.current) setEditing(null)
    })
  }

  const openEditor = (item: TeacherRow): void => {
    setEditing(item)
    changeSheet(true)
  }

  const askRemoval = (item: TeacherRow): void => {
    changeSheet(false)
    setRemoving(item)
    setRemoveError(null)
  }

  /** For actions that need no confirmation: close the sheet, run it and report once it has left. */
  const runFromSheet = async (action: () => Promise<{ message: string }>, failure: string): Promise<void> => {
    changeSheet(false)
    try {
      const result = await action()
      await afterDialogExit()
      onChanged(result.message)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : failure)
    }
  }

  const removeFromCareer = async (): Promise<void> => {
    if (!removing) return
    setRemoveProcessing(true)
    setRemoveError(null)
    try {
      const result = await removeCareerTeacher(removing.id)
      setRemoving(null)
      onChanged(result.message)
    } catch (reason) {
      setRemoveError(reason instanceof ApiError ? reason.message : "No se pudo desactivar al docente")
    } finally {
      setRemoveProcessing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ClientFilterBar
        filter={filter}
        inputId="teacher-assignments-search"
        label="Buscar docente"
        placeholder="Buscar por docente o correo"
        sort={sort}
        filters={
          <Field>
            <FieldLabel htmlFor="teacher-assignments-state" className="sr-only">
              Estado
            </FieldLabel>
            <Select value={filter.values.estado} onValueChange={(value) => filter.setValue("estado", value)}>
              <SelectTrigger id="teacher-assignments-state">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        }
      />
      <Table label="Docentes de la carrera">
        <TableHeader>
          <TableRow>
            <SortableHead sort={sort} column="name">Docente</SortableHead>
            <SortableHead sort={sort} column="email">Correo</SortableHead>
            <SortableHead sort={sort} column="status" className="text-center">Estado</SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!pagination.items.length ? (
            <TableEmpty colSpan={3}>{filter.active ? "Ningún docente coincide con la búsqueda" : "No existen docentes en esta carrera"}</TableEmpty>
          ) : (
            pagination.items.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer"
                onClick={(event) => activateRow(event.nativeEvent, () => openEditor(item))}
              >
                <TableCell>
                  <button type="button" className={rowButtonClass} onClick={() => openEditor(item)}>{item.name}</button>
                  <TableCardLine>
                    {item.email}
                    <StatusBadge label={statusOf(item)} tone={stateTones[stateOf(item)]} />
                  </TableCardLine>
                </TableCell>
                <TableCell data-card-hide="true">{item.email}</TableCell>
                <TableCell className="text-center" data-card-hide="true">
                  <StatusBadge label={statusOf(item)} tone={stateTones[stateOf(item)]} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <SortStatus sort={sort} />
      {editing ? (
        <CareerTeacherEditDialog
          key={editing.id}
          teacher={editing}
          open={sheetOpen}
          onOpenChange={changeSheet}
          removeDisabled={Boolean(data.career.lock_reason)}
          onRemove={() => askRemoval(editing)}
          onReactivate={() => void runFromSheet(() => reactivateCareerTeacher(editing.id), "No se pudo reactivar al docente")}
          onResend={() => void runFromSheet(() => resendCareerTeacherInvitation(editing.id), "No se pudo reenviar la invitación")}
        />
      ) : null}
      <TablePagination meta={pagination.meta} label="Paginación de docentes" onPageChange={pagination.setPage} />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar a {removingShown?.name}</DialogTitle>
            <DialogDescription>
              Queda como inactivo en esta carrera y sus paralelos quedan sin docente. Los sílabos se conservan; quien se asigne después empieza desde cero. Su cuenta y sus otros roles no cambian. Puede reactivarlo después
            </DialogDescription>
          </DialogHeader>
          {removeError ? <FeedbackAlert message={removeError} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={removeProcessing} onClick={() => void removeFromCareer()}>
              {removeProcessing ? <Spinner data-icon="inline-start" /> : <UserMinus data-icon="inline-start" aria-hidden="true" />}
              Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
