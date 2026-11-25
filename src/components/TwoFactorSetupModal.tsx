"use client"

import { Check, ScanLine } from "lucide-react"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { InputError } from "@/components/InputError"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useSchemaForm } from "@/lib/forms"
import { twoFactorConfirmationSchema, type TwoFactorConfirmationValues } from "@/schemas/twoFactor"

type TwoFactorSetupModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  qrCodeSvg: string | null
  processing: boolean
  error: string | null
  onConfirm: (code: string) => void
}

export function TwoFactorSetupModal({ open, onOpenChange, qrCodeSvg, processing, error, onConfirm }: TwoFactorSetupModalProps) {
  const [verification, setVerification] = useState(false)
  const form = useSchemaForm(twoFactorConfirmationSchema, { defaultValues: { code: "" } })
  const code = form.watch("code")
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setVerification(false)
      form.reset()
    }
  }

  const submit = (values: TwoFactorConfirmationValues): void => {
    if (values.code.length === 6 && !processing) onConfirm(values.code)
  }
  const qrImage = `data:image/svg+xml;utf8,${encodeURIComponent(qrCodeSvg ?? "")}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex items-center justify-center">
          <div className="mb-3 w-auto rounded-full border border-border bg-card p-0.5 shadow-surface">
            <div className="relative overflow-hidden rounded-full border border-border bg-muted p-2.5">
              <ScanLine className="relative z-20 size-6 text-foreground" aria-hidden="true" />
            </div>
          </div>
          <DialogTitle>{verification ? "Verificar código de autenticación" : "Activar autenticación de dos factores"}</DialogTitle>
          <DialogDescription className="text-center">
            {verification ? "Ingrese el código de seis dígitos de su aplicación" : "Escanee el código QR con su aplicación autenticadora"}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex w-auto flex-col items-center justify-center gap-5">
          {error ? <InputError message={error} /> : null}
          {!verification ? (
            <div className="relative mx-auto aspect-square w-64 overflow-hidden rounded-md bg-background p-5 ring-1 ring-surface-ring">
              {!qrCodeSvg ? (
                <div className="size-full" role="status" aria-live="polite" aria-busy="true" aria-label="Cargando código QR">
                  <span className="sr-only">Cargando código QR…</span>
                  <Skeleton aria-hidden="true" className="size-full" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrImage} alt="Código QR para su aplicación autenticadora" className="size-full object-contain" />
              )}
            </div>
          ) : (
            <form id="two-factor-verify-form" className="flex w-full flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
              <div className="flex w-full flex-col items-center justify-center gap-3 py-2">
                <Label htmlFor="otp" required>
                  Código de autenticación
                </Label>
                <Controller
                  name="code"
                  control={form.control}
                  render={({ field }) => (
                    <InputOTP id="otp" ref={field.ref} value={field.value} onChange={field.onChange} onBlur={field.onBlur} maxLength={6} disabled={processing} aria-required="true">
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  )}
                />
              </div>
            </form>
          )}
        </div>
        {!verification ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!qrCodeSvg} onClick={() => setVerification(true)}>
              <Check data-icon="inline-start" aria-hidden="true" />
              Continuar
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" disabled={processing} onClick={() => setVerification(false)}>
              Volver
            </Button>
            <Button type="submit" form="two-factor-verify-form" disabled={processing || code.length < 6}>
              {processing ? <Spinner /> : <Check data-icon="inline-start" aria-hidden="true" />}
              Confirmar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
