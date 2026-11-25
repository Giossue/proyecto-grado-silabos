import { Check, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

type FormDialogActionsProps = {
  label?: string
  close: () => void
  closeOnly?: boolean
  processing?: boolean
  icon?: LucideIcon
  disabled?: boolean
  destructive?: boolean
  secondary?: ReactNode
}

export function FormDialogFooter({ children }: { children?: ReactNode }) {
  return (
    <DialogFooter className="absolute inset-x-0 bottom-0 mx-0 flex-col bg-card p-4 pb-(--safe-footer-inset) sm:flex-col sm:justify-start">
      <Field orientation="horizontal" className="flex-wrap justify-end">
        {children}
      </Field>
    </DialogFooter>
  )
}

export function FormDialogActions({
  label = "",
  close,
  closeOnly = false,
  processing = false,
  icon: Icon = Check,
  disabled = false,
  destructive = false,
  secondary,
}: FormDialogActionsProps) {
  return (
    <FormDialogFooter>
      {secondary}
      <Button type="button" variant="outline" onClick={close}>
        {closeOnly ? "Cerrar" : "Cancelar"}
      </Button>
      {!closeOnly ? (
        <Button type="submit" variant={destructive ? "destructive" : undefined} disabled={processing || disabled}>
          {processing ? <Spinner data-icon="inline-start" /> : <Icon data-icon="inline-start" aria-hidden="true" />}
          {label}
        </Button>
      ) : null}
    </FormDialogFooter>
  )
}
