"use client"

import { Trash2 } from "lucide-react"
import { useRef, useState, type KeyboardEvent } from "react"
import { removeCareerTeacher, resendCareerTeacherInvitation, type TeacherAssignments } from "@/api/career-academics"
import { ApiError } from "@/api/client"
import { CareerTeacherEditDialog } from "@/components/domain/academic/CareerTeacherEditDialog"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { afterDialogExit, useShownWhileClosing } from "@/lib/dialogExit"
import { activateRow } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"

type TeacherRow = TeacherAssignments["careerTeachers"][number]

const searchable = (item: TeacherRow) => [item.name, item.email]
const filters: Record<string, ClientFilterDefinition<TeacherRow>> = {
  estado: { matches: (item, value) => (value === "pending" ? item.pending_activation : !item.pending_activation) },
}
const statusOf = (item: TeacherRow): string => (item.pending_activation ? (item.invitation_expired ? "Invitación vencida" : "Pendiente") : "Activa")

export function TeacherAssignmentsPanel({ data, onChanged }: { data: TeacherAssignments; onChanged: (message: string) => void }) {
  const filter = useClientFilter(data.careerTeachers, searchable, filters)
  const pagination = useClientPagination(filter.items, 20, filter.criteria)
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
  const editFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, item: TeacherRow): void => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    openEditor(item)
  }

  const askRemoval = (item: TeacherRow): void => {
    changeSheet(false)
    setRemoving(item)
    setRemoveError(null)
  }

  const resendInvitation = async (item: TeacherRow): Promise<void> => {
    changeSheet(false)
    try {
      const result = await resendCareerTeacherInvitation(item.id)
      await afterDialogExit()
      onChanged(result.message)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo reenviar la invitación")
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
      setRemoveError(reason instanceof ApiError ? reason.message : "No se pudo quitar al docente de la carrera")
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
                  <SelectItem value="active">Activas</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        }
      />
      <Table label="Docentes de la carrera">
        <TableHeader>
          <TableRow>
            <TableHead>Docente</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead className="text-center">Estado</TableHead>
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
                tabIndex={0}
                aria-label={`Editar ${item.name}`}
                onClick={(event) => activateRow(event.nativeEvent, () => openEditor(item))}
                onKeyDown={(event) => editFromKeyboard(event, item)}
              >
                <TableCell>
                  {item.name}
                  <TableCardLine>
                    {item.email}
                    <StatusBadge label={statusOf(item)} tone={item.pending_activation ? "warning" : "success"} />
                  </TableCardLine>
                </TableCell>
                <TableCell data-card-hide="true">{item.email}</TableCell>
                <TableCell className="text-center" data-card-hide="true">
                  <StatusBadge label={statusOf(item)} tone={item.pending_activation ? "warning" : "success"} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {editing ? (
        <CareerTeacherEditDialog
          key={editing.id}
          teacher={editing}
          open={sheetOpen}
          onOpenChange={changeSheet}
          removeDisabled={Boolean(data.career.lock_reason)}
          onRemove={() => askRemoval(editing)}
          onResend={() => void resendInvitation(editing)}
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
            <DialogTitle>Quitar a {removingShown?.name} de la carrera</DialogTitle>
            <DialogDescription>
              Deja de ser docente de esta carrera y sus paralelos quedan sin docente. Los sílabos se conservan; quien se asigne después empieza desde cero. Su cuenta y sus otros roles no cambian
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
              {removeProcessing ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Quitar de la carrera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
