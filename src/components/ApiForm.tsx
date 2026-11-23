"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { ApiError, api } from "@/api/client"
import { requestPurgeConfirmation } from "@/composables/usePurgeConfirmation"

type ApiFormSlot = { errors: Record<string, string>; processing: boolean }

type ApiFormProps = {
  action: string
  method?: string
  resetOnSuccess?: boolean
  className?: string
  onSuccess?: () => void
  onError?: (errors: Record<string, string>) => void
  children: (slot: ApiFormSlot) => ReactNode
}

export function ApiForm({ action, method = "post", resetOnSuccess = false, className, onSuccess, onError, children }: ApiFormProps) {
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const send = async (form: HTMLFormElement, confirmed = false): Promise<void> => {
    const data = new FormData(form)
    if (confirmed) data.set("confirm_purge", "1")
    setProcessing(true)
    setErrors({})
    try {
      await api(action, { method: method.toUpperCase(), body: data })
      if (resetOnSuccess) form.reset()
      window.dispatchEvent(new CustomEvent("silabos:template-changed"))
      onSuccess?.()
    } catch (reason) {
      let failed: Record<string, string>
      if (reason instanceof ApiError) {
        failed = Object.fromEntries(Object.entries(reason.errors).map(([key, values]) => [key, values[0] ?? reason.message]))
        if (failed.purge_required) {
          requestPurgeConfirmation(failed.purge_required, Number(failed.purge_count ?? 0), () => send(form, true), undefined, failed.purge_mode)
        }
      } else {
        failed = { request: "No se pudo completar la solicitud" }
      }
      setErrors(failed)
      onError?.(failed)
    } finally {
      setProcessing(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void send(event.currentTarget)
  }

  return (
    <form className={className} onSubmit={submit}>
      {children({ errors, processing })}
    </form>
  )
}
