"use client"

import { Settings2 } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { updateCurriculumConfiguration, type Curriculum } from "@/api/career-academics"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useOpened } from "@/composables/useModelOpen"
import { VALIDATION_LIMITS } from "@/lib/validationLimits"

type CurriculumConfigurationDialogProps = {
  curriculum: Curriculum["curriculum"]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (message: string) => void
}

export function CurriculumConfigurationDialog({ curriculum, open, onOpenChange, onSaved }: CurriculumConfigurationDialogProps) {
  const [cycleCount, setCycleCount] = useState<number | "">(curriculum.cycle_count)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useOpened(open, () => {
    setCycleCount(curriculum.cycle_count)
    setError(null)
  })

  const submit = async (event: FormEvent<HTMLFormElement>, close: () => void): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const result = await updateCurriculumConfiguration(curriculum.id, { cycle_count: Number(cycleCount) })
      onSaved(result.message)
      close()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo configurar la malla")
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormModal open={open} onOpenChange={onOpenChange} triggerLabel="Configurar ciclos" title="Configurar ciclos" description="Defina cuántos ciclos tiene la malla" showTrigger={false} narrow>
      {({ close }) => (
        <form className="contents" onSubmit={(event) => void submit(event, close)}>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="curriculum-cycle-count" required>
                Cantidad de ciclos
              </FieldLabel>
              <Input
                id="curriculum-cycle-count"
                type="number"
                min={1}
                max={VALIDATION_LIMITS.cycleCount}
                aria-required="true"
                value={cycleCount}
                onChange={(event) => setCycleCount(event.target.value === "" ? "" : Number(event.target.value))}
              />
            </Field>
            <FormDialogActions close={close} processing={saving} disabled={cycleCount === ""} icon={Settings2} label="Guardar configuración" />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
