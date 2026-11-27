"use client"

import { ChevronDown, Plus, X } from "lucide-react"
import { useState } from "react"
import {
  createCareerRecord,
  createParallels,
  deleteCareerRecord,
  replaceParallelTeacher,
  updateParallel,
  type PurgeHandling,
  type ScheduledSubjects,
  type TeacherAssignments,
} from "@/api/career-academics"
import { ApiError } from "@/api/client"
import { TeacherSelect } from "@/components/domain/academic/TeacherSelect"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { afterDialogExit } from "@/lib/dialogExit"
import { SERVER_ERROR, serverMessage, useSchemaForm } from "@/lib/forms"
import { nextParallelCode } from "@/lib/parallelCodes"
import { announcePurge } from "@/lib/purgeNotice"
import { NEW_PARALLELS_INCOMPLETE, newParallelsSchema } from "@silabos/shared/schemas/academic"
import { deadlineState } from "@/state/deadline"

type Row = ScheduledSubjects["scheduledSubjects"][number]
type Parallel = Row["parallels"][number]

type ParallelBulkActionsProps = {
  items: Row[]
  parallelIds: string[]
  shiftOptions: ScheduledSubjects["options"]["shiftOptions"]
  teacherUsers: TeacherAssignments["options"]["teacherUsers"]
  assignments: TeacherAssignments["teacherAssignments"]
  onChanged: (message: string) => void
  onFailed: (message: string) => void
  onClear: () => void
  onBusyChange?: (busy: boolean) => void
}

const NO_TEACHER = "none"
const FINALIZED_MESSAGE =
  "El proceso de sílabos de su carrera ya finalizó. Estos cambios no afectan sus sílabos: conservan los datos que tenían. Se aplicarán en el próximo proceso de sílabos, o en este si lo reabre con una prórroga"

const shiftMessage = (count: number): string =>
  count === 1
    ? "El sílabo de 1 paralelo seleccionado ya está en revisión o aprobado. Cambiar la jornada lo elimina con todo su contenido (revisiones, aprobación, firmas y análisis de IA) y el docente lo empieza de nuevo"
    : `Los sílabos de ${count} paralelos seleccionados ya están en revisión o aprobados. Cambiar la jornada los elimina con todo su contenido (revisiones, aprobación, firmas y análisis de IA) y los docentes los empiezan de nuevo`

const teacherMessage = (count: number): string =>
  count === 1
    ? "El sílabo de 1 paralelo seleccionado ya tiene trabajo del docente. Cambiar el docente lo elimina con todo su contenido (borrador, revisiones, aprobación, firmas y análisis de IA) y el nuevo docente lo empieza de cero"
    : `Los sílabos de ${count} paralelos seleccionados ya tienen trabajo de sus docentes. Cambiar el docente los elimina con todo su contenido (borrador, revisiones, aprobación, firmas y análisis de IA) y el nuevo docente los empieza de cero`

const addSchema = newParallelsSchema()

const finalized = (): boolean => deadlineState.deadline.value?.state === "closed"

const purgeHandling = (affected = 0, message: (count: number) => string = shiftMessage): PurgeHandling => {
  if (finalized()) {
    announcePurge(FINALIZED_MESSAGE)
    return "confirmed"
  }
  if (affected === 0) return "unconfirmed"
  announcePurge(message(affected))
  return "confirmed"
}

export function ParallelBulkActions({ items, parallelIds, shiftOptions, teacherUsers, assignments, onChanged, onFailed, onClear, onBusyChange }: ParallelBulkActionsProps) {
  const [busy, setBusyState] = useState(false)
  const setBusy = (value: boolean): void => {
    setBusyState(value)
    onBusyChange?.(value)
  }
  const [addOpen, setAddOpen] = useState(false)
  const addForm = useSchemaForm(addSchema, { defaultValues: { shift: "", user_id: "" } })
  const addShift = String(addForm.watch("shift") ?? "")
  const addTeacher = String(addForm.watch("user_id") ?? "")
  const addError = serverMessage(addForm.formState.errors) ?? null
  const setAddShift = (value: string): void => addForm.setValue("shift", value)
  const setAddTeacher = (value: string): void => addForm.setValue("user_id", value)

  const subjects = `${items.length} ${items.length === 1 ? "materia" : "materias"}`
  const label =
    parallelIds.length === 0
      ? `${subjects} seleccionada${items.length === 1 ? "" : "s"}`
      : `${subjects} y ${parallelIds.length} ${parallelIds.length === 1 ? "paralelo seleccionado" : "paralelos seleccionados"}`
  const chosen = (item: Row): Parallel[] => item.parallels.filter((parallel) => parallelIds.includes(parallel.id))
  const assignmentOf = (parallelId: string) => assignments.find((item) => item.parallel_id === parallelId && item.active) ?? null

  const run = async (steps: Array<() => Promise<unknown>>, done: string, nothing: string, closing?: Promise<void>): Promise<void> => {
    if (steps.length === 0) {
      onChanged(nothing)
      return
    }
    setBusy(true)
    let failures = 0
    let firstError = ""
    for (const step of steps) {
      try {
        await step()
      } catch (reason) {
        failures += 1
        firstError ||= reason instanceof ApiError ? reason.message : "No se pudo completar el cambio"
      }
    }
    setBusy(false)
    if (failures === 0) {
      onChanged(done)
    } else {
      onFailed(`${steps.length - failures} de ${steps.length} cambios aplicados. ${firstError}`)
      onChanged("Se aplicaron los cambios posibles")
    }
    await closing
    onClear()
  }

  const openAdd = (): void => {
    addForm.reset({ shift: shiftOptions[0]?.value ?? "", user_id: "" })
    setAddOpen(true)
  }

  const addParallel = addForm.handleSubmit(
    async ({ shift, user_id: userId }) => {
      if (busy) return
      setAddOpen(false)
      const purge = purgeHandling()
      await run(
        items.map((item) => () => createParallels({ subject_id: item.subject_id, codes: [nextParallelCode(item.parallels)], shift: String(shift), user_id: String(userId) }, purge)),
        `Paralelo agregado a ${items.length} ${items.length === 1 ? "materia" : "materias"}`,
        "No hay materias seleccionadas",
        afterDialogExit(),
      )
    },
    () => addForm.setError(SERVER_ERROR, { type: "client", message: NEW_PARALLELS_INCOMPLETE }),
  )

  const setShift = async (shift: string): Promise<void> => {
    const targets = items.flatMap((item) => chosen(item).filter((parallel) => parallel.editable !== false && parallel.shift !== shift))
    if (targets.length === 0) {
      onChanged("Los paralelos seleccionados ya tenían esa jornada")
      return
    }
    const sent = targets.filter((parallel) => parallel.sent_syllabus)
    const purge = purgeHandling(sent.length)
    const closed = finalized()
    await run(
      targets.map(
        (parallel) => () => updateParallel(parallel.id, { code: parallel.code, shift }, purge === "confirmed" && (closed || parallel.sent_syllabus) ? "confirmed" : "unconfirmed"),
      ),
      "Jornada actualizada en los paralelos seleccionados",
      "Los paralelos seleccionados ya tenían esa jornada",
    )
  }

  const setTeacher = async (userId: string): Promise<void> => {
    const targets = items.flatMap((item) =>
      chosen(item).filter((parallel) => assignmentOf(parallel.id)?.editable !== false && (assignmentOf(parallel.id)?.user_id ?? NO_TEACHER) !== userId),
    )
    if (targets.length === 0) {
      onChanged("Los paralelos seleccionados ya tenían ese docente")
      return
    }
    const started = userId === NO_TEACHER ? [] : targets.filter((parallel) => parallel.started_syllabus)
    const purge = purgeHandling(started.length, teacherMessage)
    const closed = finalized()
    const handling = (parallel: Parallel): PurgeHandling => (purge === "confirmed" && (closed || parallel.started_syllabus) ? "confirmed" : "unconfirmed")
    await run(
      targets.map((parallel) => async () => {
        const current = assignmentOf(parallel.id)
        if (current && userId !== NO_TEACHER) await replaceParallelTeacher(parallel.id, userId, handling(parallel))
        else if (current) await deleteCareerRecord("asignacion_docente", current.id)
        else await createCareerRecord("asignacion_docente", { user_id: userId, parallel_id: parallel.id }, handling(parallel))
      }),
      userId === NO_TEACHER ? "Docente retirado de los paralelos seleccionados" : "Docente asignado a los paralelos seleccionados",
      "Los paralelos seleccionados ya tenían ese docente",
    )
  }

  return (
    <Card className="flex-row flex-wrap items-center gap-2 px-3 py-2" role="region" aria-label="Acciones masivas de materias">
      <span className="text-sm font-medium">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Acciones masivas
            <ChevronDown data-icon="inline-end" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={openAdd}>Agregar un paralelo</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={parallelIds.length === 0}>Asignar jornada</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {shiftOptions.map((option) => (
                  <DropdownMenuItem key={option.value} onSelect={() => void setShift(option.value)}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={parallelIds.length === 0}>Asignar docente</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                <DropdownMenuItem onSelect={() => void setTeacher(NO_TEACHER)}>Sin docente</DropdownMenuItem>
                {teacherUsers.map((teacher) => (
                  <DropdownMenuItem key={teacher.id} onSelect={() => void setTeacher(teacher.id)}>
                    {teacher.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClear}>
        <X data-icon="inline-start" aria-hidden="true" />
        Quitar selección
      </Button>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar un paralelo a las materias seleccionadas</DialogTitle>
            <DialogDescription>Se crea el mismo paralelo en cada materia</DialogDescription>
          </DialogHeader>
          <form className="contents" onSubmit={(event) => void addParallel(event)} noValidate>
            {addError ? (
              <Alert variant="destructive">
                <AlertDescription>{addError}</AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup>
              <Field data-invalid={Boolean(addError) && !addShift}>
                <FieldLabel htmlFor="bulk-parallel-shift" required>
                  Jornada
                </FieldLabel>
                <Select value={addShift} onValueChange={setAddShift} required>
                  <SelectTrigger id="bulk-parallel-shift" aria-invalid={Boolean(addError) && !addShift}>
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
              </Field>
              <Field data-invalid={Boolean(addError) && !addTeacher}>
                <FieldLabel htmlFor="bulk-parallel-teacher" required>
                  Docente
                </FieldLabel>
                <TeacherSelect
                  id="bulk-parallel-teacher"
                  value={addTeacher}
                  onValueChange={setAddTeacher}
                  teachers={teacherUsers}
                  label="Docente de los nuevos paralelos"
                  required
                  invalid={Boolean(addError) && !addTeacher}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy || !addShift || !addTeacher}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                Agregar paralelos
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
