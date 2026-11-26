"use client"

import { BookPlus, Save } from "lucide-react"
import { createMalla, updateMalla } from "@/api/career-academics"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useOpened } from "@/composables/useModelOpen"
import { applyApiErrors, errorMessages, serverMessage, useSchemaForm } from "@/lib/forms"
import { VALIDATION_LIMITS } from "@/lib/validationLimits"
import type { Malla, MallaState } from "@/types/academic"
import { MALLA_STATE_LABELS, mallaSchema } from "@silabos/shared/schemas/academic"

type MallaDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The malla to edit; null creates a new one. */
  malla: Malla | null
  onSaved: (message: string, mallaId: string) => void
}

type MallaForm = { name: string; cycle_count: string; state: string }

const CREATE_SCHEMA = mallaSchema({ updating: false })
const EDIT_SCHEMA = mallaSchema({ updating: true })

const formValues = (malla: Malla | null): MallaForm => ({
  name: malla?.name ?? "",
  cycle_count: "",
  state: malla?.state ?? "",
})

/** Creates a malla (name, cycles, state) or edits name and state; cycles are configured in the editor. */
export function MallaDialog({ open, onOpenChange, malla, onSaved }: MallaDialogProps) {
  const editing = malla !== null
  const form = useSchemaForm(editing ? EDIT_SCHEMA : CREATE_SCHEMA, { defaultValues: formValues(malla) })
  const { errors, isSubmitting } = form.formState
  const error = serverMessage(errors) ?? null
  const fieldErrors = (name: keyof MallaForm) => errorMessages(errors[name])

  useOpened(open, () => form.reset(formValues(malla)))

  const submit = async (values: MallaForm, close: () => void): Promise<void> => {
    const state = values.state as MallaState
    try {
      if (malla === null) {
        const result = await createMalla({ name: values.name.trim(), cycle_count: Number(values.cycle_count), state })
        onSaved(result.message, result.id)
      } else {
        const result = await updateMalla(malla.id, { name: values.name.trim(), state })
        onSaved(result.message, malla.id)
      }
      close()
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudo guardar la malla" })
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      triggerLabel={editing ? "Editar malla" : "Nueva malla"}
      title={editing ? "Datos de la malla" : "Nueva malla"}
      description={editing ? "Cambie el nombre o el estado. Los ciclos se configuran al editar la malla" : "Una carrera puede tener varias mallas vigentes"}
      showTrigger={false}
      narrow
    >
      {({ close }) => (
        <form className="contents" noValidate onSubmit={form.handleSubmit((values) => submit(values as MallaForm, close))}>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={fieldErrors("name") !== undefined}>
              <FieldLabel htmlFor="malla-name" required>
                Nombre
              </FieldLabel>
              <Input id="malla-name" maxLength={180} aria-required="true" aria-invalid={fieldErrors("name") !== undefined} {...form.register("name")} />
              <FieldError errors={fieldErrors("name")} />
            </Field>
            {editing ? null : (
              <Field data-invalid={fieldErrors("cycle_count") !== undefined}>
                <FieldLabel htmlFor="malla-cycle-count" required>
                  Cantidad de ciclos
                </FieldLabel>
                <Input
                  id="malla-cycle-count"
                  type="number"
                  min={1}
                  max={VALIDATION_LIMITS.cycleCount}
                  aria-required="true"
                  aria-invalid={fieldErrors("cycle_count") !== undefined}
                  {...form.register("cycle_count")}
                />
                <FieldError errors={fieldErrors("cycle_count")} />
              </Field>
            )}
            <Field data-invalid={fieldErrors("state") !== undefined}>
              <FieldLabel htmlFor="malla-state" required>
                Estado
              </FieldLabel>
              <NativeSelect id="malla-state" className="w-full" aria-required="true" aria-invalid={fieldErrors("state") !== undefined} {...form.register("state")}>
                <NativeSelectOption value="">Elija el estado</NativeSelectOption>
                {Object.entries(MALLA_STATE_LABELS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>Las mallas vigentes generan sílabos; una malla cerrada deja de generarlos</FieldDescription>
              <FieldError errors={fieldErrors("state")} />
            </Field>
            <FormDialogActions close={close} processing={isSubmitting} icon={editing ? Save : BookPlus} label={editing ? "Guardar malla" : "Crear malla"} />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
