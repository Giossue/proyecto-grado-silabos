"use client"

import { FileSignature, ShieldCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import type { SignaturePayload } from "@/api/signatures"
import { PasswordInput } from "@/components/PasswordInput"
import { FileDropzone } from "@/components/domain/FileDropzone"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"

export type StatementSigner = (statement: string) => SignaturePayload

type SignatureDialogProps = {
  title: string
  confirmLabel: string
  run: (sign: StatementSigner) => Promise<void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type Errors = { certificate?: string; password?: string; general?: string }

const CERTIFICATE_CODES = ["invalid_file", "no_key", "expired", "not_yet_valid"]

export function SignatureDialog({ title, confirmLabel, run, open, onOpenChange }: SignatureDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [certificate, setCertificate] = useState<File | null>(null)
  const [password, setPassword] = useState("")
  const [working, setWorking] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  useOpened(isOpen, () => {
    setCertificate(null)
    setPassword("")
    setErrors({})
  })

  const pickCertificate = (file: File | null): void => {
    setCertificate(file)
    setErrors((current) => ({ ...current, certificate: undefined }))
  }

  const invalidCertificate = (message: string | null): void => {
    if (message) setErrors((current) => ({ ...current, certificate: message }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setErrors({})
    if (!certificate) {
      setErrors({ certificate: "Elija su archivo .p12 o .pfx" })
      return
    }
    if (!password) {
      setErrors({ password: "Escriba la clave de su firma" })
      return
    }
    setWorking(true)
    try {
      const [{ signStatement }, { readCertificate, SignatureError }] = await Promise.all([
        import("@/lib/signature/signStatement"),
        import("@/lib/signature/certificate"),
      ])
      const p12 = new Uint8Array(await certificate.arrayBuffer())
      const key = password
      try {
        readCertificate(p12, key)
        await run((statement) => signStatement({ statement, p12, password: key }).signature)
        setOpen(false)
      } catch (reason) {
        if (reason instanceof SignatureError) {
          if (reason.code === "wrong_password") setErrors({ password: reason.message })
          else if (CERTIFICATE_CODES.includes(reason.code)) setErrors({ certificate: reason.message })
          else setErrors({ general: reason.message })
        } else if (reason instanceof ApiError) {
          const signatureError = Object.entries(reason.errors).find(([name]) => name === "signature" || name.startsWith("signature"))?.[1][0]
          setErrors({ general: signatureError ?? reason.message })
        } else {
          setErrors({ general: "No se pudo firmar. Intente de nuevo" })
        }
      }
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 rounded-md bg-muted/50 p-3">
            <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
            Su firma está protegida: nada sale de su equipo
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" data-testid="signature-form" onSubmit={(event) => void submit(event)}>
          <Field data-invalid={Boolean(errors.certificate)}>
            <FieldLabel htmlFor="signature-certificate" required>
              Archivo de firma (.p12 o .pfx)
            </FieldLabel>
            <FileDropzone
              value={certificate}
              inputId="signature-certificate"
              kind="certificate"
              maxBytes={5 * 1024 * 1024}
              disabled={working}
              invalid={Boolean(errors.certificate)}
              onValueChange={pickCertificate}
              onValidationError={invalidCertificate}
            />
            {errors.certificate ? <FieldError errors={[errors.certificate]} /> : null}
          </Field>
          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="signature-password" required>
              Clave de la firma
            </FieldLabel>
            <PasswordInput id="signature-password" value={password} onValueChange={setPassword} autoComplete="off" aria-invalid={Boolean(errors.password)} />
            {errors.password ? <FieldError errors={[errors.password]} /> : null}
          </Field>
          {errors.general ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errors.general}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={working}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={working || !certificate || !password}>
              {working ? <Spinner data-icon="inline-start" /> : <FileSignature data-icon="inline-start" aria-hidden="true" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
