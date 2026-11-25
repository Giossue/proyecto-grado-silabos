"use client"

import { LogOut, Monitor } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { closeOtherDeviceSessions } from "@/api/session"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { InputError } from "@/components/InputError"
import { PasswordInput } from "@/components/PasswordInput"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { afterDialogExit } from "@/lib/dialogExit"
import { applyApiErrors, fieldMessage, serverMessage, useSchemaForm } from "@/lib/forms"
import { queryErrorMessage } from "@/lib/queryClient"
import { toast } from "@/lib/toast"
import { accountKeys, deviceSessionsQuery } from "@/queries/account"
import { passwordConfirmationSchema, type PasswordConfirmationValues } from "@silabos/shared/schemas/twoFactor"

const schema = passwordConfirmationSchema()

export function OtherSessions() {
  const queryClient = useQueryClient()
  const query = useQuery(deviceSessionsQuery())
  const sessions = query.data?.sessions ?? null
  const loadError = queryErrorMessage(query, "No se pudieron cargar sus sesiones")
  const [open, setOpen] = useState(false)
  const form = useSchemaForm(schema, { defaultValues: { current_password: "" } })
  const { errors, isSubmitting: processing } = form.formState
  const password = form.watch("current_password")
  const error = serverMessage(errors)
  const others = (sessions ?? []).filter((session) => !session.current).length

  const openDialog = (): void => {
    form.reset()
    setOpen(true)
  }

  const closeOthers = async ({ current_password }: PasswordConfirmationValues): Promise<void> => {
    try {
      const result = await closeOtherDeviceSessions(current_password)
      setOpen(false)
      toast.success(result.message)
      await afterDialogExit()
      await queryClient.invalidateQueries({ queryKey: accountKeys.deviceSessions() })
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudieron cerrar las otras sesiones" })
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
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(closeOthers)}>
            <DialogHeader>
              <DialogTitle>Cerrar otras sesiones</DialogTitle>
              <DialogDescription>
                Se cerrará su cuenta en los demás dispositivos. Este dispositivo sigue abierto
              </DialogDescription>
            </DialogHeader>
            {error ? <FeedbackAlert message={error} /> : null}
            <Field data-invalid={Boolean(fieldMessage(errors, "current_password"))} className="gap-2">
              <Label htmlFor="other-sessions-password" required>
                Contraseña actual
              </Label>
              <Controller
                name="current_password"
                control={form.control}
                render={({ field: { onChange, ...field } }) => (
                  <PasswordInput {...field} id="other-sessions-password" onValueChange={onChange} autoComplete="current-password" aria-required="true" />
                )}
              />
              <InputError message={fieldMessage(errors, "current_password")} />
            </Field>
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
