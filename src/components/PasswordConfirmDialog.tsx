"use client"

import { ShieldCheck, ShieldOff } from "lucide-react"
import { useState, type FormEvent } from "react"
import { PasswordInput } from "@/components/PasswordInput"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

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
  const [password, setPassword] = useState("")
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPassword("")
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!password) return
    onConfirm(password)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="confirm-current-password" required>Contraseña actual</Label>
            <PasswordInput id="confirm-current-password" value={password} onValueChange={setPassword} autoComplete="current-password" aria-required="true" />
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
