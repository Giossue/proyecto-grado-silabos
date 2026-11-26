"use client"

import { ShieldCheck, ShieldOff } from "lucide-react"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { PasswordInput } from "@/components/PasswordInput"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useSchemaForm } from "@/lib/forms"
import { passwordConfirmationSchema, type PasswordConfirmationValues } from "@silabos/shared/schemas/auth"

const schema = passwordConfirmationSchema()

type PasswordConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: (password: string) => void
}

export function PasswordConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onConfirm }: PasswordConfirmDialogProps) {
  const form = useSchemaForm(schema, { defaultValues: { current_password: "" } })
  const password = form.watch("current_password")
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) form.reset()
  }

  const submit = ({ current_password }: PasswordConfirmationValues): void => {
    onConfirm(current_password)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="confirm-current-password" required>Contraseña actual</Label>
            <Controller
              name="current_password"
              control={form.control}
              render={({ field: { onChange, ...field } }) => (
                <PasswordInput {...field} id="confirm-current-password" onValueChange={onChange} autoComplete="current-password" aria-required="true" />
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={!password}>
              {destructive ? <ShieldOff data-icon="inline-start" aria-hidden="true" /> : <ShieldCheck data-icon="inline-start" aria-hidden="true" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
