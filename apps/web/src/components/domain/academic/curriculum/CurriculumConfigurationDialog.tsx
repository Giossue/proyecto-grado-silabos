"use client"

import { Settings2 } from "lucide-react"
import { ApiError } from "@/api/client"
import { updateCurriculumConfiguration, type Curriculum } from "@/api/career-academics"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useOpened } from "@/composables/useModelOpen"
import { errorMessages, SERVER_ERROR, serverMessage, useSchemaForm } from "@/lib/forms"
import { VALIDATION_LIMITS } from "@/lib/validationLimits"
import { curriculumConfigurationSchema } from "@silabos/shared/schemas/academic"

type CurriculumConfigurationDialogProps = {
  curriculum: Curriculum["curriculum"]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (message: string) => void
}

export function CurriculumConfigurationDialog({ curriculum, open, onOpenChange, onSaved }: CurriculumConfigurationDialogProps) {
  const form = useSchemaForm(curriculumConfigurationSchema, { defaultValues: { cycle_count: curriculum.cycle_count } })
  const cycleCount = form.watch("cycle_count") as number | "" | undefined
  const saving = form.formState.isSubmitting
  const error = serverMessage(form.formState.errors) ?? null
  const cycleErrors = errorMessages(form.formState.errors.cycle_count)

  useOpened(open, () => form.reset({ cycle_count: curriculum.cycle_count }))

  const submit = async (close: () => void): Promise<void> => {
    try {
      const result = await updateCurriculumConfiguration(curriculum.id, { cycle_count: Number(cycleCount) })
      onSaved(result.message)
      close()
    } catch (reason) {
      form.setError(SERVER_ERROR, { type: "server", message: reason instanceof ApiError ? reason.message : "No se pudo configurar la malla" })
    }
  }

  return (
    <FormModal open={open} onOpenChange={onOpenChange} triggerLabel="Configurar ciclos" title="Configurar ciclos" description="Defina cuántos ciclos tiene la malla" showTrigger={false} narrow>
      {({ close }) => (
        <form className="contents" noValidate onSubmit={form.handleSubmit(() => submit(close))}>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={cycleErrors !== undefined}>
              <FieldLabel htmlFor="curriculum-cycle-count" required>
                Cantidad de ciclos
              </FieldLabel>
              <Input
                id="curriculum-cycle-count"
                type="number"
                min={1}
                max={VALIDATION_LIMITS.cycleCount}
                aria-required="true"
                value={cycleCount ?? ""}
                aria-invalid={cycleErrors !== undefined}
                onChange={(event) => form.setValue("cycle_count", event.target.value === "" ? "" : Number(event.target.value))}
              />
              <FieldError errors={cycleErrors} />
            </Field>
            <FormDialogActions close={close} processing={saving} disabled={cycleCount === ""} icon={Settings2} label="Guardar configuración" />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
