"use client"

import { UserPlus } from "lucide-react"
import { useState } from "react"
import { Controller } from "react-hook-form"
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
import { applyApiErrors, errorMessages, useSchemaForm } from "@/lib/forms"
import { cleanParts, NAME_PARTS, upperName } from "@/lib/personName"
import { roleNeedsCareer } from "@/lib/roles"
import { managedUserFormSchema, type ManagedUserFormValues } from "@/schemas/people"

type ManagedUserDialogProps = {
  roles?: { codigo: string; nombre: string }[]
  careers?: { id: string; nombre: string }[]
  teacherCareer?: { id: string; name: string } | null
  showTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

const emptyForm = (): ManagedUserFormValues => ({ nombres: "", apellidos: "", correo_electronico: "", role_code: "coordinador", career_id: "" })

export function ManagedUserDialog({ roles = [], careers = [], teacherCareer = null, showTrigger = true, open, onOpenChange, onSaved }: ManagedUserDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const form = useSchemaForm((values: ManagedUserFormValues) => managedUserFormSchema({ teacher: teacherCareer !== null, roleCode: values.role_code }), { defaultValues: emptyForm() })
  const [replacement, setReplacement] = useState<string | null>(null)
  const roleCode = form.watch("role_code")
  useOpened(isOpen, () => form.reset(emptyForm()))

  const send = async (values: ManagedUserFormValues, replaceCoordinator = false): Promise<void> => {
    setProcessing(true)
    const names = cleanParts(values)
    try {
      const result = teacherCareer
        ? await createCareerTeacher({ ...names, correo_electronico: values.correo_electronico })
        : await createManagedUser({
            ...names,
            correo_electronico: values.correo_electronico,
            role_code: values.role_code ?? "",
            career_id: roleNeedsCareer(values.role_code ?? "") ? (values.career_id ?? "") : null,
            ...(replaceCoordinator ? { replace_coordinator: true } : {}),
          })
      setReplacement(null)
      setOpen(false)
      onSaved?.(result.message)
    } catch (reason) {
      const message = reason instanceof ApiError ? (reason.errors.replace_coordinator?.[0] ?? null) : null
      setReplacement(message)
      if (message === null && reason instanceof ApiError) applyApiErrors(form.setError, reason, { fallback: reason.message })
    } finally {
      setProcessing(false)
    }
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
          <form onSubmit={form.handleSubmit((values) => send(values))}>
            <FieldGroup>
              <div className="grid grid-cols-2 items-start gap-4">
                {NAME_PARTS.map((part) => (
                  <Controller
                    key={part.key}
                    name={part.key}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`managed-user-${part.key}`} required>
                          {part.label}
                        </FieldLabel>
                        <Input
                          {...field}
                          id={`managed-user-${part.key}`}
                          lang="es"
                          autoCapitalize="characters"
                          placeholder={part.placeholder}
                          aria-required="true"
                          onChange={(event) => field.onChange(upperName(event.target.value))}
                        />
                        <FieldError errors={errorMessages(fieldState.error)} />
                      </Field>
                    )}
                  />
                ))}
              </div>
              <Controller
                name="correo_electronico"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="managed-user-email" required>
                      Correo institucional
                    </FieldLabel>
                    <Input {...field} id="managed-user-email" type="email" placeholder="Ej. ana.perez@ueb.edu.ec" aria-required="true" />
                    <FieldError errors={errorMessages(fieldState.error)} />
                  </Field>
                )}
              />
              {!teacherCareer ? (
                <Controller
                  name="role_code"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="managed-user-role" required>
                        Rol inicial
                      </FieldLabel>
                      <Select value={field.value ?? ""} onValueChange={field.onChange} required>
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
                      <FieldError errors={errorMessages(fieldState.error)} />
                    </Field>
                  )}
                />
              ) : null}
              {!teacherCareer && roleNeedsCareer(roleCode ?? "") ? (
                <Controller
                  name="career_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="managed-user-career" required>
                        Carrera
                      </FieldLabel>
                      <Select value={field.value ?? ""} onValueChange={field.onChange} required>
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
                      <FieldError errors={errorMessages(fieldState.error)} />
                    </Field>
                  )}
                />
              ) : null}
              <FormDialogActions close={close} processing={processing} icon={UserPlus} label={teacherCareer ? "Crear docente" : "Crear cuenta"} />
            </FieldGroup>
          </form>
        )}
      </FormModal>
      <CoordinatorReplacementConfirm message={replacement} processing={processing} onConfirm={() => void send(form.getValues(), true)} onCancel={() => setReplacement(null)} />
    </>
  )
}
