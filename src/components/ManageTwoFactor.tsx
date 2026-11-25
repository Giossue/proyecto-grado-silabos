"use client"

import { ShieldCheck, ShieldOff } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Controller } from "react-hook-form"
import { ApiError } from "@/api/client"
import { confirmTwoFactor, disableTwoFactor, enableTwoFactor, regenerateRecoveryCodes, type TwoFactorStatus } from "@/api/session"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { InputError } from "@/components/InputError"
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog"
import { PasswordInput } from "@/components/PasswordInput"
import { TwoFactorRecoveryCodes } from "@/components/TwoFactorRecoveryCodes"
import { TwoFactorSetupModal } from "@/components/TwoFactorSetupModal"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { applyApiErrors, fieldMessage, serverMessage, useSchemaForm } from "@/lib/forms"
import { accountKeys, twoFactorQuery } from "@/queries/account"
import { twoFactorDisableSchema, type TwoFactorDisableValues } from "@/schemas/twoFactor"

const disableSchema = twoFactorDisableSchema({ requireCode: true })

const messageOf = (reason: unknown, fallback: string): string => (reason instanceof ApiError ? reason.message : fallback)

export function ManageTwoFactor({ onLoadingChange }: { onLoadingChange?: (loading: boolean) => void }) {
  const queryClient = useQueryClient()
  const status = useQuery(twoFactorQuery())
  const enabled = status.data?.enabled ?? null
  const loading = status.isPending
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [actionError, setError] = useState<string | null>(null)
  const error = actionError ?? (status.isError ? messageOf(status.error, "No se pudo consultar el segundo factor") : null)
  const [pendingEnable, setPendingEnable] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const disableForm = useSchemaForm(disableSchema, { defaultValues: { current_password: "", code: "", recovery_code: "" } })
  const disableErrors = disableForm.formState.errors
  const disableError = serverMessage(disableErrors)
  const disablePassword = disableForm.watch("current_password")
  const disableCode = disableForm.watch(useRecoveryCode ? "recovery_code" : "code")
  const loadingListener = useRef(onLoadingChange)

  useEffect(() => {
    loadingListener.current = onLoadingChange
  }, [onLoadingChange])

  useEffect(() => {
    loadingListener.current?.(loading)
  }, [loading])

  const setEnabled = (value: boolean): void => {
    queryClient.setQueryData<TwoFactorStatus>(accountKeys.twoFactor(), (current) => ({ confirmation_required: false, ...current, enabled: value }))
  }

  const enable = async (password: string): Promise<void> => {
    setProcessing(true)
    setError(null)
    try {
      const status = await enableTwoFactor(password)
      setQrCodeSvg(status.qr_code_svg)
      setShowSetupModal(true)
    } catch (reason) {
      setError(messageOf(reason, "No se pudo iniciar la configuración"))
    } finally {
      setProcessing(false)
    }
  }

  const confirm = async (code: string): Promise<void> => {
    setProcessing(true)
    setError(null)
    try {
      const status = await confirmTwoFactor(code)
      setEnabled(status.enabled)
      setRecoveryCodes(status.recovery_codes)
      setShowSetupModal(false)
    } catch (reason) {
      setError(messageOf(reason, "El código no es válido"))
    } finally {
      setProcessing(false)
    }
  }

  const openDisable = (): void => {
    disableForm.reset()
    setUseRecoveryCode(false)
    setDisableOpen(true)
  }

  const toggleRecoveryCode = (): void => {
    setUseRecoveryCode((value) => !value)
    disableForm.setValue("code", "")
    disableForm.setValue("recovery_code", "")
  }

  const disable = async ({ current_password, code, recovery_code }: TwoFactorDisableValues): Promise<void> => {
    setProcessing(true)
    setError(null)
    try {
      const status = useRecoveryCode ? await disableTwoFactor(current_password, "", recovery_code ?? "") : await disableTwoFactor(current_password, code ?? "")
      setEnabled(status.enabled)
      setRecoveryCodes([])
      setDisableOpen(false)
    } catch (reason) {
      applyApiErrors(disableForm.setError, reason, { fallback: "No se pudo desactivar el segundo factor" })
    } finally {
      setProcessing(false)
    }
  }

  const regenerate = async (password: string): Promise<void> => {
    setProcessing(true)
    setError(null)
    try {
      setRecoveryCodes((await regenerateRecoveryCodes(password)).recovery_codes)
    } catch (reason) {
      setError(messageOf(reason, "No se pudieron regenerar los códigos"))
    } finally {
      setProcessing(false)
    }
  }

  const confirmEnable = async (password: string): Promise<void> => {
    setPendingEnable(false)
    await enable(password)
  }

  return (
    <div data-tour="security-2fa" className="flex flex-col gap-6">
      {error ? <FeedbackAlert message={error} /> : null}

      {loading ? (
        <div role="status" aria-live="polite" aria-busy="true" aria-label="Cargando autenticación de dos factores">
          <span className="sr-only">Cargando autenticación de dos factores…</span>
          <div aria-hidden="true" className="flex flex-col items-start gap-4">
            <div className="flex w-full flex-col gap-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-9 w-31 max-w-full" />
          </div>
        </div>
      ) : enabled === false ? (
        <div className="flex flex-col items-start justify-start gap-4">
          <p className="text-sm text-muted-foreground">Al activarla, el inicio de sesión solicitará un código seguro generado por una aplicación TOTP en su dispositivo</p>
          <Button type="button" disabled={processing} onClick={() => setPendingEnable(true)}>
            {processing ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" aria-hidden="true" />}
            Activar 2FA
          </Button>
        </div>
      ) : enabled ? (
        <div className="flex flex-col items-start justify-start gap-4">
          <p className="text-sm text-muted-foreground">El inicio de sesión solicitará un código temporal generado por la aplicación TOTP de su dispositivo</p>
          <Button variant="destructive" type="button" disabled={processing} onClick={openDisable}>
            {processing ? <Spinner data-icon="inline-start" /> : <ShieldOff data-icon="inline-start" aria-hidden="true" />}
            Desactivar 2FA
          </Button>
          <TwoFactorRecoveryCodes codes={recoveryCodes} processing={processing} onRegenerate={(password) => void regenerate(password)} />
        </div>
      ) : null}

      <PasswordConfirmDialog
        open={pendingEnable}
        onOpenChange={setPendingEnable}
        title="Activar la verificación en dos pasos"
        description="Por seguridad, confirme su contraseña actual para continuar"
        confirmLabel="Continuar"
        onConfirm={(password) => void confirmEnable(password)}
      />
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={disableForm.handleSubmit(disable)}>
            <DialogHeader>
              <DialogTitle>Desactivar la verificación en dos pasos</DialogTitle>
              <DialogDescription>Por seguridad, confirme su contraseña actual y un código de su aplicación de autenticación</DialogDescription>
            </DialogHeader>
            <Field data-invalid={Boolean(fieldMessage(disableErrors, "current_password"))} className="gap-2">
              <Label htmlFor="disable-current-password" required>
                Contraseña actual
              </Label>
              <Controller
                name="current_password"
                control={disableForm.control}
                render={({ field: { onChange, ...field } }) => (
                  <PasswordInput {...field} id="disable-current-password" onValueChange={onChange} autoComplete="current-password" aria-required="true" />
                )}
              />
              <InputError message={fieldMessage(disableErrors, "current_password")} />
            </Field>
            <div className="grid gap-2">
              <Field data-invalid={Boolean(fieldMessage(disableErrors, "code") ?? fieldMessage(disableErrors, "recovery_code"))} className="gap-2">
                <Label htmlFor="disable-code" required>
                  {useRecoveryCode ? "Código de recuperación" : "Código de autenticación"}
                </Label>
                <Controller
                  key={useRecoveryCode ? "recovery_code" : "code"}
                  name={useRecoveryCode ? "recovery_code" : "code"}
                  control={disableForm.control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      id="disable-code"
                      type="text"
                      autoComplete={useRecoveryCode ? "off" : "one-time-code"}
                      autoCapitalize={useRecoveryCode ? "characters" : undefined}
                      spellCheck={useRecoveryCode ? false : undefined}
                      inputMode={useRecoveryCode ? "text" : "numeric"}
                      maxLength={useRecoveryCode ? 128 : 6}
                      placeholder={useRecoveryCode ? "Ej. ABCD-EFGH" : "Código de 6 dígitos"}
                      aria-required="true"
                    />
                  )}
                />
                <InputError message={fieldMessage(disableErrors, "code") ?? fieldMessage(disableErrors, "recovery_code")} />
              </Field>
              <Button type="button" variant="link" className="h-auto justify-start p-0 text-sm" onClick={toggleRecoveryCode}>
                {useRecoveryCode ? "Usar un código de autenticación" : "Usar un código de recuperación"}
              </Button>
            </div>
            {disableError ? <FeedbackAlert message={disableError} /> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={processing || !disablePassword || !disableCode}>
                {processing ? <Spinner data-icon="inline-start" /> : <ShieldOff data-icon="inline-start" aria-hidden="true" />}
                Desactivar 2FA
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <TwoFactorSetupModal
        open={showSetupModal}
        onOpenChange={setShowSetupModal}
        qrCodeSvg={qrCodeSvg}
        processing={processing}
        error={error}
        onConfirm={(code) => void confirm(code)}
      />
    </div>
  )
}
