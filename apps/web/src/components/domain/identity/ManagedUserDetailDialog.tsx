"use client"

import { Ban, CircleCheck, MailCheck, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import type { ManagedUser } from "@/api/admin-users"
import { DialogActions, type DialogAction } from "@/components/domain/DialogActions"
import { FormDialogFooter } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { ManagedUserEditForm } from "@/components/domain/identity/ManagedUserEditForm"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { managedUserStatus } from "@silabos/shared/lib/managedUserStatus"

export type ManagedUserRoleAssignment = {
  id: string
  role_name: string
  career_name: string | null
  active: boolean
}

export type ManagedUserRow = {
  id: string
  nombre: string
  correo_electronico: string
  active: boolean
  pending_activation: boolean
  invitation_expired: boolean
  roles: { name: string; career_name: string | null }[]
  careers: (string | null)[]
  assignments: ManagedUserRoleAssignment[]
}

export type ManagedUserAction = "access" | "resend" | "delete"

type ManagedUserDetailDialogProps = {
  user: ManagedUser
  roles: { codigo: string; nombre: string }[]
  careers: { id: string; nombre: string }[]
  canEdit: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
  onAction?: (key: ManagedUserAction) => void
}

const scopeOf = (assignment: ManagedUserRoleAssignment): string => assignment.career_name ?? "Todas las carreras"

const actionsFor = (user: ManagedUser, canEdit: boolean): DialogAction[] => {
  if (!canEdit) return []
  if (user.pending_activation) {
    return user.active
      ? [
          ...(user.invitation_expired ? [{ key: "resend", label: "Reenviar invitación", icon: MailCheck }] : []),
          { key: "delete", label: "Eliminar cuenta pendiente", icon: Trash2, destructive: true },
        ]
      : []
  }

  return [user.active ? { key: "access", label: "Deshabilitar acceso", icon: Ban, destructive: true } : { key: "access", label: "Habilitar acceso", icon: CircleCheck }]
}

export function ManagedUserDetailDialog({ user, roles, careers, canEdit, open, onOpenChange, onSaved, onAction }: ManagedUserDetailDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [editing, setEditing] = useState(false)
  useOpened(isOpen, () => setEditing(false))
  const status = managedUserStatus(user)
  const currentAssignments = user.assignments.filter((assignment) => assignment.active)

  const runAction = (key: string): void => {
    setOpen(false)
    onAction?.(key as ManagedUserAction)
  }

  const saved = (message: string): void => {
    setOpen(false)
    onSaved?.(message)
  }

  return (
    <FormModal
      open={isOpen}
      onOpenChange={setOpen}
      showTrigger={false}
      triggerLabel={editing ? "Editar usuario" : "Datos de la cuenta"}
      title={editing ? "Editar usuario" : "Datos de la cuenta"}
      description={editing ? "Cambie los datos y guarde" : "Datos, roles y estado de la cuenta"}
    >
      {editing ? (
        <ManagedUserEditForm user={user} roles={roles} careers={careers} onSaved={saved} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex flex-col gap-6">
            <dl className="grid gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <dt className="font-semibold">Estado</dt>
                <dd>
                  <StatusBadge label={status.label} tone={status.tone} />
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="font-semibold">Nombre completo</dt>
                <dd>{user.nombre}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="font-semibold">Correo institucional</dt>
                <dd>{user.correo_electronico}</dd>
              </div>
            </dl>

            <Separator />

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Roles vigentes</h3>
              {currentAssignments.length === 0 ? (
                <p className="text-sm">Sin rol vigente: la cuenta no accede a ningún módulo</p>
              ) : (
                <ul className="flex flex-col gap-4 text-sm">
                  {currentAssignments.map((assignment) => (
                    <li key={assignment.id} className="flex flex-col gap-0.5 border-l-2 border-primary/40 pl-3">
                      <span className="font-semibold">{assignment.role_name}</span>
                      <span>{scopeOf(assignment)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <FormDialogFooter>
            <DialogActions actions={actionsFor(user, canEdit)} onSelect={runAction} />
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            {canEdit ? (
              <Button type="button" onClick={() => setEditing(true)}>
                <Pencil data-icon="inline-start" aria-hidden="true" />
                Editar
              </Button>
            ) : null}
          </FormDialogFooter>
        </>
      )}
    </FormModal>
  )
}
