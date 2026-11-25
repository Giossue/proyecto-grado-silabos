"use client"

import { Check, Trash2 } from "lucide-react"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { removeManagedUserRole, updateManagedUser, type ManagedUser } from "@/api/admin-users"
import { ApiError } from "@/api/client"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { CoordinatorReplacementConfirm } from "@/components/domain/identity/CoordinatorReplacementConfirm"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { applyApiErrors, errorMessages, useSchemaForm } from "@/lib/forms"
import { joinName, NAME_PARTS, splitName, upperName } from "@/lib/personName"
import { roleNeedsCareer } from "@/lib/roles"
import { managedUserEditFormSchema, type ManagedUserEditFormValues } from "@silabos/shared/schemas/people"

type ManagedUserEditFormProps = {
  user: ManagedUser
  roles: { codigo: string; nombre: string }[]
  careers: { id: string; nombre: string }[]
  onSaved: (message: string) => void
  onCancel: () => void
}

type Role = ManagedUser["roles"][number]

const formFor = (user: ManagedUser): ManagedUserEditFormValues => ({ ...splitName(user.nombre), correo_electronico: user.correo_electronico, role_code: "", career_id: "" })

export function ManagedUserEditForm({ user, roles, careers, onSaved, onCancel }: ManagedUserEditFormProps) {
  const [processing, setProcessing] = useState(false)
  const savedName = joinName(splitName(user.nombre))
  const form = useSchemaForm(
    (values: ManagedUserEditFormValues) => managedUserEditFormSchema({ checkNames: joinName(values) !== savedName, roleCode: values.role_code }),
    { defaultValues: formFor(user) },
  )
  const { errors } = form.formState
  const [formUser, setFormUser] = useState(user.id)
  if (formUser !== user.id) {
    setFormUser(user.id)
    form.reset(formFor(user))
  }
  const [removing, setRemoving] = useState<Role | null>(null)
  const shownRemoving = useShownWhileClosing(removing)
  const [removeProcessing, setRemoveProcessing] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [replacement, setReplacement] = useState<string | null>(null)

  const assignableRoles = user.roles.some((role) => role.code === "administrador")
    ? []
    : roles.filter(
        (role) =>
          role.codigo === "docente" ||
          role.codigo === "coordinador" ||
          (role.codigo === "bibliotecario" && !user.roles.some((current) => current.code === "bibliotecario")),
      )
  const values = form.watch()
  const unchanged = joinName(values) === savedName && values.correo_electronico === user.correo_electronico && !values.role_code
  const nameMessages = [...(errorMessages(errors.nombres) ?? []), ...(errorMessages(errors.apellidos) ?? []), ...(errorMessages((errors as Record<string, never>).nombre) ?? [])]

  const removeRole = async (): Promise<void> => {
    if (!removing) return
    setRemoveProcessing(true)
    setRemoveError(null)
    try {
      const result = await removeManagedUserRole(user.id, removing.id)
      setRemoving(null)
      onSaved(result.message)
    } catch (reason) {
      setRemoveError(reason instanceof ApiError ? (Object.values(reason.errors).flat()[0] ?? reason.message) : "No se pudo quitar el rol")
    } finally {
      setRemoveProcessing(false)
    }
  }

  const send = async (current: ManagedUserEditFormValues, replaceCoordinator = false): Promise<void> => {
    setProcessing(true)
    const payload: { nombre: string; correo_electronico: string; role_code?: string; career_id?: string | null; replace_coordinator?: boolean } = {
      nombre: joinName(current),
      correo_electronico: current.correo_electronico,
    }
    if (current.role_code) {
      payload.role_code = current.role_code
      payload.career_id = roleNeedsCareer(current.role_code) ? (current.career_id ?? "") : null
    }
    if (replaceCoordinator) payload.replace_coordinator = true
    try {
      const result = await updateManagedUser(user.id, payload)
      setReplacement(null)
      onSaved(result.message)
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
      <form onSubmit={form.handleSubmit((current) => send(current))}>
        <FieldGroup>
          <div className="grid grid-cols-2 items-start gap-4">
            {NAME_PARTS.map((part) => (
              <Controller
                key={part.key}
                name={part.key}
                control={form.control}
                render={({ field }) => (
                  <Field data-invalid={nameMessages.length > 0}>
                    <FieldLabel htmlFor={`managed-edit-${part.key}-${user.id}`} required>
                      {part.label}
                    </FieldLabel>
                    <Input
                      {...field}
                      id={`managed-edit-${part.key}-${user.id}`}
                      lang="es"
                      autoCapitalize="characters"
                      placeholder={part.placeholder}
                      aria-required="true"
                      onChange={(event) => field.onChange(upperName(event.target.value))}
                    />
                  </Field>
                )}
              />
            ))}
          </div>
          <FieldError errors={nameMessages.length > 0 ? nameMessages : undefined} />
          <Controller
            name="correo_electronico"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`managed-edit-email-${user.id}`} required>
                  Correo institucional
                </FieldLabel>
                <Input {...field} id={`managed-edit-email-${user.id}`} type="email" aria-required="true" disabled={!user.pending_activation} />
                <FieldError errors={errorMessages(fieldState.error)} />
              </Field>
            )}
          />
          {user.roles.length > 1 ? (
            <Field>
              <FieldLabel>Roles vigentes</FieldLabel>
              <ul className="flex flex-col gap-2">
                {user.roles.map((role) => (
                  <li key={role.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {role.name}
                      {role.career_name ? <span className="text-muted-foreground"> · {role.career_name}</span> : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar el rol ${role.name}${role.career_name ? ` de ${role.career_name}` : ""}`}
                      onClick={() => {
                        setRemoving(role)
                        setRemoveError(null)
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}
          {assignableRoles.length > 0 ? (
            <Field data-invalid={Boolean(errors.role_code)}>
              <FieldLabel htmlFor={`managed-edit-role-${user.id}`}>Agregar otro rol (opcional)</FieldLabel>
              <Select value={values.role_code} onValueChange={(value) => form.setValue("role_code", value)}>
                <SelectTrigger id={`managed-edit-role-${user.id}`}>
                  <SelectValue placeholder="No agregar otro rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role.codigo} value={role.codigo}>
                        {role.nombre}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={errorMessages(errors.role_code)} />
            </Field>
          ) : null}
          {roleNeedsCareer(values.role_code) ? (
            <Field data-invalid={Boolean(errors.career_id)}>
              <FieldLabel htmlFor={`managed-edit-career-${user.id}`} required>
                Carrera
              </FieldLabel>
              <Select value={values.career_id ?? ""} onValueChange={(value) => form.setValue("career_id", value)} required>
                <SelectTrigger id={`managed-edit-career-${user.id}`}>
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
              <FieldError errors={errorMessages(errors.career_id)} />
            </Field>
          ) : null}
          <FormDialogActions close={onCancel} processing={processing} disabled={unchanged} icon={Check} label="Guardar cambios" />
        </FieldGroup>
      </form>
      <Dialog
        open={removing !== null}
        onOpenChange={(value) => {
          if (!value) setRemoving(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitar rol</DialogTitle>
            <DialogDescription>
              {user.nombre} deja de ser {shownRemoving?.name}
              {shownRemoving?.career_name ? ` de ${shownRemoving.career_name}` : ""}. Su cuenta y sus otros roles no cambian y el rol queda en el historial. Si es docente, sus
              paralelos quedan sin docente
            </DialogDescription>
          </DialogHeader>
          {removeError ? <FeedbackAlert message={removeError} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={removeProcessing} onClick={() => void removeRole()}>
              {removeProcessing ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Quitar rol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CoordinatorReplacementConfirm message={replacement} processing={processing} onConfirm={() => void send(form.getValues(), true)} onCancel={() => setReplacement(null)} />
    </>
  )
}
