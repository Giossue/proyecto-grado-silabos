"use client"

import { UserPlus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { createManagedUser } from "@/api/admin-users"
import { createCareerTeacher } from "@/api/career-academics"
import { ApiError } from "@/api/client"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { CoordinatorReplacementConfirm } from "@/components/domain/identity/CoordinatorReplacementConfirm"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { cleanParts, NAME_PARTS, nameErrors, upperName, type NamePartKey } from "@/lib/personName"
import { roleNeedsCareer } from "@/lib/roles"

type ManagedUserDialogProps = {
  roles?: { codigo: string; nombre: string }[]
  careers?: { id: string; nombre: string }[]
  teacherCareer?: { id: string; name: string } | null
  showTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

const emptyForm = () => ({ nombres: "", apellidos: "", correo_electronico: "", role_code: "coordinador", career_id: "" })

export function ManagedUserDialog({ roles = [], careers = [], teacherCareer = null, showTrigger = true, open, onOpenChange, onSaved }: ManagedUserDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [form, setForm] = useState(emptyForm)
  const [replacement, setReplacement] = useState<string | null>(null)
  useOpened(isOpen, () => {
    setForm(emptyForm())
    setErrors({})
  })

  const update = (key: keyof ReturnType<typeof emptyForm>, value: string): void => setForm((current) => ({ ...current, [key]: value }))
  const setPart = (key: NamePartKey, value: string): void => update(key, upperName(value))

  const submit = async (replaceCoordinator = false): Promise<void> => {
    const invalid = nameErrors(form)
    if (Object.keys(invalid).length > 0) {
      setErrors(invalid as Record<string, string[]>)
      return
    }
    setProcessing(true)
    setErrors({})
    const names = cleanParts(form)
    try {
      const result = teacherCareer
        ? await createCareerTeacher({ ...names, correo_electronico: form.correo_electronico })
        : await createManagedUser({
            ...names,
            correo_electronico: form.correo_electronico,
            role_code: form.role_code,
            career_id: roleNeedsCareer(form.role_code) ? form.career_id : null,
            ...(replaceCoordinator ? { replace_coordinator: true } : {}),
          })
      setReplacement(null)
      setOpen(false)
      onSaved?.(result.message)
    } catch (reason) {
      const failed = reason instanceof ApiError ? reason.errors : {}
      const message = failed.replace_coordinator?.[0] ?? null
      setReplacement(message)
      if (message === null) setErrors(failed)
    } finally {
      setProcessing(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void submit()
  }

  return (
    <>
      <FormModal
        open={isOpen}
        onOpenChange={setOpen}
        triggerLabel={teacherCareer ? "Crear docente" : "Crear cuenta"}
        title={teacherCareer ? "Crear docente" : "Crear cuenta institucional"}
        description="Le llegará un correo para activar su cuenta"
        showTrigger={showTrigger}
      >
        {({ close }) => (
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <div className="grid grid-cols-2 items-start gap-4">
                {NAME_PARTS.map((part) => (
                  <Field key={part.key} data-invalid={Boolean(errors[part.key])}>
                    <FieldLabel htmlFor={`managed-user-${part.key}`} required>
                      {part.label}
                    </FieldLabel>
                    <Input
                      id={`managed-user-${part.key}`}
                      value={form[part.key]}
                      lang="es"
                      autoCapitalize="characters"
                      placeholder={part.placeholder}
                      aria-required="true"
                      onChange={(event) => setPart(part.key, event.target.value)}
                    />
                    <FieldError errors={errors[part.key]} />
                  </Field>
                ))}
              </div>
              <Field data-invalid={Boolean(errors.correo_electronico)}>
                <FieldLabel htmlFor="managed-user-email" required>
                  Correo institucional
                </FieldLabel>
                <Input
                  id="managed-user-email"
                  value={form.correo_electronico}
                  type="email"
                  placeholder="Ej. ana.perez@ueb.edu.ec"
                  aria-required="true"
                  onChange={(event) => update("correo_electronico", event.target.value)}
                />
                <FieldError errors={errors.correo_electronico} />
              </Field>
              {!teacherCareer ? (
                <Field data-invalid={Boolean(errors.role_code)}>
                  <FieldLabel htmlFor="managed-user-role" required>
                    Rol inicial
                  </FieldLabel>
                  <Select value={form.role_code} onValueChange={(value) => update("role_code", value)} required>
                    <SelectTrigger id="managed-user-role">
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {roles.map((role) => (
                          <SelectItem key={role.codigo} value={role.codigo}>
                            {role.nombre}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError errors={errors.role_code} />
                </Field>
              ) : null}
              {!teacherCareer && roleNeedsCareer(form.role_code) ? (
                <Field data-invalid={Boolean(errors.career_id)}>
                  <FieldLabel htmlFor="managed-user-career" required>
                    Carrera
                  </FieldLabel>
                  <Select value={form.career_id} onValueChange={(value) => update("career_id", value)} required>
                    <SelectTrigger id="managed-user-career">
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {careers.map((career) => (
                          <SelectItem key={career.id} value={career.id}>
                            {career.nombre}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError errors={errors.career_id} />
                </Field>
              ) : null}
              <FormDialogActions close={close} processing={processing} icon={UserPlus} label={teacherCareer ? "Crear docente" : "Crear cuenta"} />
            </FieldGroup>
          </form>
        )}
      </FormModal>
      <CoordinatorReplacementConfirm message={replacement} processing={processing} onConfirm={() => void submit(true)} onCancel={() => setReplacement(null)} />
    </>
  )
}
