"use client"

import { LogOut, Monitor } from "lucide-react"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { closeOtherDeviceSessions, getDeviceSessions, type DeviceSession } from "@/api/session"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { InputError } from "@/components/InputError"
import { PasswordInput } from "@/components/PasswordInput"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { afterDialogExit } from "@/lib/dialogExit"
import { toast } from "@/lib/toast"

export function OtherSessions() {
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const others = (sessions ?? []).filter((session) => !session.current).length

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null)
    try {
      setSessions((await getDeviceSessions()).sessions)
    } catch (reason) {
      setLoadError(reason instanceof ApiError ? reason.message : "No se pudieron cargar sus sesiones")
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const openDialog = (): void => {
    setPassword("")
    setPasswordError(null)
    setError(null)
    setOpen(true)
  }

  const closeOthers = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!password || processing) return
    setProcessing(true)
    setPasswordError(null)
    setError(null)
    try {
      const result = await closeOtherDeviceSessions(password)
      setOpen(false)
      toast.success(result.message)
      await afterDialogExit()
      await load()
    } catch (reason) {
      if (reason instanceof ApiError && reason.errors.current_password) setPasswordError(reason.errors.current_password[0] ?? null)
      else setError(reason instanceof ApiError ? reason.message : "No se pudieron cerrar las otras sesiones")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div data-tour="security-sessions" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Si no reconoce algún dispositivo, cierre las otras sesiones y cambie su contraseña</p>
      {loadError ? (
        <FeedbackAlert message={loadError} />
      ) : sessions === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border" aria-label="Sesiones abiertas">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center gap-3 px-3 py-2.5">
              <Monitor className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {session.device}
                  {session.current ? <Badge variant="secondary">Este dispositivo</Badge> : null}
                </span>
                <span className="text-xs text-muted-foreground">Última actividad: {formatDateDisplay(session.last_activity)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {others > 0 ? (
        <div>
          <Button type="button" variant="outline" onClick={openDialog}>
            <LogOut data-icon="inline-start" aria-hidden="true" />
            Cerrar otras sesiones
          </Button>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void closeOthers(event)}>
            <DialogHeader>
              <DialogTitle>Cerrar otras sesiones</DialogTitle>
              <DialogDescription>
                Se cerrará su cuenta en los demás dispositivos, también en los que marcaron «Mantener la sesión iniciada». Este dispositivo sigue abierto
              </DialogDescription>
            </DialogHeader>
            {error ? <FeedbackAlert message={error} /> : null}
            <div className="grid gap-2">
              <Label htmlFor="other-sessions-password" required>
                Contraseña actual
              </Label>
              <PasswordInput id="other-sessions-password" value={password} onValueChange={setPassword} autoComplete="current-password" aria-required="true" />
              <InputError message={passwordError ?? undefined} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!password || processing}>
                {processing ? <Spinner data-icon="inline-start" /> : <LogOut data-icon="inline-start" aria-hidden="true" />}
                Cerrar otras sesiones
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
