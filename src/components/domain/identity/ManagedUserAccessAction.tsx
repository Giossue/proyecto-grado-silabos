"use client"

import { Ban, CircleCheck } from "lucide-react"
import { useState } from "react"
import { updateManagedUser, type ManagedUser } from "@/api/admin-users"
import { ApiError } from "@/api/client"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"

type ManagedUserAccessActionProps = {
  user: ManagedUser
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onChanged?: (message: string) => void
}

export function ManagedUserAccessAction({ user, open, onOpenChange, onChanged }: ManagedUserAccessActionProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const coordinatedCareers = user.roles.filter((role) => role.code === "coordinador" && role.career_name).map((role) => role.career_name as string)
  useOpened(isOpen, () => setError(null))

  const confirm = async (): Promise<void> => {
    setProcessing(true)
    setError(null)
    try {
      const result = await updateManagedUser(user.id, { nombre: user.nombre, correo_electronico: user.correo_electronico, active: !user.active })
      setOpen(false)
      onChanged?.(result.message)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo cambiar el acceso")
    } finally {
      setProcessing(false)
    }
  }

  const description =
    (user.active ? `${user.nombre} no podrá ingresar al sistema` : `${user.nombre} podrá volver a ingresar al sistema`) +
    (user.active && coordinatedCareers.length > 0 ? ` Dejará de coordinar ${coordinatedCareers.join(", ")}; nombre a otra persona desde Carreras` : "")

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user.active ? "Deshabilitar acceso" : "Habilitar acceso"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? <FeedbackAlert message={error} /> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" variant={user.active ? "destructive" : "default"} disabled={processing} onClick={() => void confirm()}>
            {processing ? <Spinner /> : user.active ? <Ban /> : <CircleCheck />}
            {user.active ? "Deshabilitar" : "Habilitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
