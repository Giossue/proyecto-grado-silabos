"use client"

import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { createCareerRecord, createParallels, deleteCareerRecord, deleteParallel, replaceParallelTeacher, updateParallel } from "@/api/career-academics"
import { ApiError } from "@/api/client"
import { TeacherSelect } from "@/components/domain/academic/TeacherSelect"
import { FormDialog } from "@/components/domain/FormDialog"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { TablePagination } from "@/components/domain/TablePagination"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientPagination } from "@/composables/useClientPagination"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { parallelCodeChoices } from "@/lib/parallelCodes"
import { shiftLabel } from "@/lib/parallelShifts"

type Parallel = { id: string; code: string; shift: string | null; editable?: boolean; deletable?: boolean }
type Assignment = { id: string; parallel_id: string; user_id: string; user_name: string; active: boolean; editable: boolean }
type Teacher = { id: string; name: string; email: string }

type ParallelCreationDialogProps = {
  shiftOptions: Array<{ value: string; label: string }>
  subjectId: string
  subjectLabel: string
  parallels: Parallel[]
  teacherUsers?: Teacher[]
  assignments?: Assignment[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
  onChanged?: (message: string) => void
}

const NO_TEACHER = "none"
const destructiveIcon = "text-destructive hover:bg-destructive/10 hover:text-destructive"

export function ParallelCreationDialog({ shiftOptions, subjectId, parallels, teacherUsers, assignments, open, onOpenChange, onSaved, onChanged }: ParallelCreationDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const defaultShift = shiftOptions[0]?.value ?? ""
  const [code, setCode] = useState("")
  const [shift, setShift] = useState(defaultShift)
  const [newTeacher, setNewTeacher] = useState("")
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCode, setEditCode] = useState("")
  const [editShift, setEditShift] = useState(defaultShift)
  const [editTeacher, setEditTeacher] = useState(NO_TEACHER)
  const [rowBusy, setRowBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const pagination = useClientPagination(parallels, 20)

  const reset = (): void => {
    setAdding(false)
    setCode("")
    setShift(defaultShift)
    setError(null)
    setEditingId(null)
    setRowError(null)
  }
  useOpened(isOpen, reset)

  const assignmentOf = (parallelId: string): Assignment | null => (assignments ?? []).find((item) => item.parallel_id === parallelId && item.active) ?? null
  const teacherOf = (parallelId: string): string => assignmentOf(parallelId)?.user_id ?? NO_TEACHER
  const teacherChoices = (parallelId: string): Teacher[] => {
    const current = assignmentOf(parallelId)
    const users = teacherUsers ?? []

    return current && !users.some((user) => user.id === current.user_id) ? [{ id: current.user_id, name: current.user_name, email: "" }, ...users] : users
  }
  const teacherEditable = (parallelId: string): boolean => Boolean(teacherUsers) && assignmentOf(parallelId)?.editable !== false
  const canEditRow = (parallel: Parallel): boolean => parallel.editable !== false || teacherEditable(parallel.id)
  const canDeleteParallel = (parallel: Parallel): boolean => parallel.deletable !== false && parallels.length > 1
  const showActions = editingId !== null || parallels.some((parallel) => canEditRow(parallel) || canDeleteParallel(parallel))

  const startEdit = (parallel: Parallel): void => {
    setEditingId(parallel.id)
    setEditCode(parallel.code)
    setEditShift(parallel.shift || defaultShift)
    setEditTeacher(teacherOf(parallel.id))
    setRowError(null)
  }

  const cancelEdit = (): void => {
    setEditingId(null)
    setRowError(null)
  }

  const runRowAction = async (action: () => Promise<{ message: string }>, fallback: string): Promise<void> => {
    setRowBusy(true)
    setRowError(null)
    try {
      const result = await action()
      setEditingId(null)
      onChanged?.(result.message)
    } catch (reason) {
      setRowError(reason instanceof ApiError ? reason.message : fallback)
    } finally {
      setRowBusy(false)
    }
  }

  const replaceTeacher = async (parallelId: string, value: string): Promise<{ message: string }> => {
    const current = assignmentOf(parallelId)
    if (current && value !== NO_TEACHER) return replaceParallelTeacher(parallelId, value)
    if (current) return deleteCareerRecord("asignacion_docente", current.id)
    if (value !== NO_TEACHER) return createCareerRecord("asignacion_docente", { user_id: value, parallel_id: parallelId })

    return { message: "Docente retirado del paralelo" }
  }

  const saveEdit = async (): Promise<void> => {
    const id = editingId
    const parallel = parallels.find((item) => item.id === id)
    if (!id || !parallel) return
    const editable = parallel.editable !== false
    if (editable && (!editCode || !editShift)) {
      setRowError("Elija el paralelo y la jornada")
      return
    }
    await runRowAction(async () => {
      let result: { message: string } = { message: "Sin cambios" }
      if (editable && (editCode !== parallel.code || editShift !== (parallel.shift || defaultShift))) {
        result = await updateParallel(id, { code: editCode, shift: editShift })
      }
      if (teacherEditable(id) && editTeacher !== teacherOf(id)) result = await replaceTeacher(id, editTeacher)

      return result
    }, "No se pudo actualizar el paralelo")
  }

  const removeParallel = (id: string) => runRowAction(() => deleteParallel(id), "No se pudo eliminar el paralelo")

  const startAdd = (): void => {
    setNewTeacher("")
    setCode("")
    setShift(defaultShift)
    setError(null)
    setEditingId(null)
    setAdding(true)
  }

  const cancelAdd = (): void => {
    setAdding(false)
    setError(null)
  }

  const newCodeId = `parallel-code-${subjectId}`
  const newShiftId = `parallel-shift-${subjectId}`
  const newTeacherId = `parallel-teacher-${subjectId}`

  const submit = async (): Promise<void> => {
    if (saving) return
    const missing = !code ? newCodeId : !shift ? newShiftId : !newTeacher ? newTeacherId : null
    if (missing) {
      setError("Elija el paralelo, la jornada y el docente del paralelo")
      document.getElementById(missing)?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createParallels({ subject_id: subjectId, codes: [code], shift, user_id: newTeacher })
      onSaved?.(result.message)
      reset()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo crear el paralelo")
    } finally {
      setSaving(false)
    }
  }

  const codeSelect = (value: string, onChange: (value: string) => void, label: string, choices: string[], field: { id?: string; invalid?: boolean } = {}) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={field.id} className="min-w-24" aria-label={label} aria-invalid={field.invalid || undefined}>
        <SelectValue placeholder="Elija el paralelo" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {choices.length === 0 ? <SelectLabel>No quedan letras libres</SelectLabel> : null}
          {choices.map((choice) => (
            <SelectItem key={choice} value={choice}>
              {choice}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  const shiftSelect = (value: string, onChange: (value: string) => void, label: string, field: { id?: string; invalid?: boolean } = {}) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={field.id} className="w-36" aria-label={label} aria-invalid={field.invalid || undefined}>
        <SelectValue placeholder="Elija la jornada" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {shiftOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={setOpen}
      compact
      noFooter
      showTrigger={false}
      triggerLabel="Agregar paralelo"
      title="Paralelos y docentes de la materia"
      description="Agregue paralelos y asigne el docente de cada uno"
    >
      {({ close }) => (
        <FieldGroup>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <section className="flex flex-col gap-4">
            {rowError ? (
              <Alert variant="destructive">
                <AlertDescription>{rowError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="overflow-hidden rounded-md ring-1 ring-surface-ring">
              <Table label="Paralelos de la materia">
                <TableHeader>
                  <TableRow>
                    <TableHead>Paralelo</TableHead>
                    <TableHead>Jornada</TableHead>
                    <TableHead>Docente</TableHead>
                    {showActions || adding ? <TableHead className="text-right">Acciones</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parallels.length === 0 && !adding ? (
                    <TableEmpty colSpan={showActions ? 4 : 3}>Sin paralelos registrados</TableEmpty>
                  ) : (
                    pagination.items.map((parallel) =>
                      editingId === parallel.id ? (
                        <TableRow key={parallel.id}>
                          {parallel.editable === false ? (
                            <TableCell>{parallel.code}</TableCell>
                          ) : (
                            <TableCell>
                              {codeSelect(
                                editCode,
                                setEditCode,
                                `Código del paralelo ${parallel.code}`,
                                parallelCodeChoices(
                                  parallels.filter((item) => item.id !== parallel.id),
                                  parallel.code,
                                ),
                              )}
                            </TableCell>
                          )}
                          {parallel.editable === false ? (
                            <TableCell>{shiftLabel(parallel.shift, shiftOptions)}</TableCell>
                          ) : (
                            <TableCell>{shiftSelect(editShift, setEditShift, `Jornada del paralelo ${parallel.code}`)}</TableCell>
                          )}
                          <TableCell>
                            {teacherEditable(parallel.id) ? (
                              <TeacherSelect value={editTeacher} onValueChange={setEditTeacher} teachers={teacherChoices(parallel.id)} label={`Docente del paralelo ${parallel.code}`} />
                            ) : (
                              <span>{assignmentOf(parallel.id)?.user_name ?? "Sin docente"}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <IconTooltip label="Guardar">
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={rowBusy}
                                aria-label={`Guardar paralelo ${parallel.code}`}
                                onClick={() => void saveEdit()}
                              >
                                <Check aria-hidden="true" />
                              </Button>
                            </IconTooltip>
                            <IconTooltip label="Cancelar">
                              <Button type="button" size="icon-sm" variant="ghost" disabled={rowBusy} aria-label="Cancelar edición" onClick={cancelEdit}>
                                <X aria-hidden="true" />
                              </Button>
                            </IconTooltip>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow key={parallel.id}>
                          <TableCell>{parallel.code}</TableCell>
                          <TableCell>{shiftLabel(parallel.shift, shiftOptions)}</TableCell>
                          <TableCell className={assignmentOf(parallel.id) ? "" : "text-muted-foreground"}>{assignmentOf(parallel.id)?.user_name ?? "Sin docente"}</TableCell>
                          {showActions ? (
                            <TableCell className="text-right">
                              {canEditRow(parallel) ? (
                                <IconTooltip label="Editar paralelo">
                                  <Button type="button" size="icon-sm" variant="ghost" disabled={rowBusy} aria-label={`Editar paralelo ${parallel.code}`} onClick={() => startEdit(parallel)}>
                                    <Pencil aria-hidden="true" />
                                  </Button>
                                </IconTooltip>
                              ) : null}
                              {canDeleteParallel(parallel) ? (
                                <IconTooltip label="Eliminar paralelo">
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    className={destructiveIcon}
                                    disabled={rowBusy}
                                    aria-label={`Eliminar paralelo ${parallel.code}`}
                                    onClick={() => void removeParallel(parallel.id)}
                                  >
                                    <Trash2 aria-hidden="true" />
                                  </Button>
                                </IconTooltip>
                              ) : null}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ),
                    )
                  )}
                  {adding ? (
                    <TableRow>
                      <TableCell>
                        {codeSelect(code, setCode, "Código del nuevo paralelo", parallelCodeChoices(parallels), { id: newCodeId, invalid: Boolean(error) && !code })}
                      </TableCell>
                      <TableCell>{shiftSelect(shift, setShift, "Jornada del nuevo paralelo", { id: newShiftId, invalid: Boolean(error) && !shift })}</TableCell>
                      <TableCell>
                        <TeacherSelect
                          id={newTeacherId}
                          value={newTeacher}
                          onValueChange={setNewTeacher}
                          teachers={teacherUsers ?? []}
                          label="Docente del nuevo paralelo"
                          required
                          invalid={Boolean(error) && !newTeacher}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <IconTooltip label="Guardar nuevo paralelo">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={saving}
                            aria-label="Guardar nuevo paralelo"
                            onClick={() => void submit()}
                          >
                            <Check aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="Cancelar nuevo paralelo">
                          <Button type="button" size="icon-sm" variant="ghost" disabled={saving} aria-label="Cancelar nuevo paralelo" onClick={cancelAdd}>
                            <X aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            <TablePagination meta={pagination.meta} label="Paginación de paralelos" onPageChange={pagination.setPage} />
            <Button type="button" size="sm" variant="outline" className="self-start" disabled={adding || rowBusy} onClick={startAdd}>
              <Plus aria-hidden="true" /> Agregar paralelo
            </Button>
          </section>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cerrar
            </Button>
          </DialogFooter>
        </FieldGroup>
      )}
    </FormDialog>
  )
}
