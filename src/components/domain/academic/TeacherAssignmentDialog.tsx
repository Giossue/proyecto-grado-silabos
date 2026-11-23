"use client"

import { UserPlus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { createCareerRecord, type TeacherAssignments } from "@/api/career-academics"
import { ApiError } from "@/api/client"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"

type TeacherAssignmentDialogProps = {
  options: TeacherAssignments["options"]
  showTrigger?: boolean
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

export function TeacherAssignmentDialog({ options, showTrigger = true, disabled = false, open, onOpenChange, onSaved }: TeacherAssignmentDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [userId, setUserId] = useState("")
  const [parallelId, setParallelId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useOpened(isOpen, () => {
    setUserId("")
    setParallelId("")
    setError(null)
  })

  const submit = async (event: FormEvent<HTMLFormElement>, close: () => void): Promise<void> => {
    event.preventDefault()
    if (disabled || !userId || !parallelId) return
    setSaving(true)
    setError(null)
    try {
      const result = await createCareerRecord("asignacion_docente", { user_id: userId, parallel_id: parallelId })
      onSaved?.(result.message)
      close()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo asignar el docente")
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormModal
      open={isOpen}
      onOpenChange={setOpen}
      disabled={disabled}
      triggerLabel="Asignar docente"
      title="Asignar docente"
      description="Elija quién elabora el sílabo del paralelo"
      showTrigger={showTrigger}
    >
      {({ close }) => (
        <form className="contents" onSubmit={(event) => void submit(event, close)}>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="teacher-user" required>
                Docente
              </FieldLabel>
              <Select value={userId} onValueChange={setUserId} required>
                <SelectTrigger id="teacher-user">
                  <SelectValue placeholder="Seleccione un docente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options.teacherUsers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.name} · {teacher.email}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="teacher-parallel" required>
                Materia y paralelo
              </FieldLabel>
              <Select value={parallelId} onValueChange={setParallelId} required>
                <SelectTrigger id="teacher-parallel">
                  <SelectValue placeholder="Seleccione un paralelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options.parallels.map((parallel) => (
                      <SelectItem key={parallel.id} value={parallel.id}>
                        {parallel.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>Si el paralelo ya tenía sílabo, se borra y el docente empieza de cero</FieldDescription>
            </Field>
            <FormDialogActions close={close} processing={saving} disabled={!userId || !parallelId} icon={UserPlus} label="Asignar docencia" />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
