"use client"

import { MailCheck, UserMinus } from "lucide-react"
import { DialogActions, type DialogAction } from "@/components/domain/DialogActions"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NAME_PARTS, splitName } from "@/lib/personName"

type CareerTeacher = { id: string; name: string; email: string; pending_activation: boolean; invitation_expired: boolean }

type CareerTeacherEditDialogProps = {
  teacher: CareerTeacher
  removeDisabled?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onRemove: () => void
  onResend: () => void
}

export function CareerTeacherEditDialog({ teacher, removeDisabled, open, onOpenChange, onRemove, onResend }: CareerTeacherEditDialogProps) {
  const actions: DialogAction[] = [
    ...(teacher.pending_activation && teacher.invitation_expired ? [{ key: "resend", label: "Reenviar invitación", icon: MailCheck }] : []),
    {
      key: "remove",
      label: "Quitar de la carrera",
      icon: UserMinus,
      destructive: true,
      disabled: removeDisabled,
      disabledReason: "No se puede quitar mientras la convocatoria esté en curso",
    },
  ]
  const parts = splitName(teacher.name)

  return (
    <FormModal open={open} onOpenChange={onOpenChange} triggerLabel="Docente" title="Docente" description="Datos del docente en su carrera" showTrigger={false}>
      {({ close }) => (
        <form onSubmit={(event) => event.preventDefault()}>
          <FieldGroup>
            <div className="grid grid-cols-2 items-start gap-4">
              {NAME_PARTS.map((part) => (
                <Field key={part.key}>
                  <FieldLabel htmlFor={`career-teacher-${part.key}-${teacher.id}`}>{part.label}</FieldLabel>
                  <Input id={`career-teacher-${part.key}-${teacher.id}`} value={parts[part.key]} readOnly disabled />
                </Field>
              ))}
            </div>
            <Field>
              <FieldLabel htmlFor={`career-teacher-email-${teacher.id}`}>Correo institucional</FieldLabel>
              <Input id={`career-teacher-email-${teacher.id}`} value={teacher.email} type="email" readOnly disabled />
              <FieldDescription>Para corregir el nombre o el correo, solicítelo a Administración</FieldDescription>
            </Field>
            <FormDialogActions
              close={close}
              closeOnly
              secondary={<DialogActions actions={actions} onSelect={(key) => (key === "resend" ? onResend() : onRemove())} />}
            />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
