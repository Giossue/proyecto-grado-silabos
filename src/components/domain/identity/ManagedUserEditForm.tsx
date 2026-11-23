"use client"

import { Check, Trash2 } from "lucide-react"
import { useState, type FormEvent } from "react"
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
import { joinName, NAME_PARTS, nameErrors, splitName, upperName, type NamePartKey } from "@/lib/personName"
import { roleNeedsCareer } from "@/lib/roles"

type ManagedUserEditFormProps = {
  user: ManagedUser
  roles: { codigo: string; nombre: string }[]
  careers: { id: string; nombre: string }[]
  onSaved: (message: string) => void
  onCancel: () => void
}

type Role = ManagedUser["roles"][number]

const formFor = (user: ManagedUser) => ({ ...splitName(user.nombre), correo_electronico: user.correo_electronico, role_code: "", career_id: "" })

export function ManagedUserEditForm({ user, roles, careers, onSaved, onCancel }: ManagedUserEditFormProps) {
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [form, setForm] = useState(() => formFor(user))
  const [formUser, setFormUser] = useState(user.id)
  if (formUser !== user.id) {
    setFormUser(user.id)
    setForm(formFor(user))
    setErrors({})
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
  const update = (key: keyof ReturnType<typeof formFor>, value: string): void => setForm((current) => ({ ...current, [key]: value }))
  const setPart = (key: NamePartKey, value: string): void => update(key, upperName(value))
  const fullName = joinName(form)
  const savedName = joinName(splitName(user.nombre))
  const unchanged = fullName === savedName && form.correo_electronico === user.correo_electronico && !form.role_code

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

  const submit = async (replaceCoordinator = false): Promise<void> => {
    const invalid = fullName === savedName ? {} : nameErrors(form)
    if (Object.keys(invalid).length > 0) {
      setErrors({ nombre: Object.values(invalid).flat() })
      return
    }
    setProcessing(true)
    setErrors({})
    const payload: { nombre: string; correo_electronico: string; role_code?: string; career_id?: string | null; replace_coordinator?: boolean } = {
      nombre: fullName,
      correo_electronico: form.correo_electronico,
    }
    if (form.role_code) {
      payload.role_code = form.role_code
      payload.career_id = roleNeedsCareer(form.role_code) ? form.career_id : null
    }
    if (replaceCoordinator) payload.replace_coordinator = true
    try {
      const result = await updateManagedUser(user.id, payload)
      setReplacement(null)
      onSaved(result.message)
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
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="grid grid-cols-2 items-start gap-4">
            {NAME_PARTS.map((part) => (
              <Field key={part.key} data-invalid={Boolean(errors.nombre)}>
                <FieldLabel htmlFor={`managed-edit-${part.key}-${user.id}`} required>
                  {part.label}
                </FieldLabel>
                <Input
                  id={`managed-edit-${part.key}-${user.id}`}
                  value={form[part.key]}
                  lang="es"
                  autoCapitalize="characters"
                  placeholder={part.placeholder}
                  aria-required="true"
                  onChange={(event) => setPart(part.key, event.target.value)}
                />
              </Field>
            ))}
          </div>
          <FieldError errors={errors.nombre} />
          <Field data-invalid={Boolean(errors.correo_electronico)}>
            <FieldLabel htmlFor={`managed-edit-email-${user.id}`} required>
              Correo institucional
            </FieldLabel>
            <Input
              id={`managed-edit-email-${user.id}`}
              value={form.correo_electronico}
              type="email"
              aria-required="true"
              disabled={!user.pending_activation}
              onChange={(event) => update("correo_electronico", event.target.value)}
            />
            <FieldError errors={errors.correo_electronico} />
          </Field>
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
              <Select value={form.role_code} onValueChange={(value) => update("role_code", value)}>
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
              <FieldError errors={errors.role_code} />
            </Field>
          ) : null}
          {roleNeedsCareer(form.role_code) ? (
            <Field data-invalid={Boolean(errors.career_id)}>
              <FieldLabel htmlFor={`managed-edit-career-${user.id}`} required>
                Carrera
              </FieldLabel>
              <Select value={form.career_id} onValueChange={(value) => update("career_id", value)} required>
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
              <FieldError errors={errors.career_id} />
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
      <CoordinatorReplacementConfirm message={replacement} processing={processing} onConfirm={() => void submit(true)} onCancel={() => setReplacement(null)} />
    </>
  )
}
