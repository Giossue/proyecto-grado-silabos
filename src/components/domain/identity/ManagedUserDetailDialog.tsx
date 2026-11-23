"use client"

import { Ban, CircleCheck, MailCheck, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import type { ManagedUser } from "@/api/admin-users"
import { DialogActions, type DialogAction } from "@/components/domain/DialogActions"
import { ManagedUserEditForm } from "@/components/domain/identity/ManagedUserEditForm"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { managedUserStatus } from "@/lib/managedUserStatus"

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
  two_factor_enabled: boolean
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
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="p-4">
          <DialogTitle>{editing ? "Editar usuario" : "Datos de la cuenta"}</DialogTitle>
          <DialogDescription>{editing ? "Cambie los datos y guarde" : "Datos, roles y estado de la cuenta"}</DialogDescription>
        </DialogHeader>

        {editing ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-4 pt-1 pb-28">
              <ManagedUserEditForm user={user} roles={roles} careers={careers} onSaved={saved} onCancel={() => setEditing(false)} />
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-6 px-4 pt-1 pb-28">
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
                <div className="flex flex-col gap-1">
                  <dt className="font-semibold">Acceso en dos pasos</dt>
                  <dd>{user.two_factor_enabled ? "Configurado por su titular" : "Sin configurar"}</dd>
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
          </ScrollArea>
        )}

        {!editing ? (
          <DialogFooter className="absolute inset-x-0 bottom-0 mx-0 flex-col bg-card p-4 pb-(--safe-footer-inset) sm:flex-col sm:justify-start">
            <Field orientation="horizontal" className="flex-wrap justify-end">
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
            </Field>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
