"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { logout } from "@/api/session"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { clearIntendedRoute } from "@/lib/intended-route"
import { paths } from "@/lib/routes"
import { useSignal } from "@/lib/signal"
import { sessionState } from "@/state/session"
import { logoutConfirmOpen } from "@/state/shellDialogs"

export function LogoutConfirmDialog() {
  const router = useRouter()
  const open = useSignal(logoutConfirmOpen)
  const [leaving, setLeaving] = useState(false)

  const confirmLogout = async (): Promise<void> => {
    setLeaving(true)
    try {
      await logout()
      sessionState.clear()
      clearIntendedRoute()
      logoutConfirmOpen.value = false
      router.replace(paths.login)
    } finally {
      setLeaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { logoutConfirmOpen.value = value }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cerrar sesión?</DialogTitle>
          <DialogDescription>Tendrá que volver a ingresar para seguir usando el sistema</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={leaving} onClick={() => { logoutConfirmOpen.value = false }}>Cancelar</Button>
          <Button type="button" variant="destructive" disabled={leaving} onClick={() => void confirmLogout()}>
            {leaving ? <Spinner data-icon="inline-start" /> : <LogOut data-icon="inline-start" aria-hidden="true" />}
            Cerrar sesión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
