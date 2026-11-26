"use client"

import { BookPlus, Save } from "lucide-react"
import { Controller } from "react-hook-form"
import { createMalla, updateCurriculumConfiguration, updateMalla } from "@/api/career-academics"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOpened } from "@/composables/useModelOpen"
import { applyApiErrors, errorMessages, SERVER_ERROR, serverMessage, useSchemaForm } from "@/lib/forms"
import { VALIDATION_LIMITS } from "@/lib/validationLimits"
import type { Malla, MallaState } from "@/types/academic"
import { CODE_MAX, curriculumConfigurationSchema, MALLA_STATE_LABELS, mallaSchema } from "@silabos/shared/schemas/academic"

type MallaDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The malla to edit; null creates a new one. */
  malla: Malla | null
  onSaved: (message: string, mallaId: string) => void
}

type MallaForm = { code: string; cycle_count: string; state: string }

const CREATE_SCHEMA = mallaSchema({ updating: false })
// Editing covers both requests: the malla (code, state) and its cycles.
const EDIT_SCHEMA = mallaSchema({ updating: true }).extend(curriculumConfigurationSchema.shape)

const formValues = (malla: Malla | null): MallaForm => ({
  code: malla?.code ?? "",
  cycle_count: malla ? String(malla.cycle_count) : "",
  state: malla?.state ?? "",
})

/** Creates a malla (code and cycles; it starts vigente) or edits its code, cycles and state. */
export function MallaDialog({ open, onOpenChange, malla, onSaved }: MallaDialogProps) {
  const editing = malla !== null
  const form = useSchemaForm(editing ? EDIT_SCHEMA : CREATE_SCHEMA, { defaultValues: formValues(malla) })
  const { errors, isSubmitting } = form.formState
  const error = serverMessage(errors) ?? null
  const fieldErrors = (name: keyof MallaForm) => errorMessages(errors[name])

  useOpened(open, () => form.reset(formValues(malla)))

  const submit = async (values: MallaForm, close: () => void): Promise<void> => {
    const cycleCount = Number(values.cycle_count)
    // Cycles have their own endpoint and go first: if they are refused, nothing else is saved.
    let cyclesSaved: string | null = null
    try {
      if (malla === null) {
        const result = await createMalla({ code: values.code.trim(), cycle_count: cycleCount })
        onSaved(result.message, result.id)
      } else {
        if (cycleCount !== malla.cycle_count) cyclesSaved = (await updateCurriculumConfiguration(malla.id, { cycle_count: cycleCount })).message
        const result = await updateMalla(malla.id, { code: values.code.trim(), state: values.state as MallaState })
        onSaved(result.message, malla.id)
      }
      close()
    } catch (reason) {
      if (malla !== null && cyclesSaved !== null) onSaved(cyclesSaved, malla.id)
      applyApiErrors(form.setError, reason, { fallback: "No se pudo guardar la malla", aliases: { process: SERVER_ERROR } })
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      triggerLabel={editing ? "Editar malla" : "Nueva malla"}
      title={editing ? "Datos de la malla" : "Nueva malla"}
      description={editing ? "Cambie el código, los ciclos o el estado" : "Indique el código y la cantidad de ciclos"}
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
            <Field data-invalid={fieldErrors("code") !== undefined}>
              <FieldLabel htmlFor="malla-code" required>
                Código de malla
              </FieldLabel>
              <Input id="malla-code" maxLength={CODE_MAX} aria-required="true" aria-invalid={fieldErrors("code") !== undefined} {...form.register("code")} />
              <FieldError errors={fieldErrors("code")} />
            </Field>
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
            {editing ? (
              <Controller
                name="state"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="malla-state" required>
                      Estado
                    </FieldLabel>
                    <Select name={field.name} value={String(field.value ?? "")} onValueChange={field.onChange}>
                      <SelectTrigger ref={field.ref} id="malla-state" className="w-full" aria-required="true" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
                        <SelectValue placeholder="Elija el estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Object.entries(MALLA_STATE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>Las mallas vigentes generan sílabos; una malla cerrada deja de generarlos</FieldDescription>
                    <FieldError errors={errorMessages(fieldState.error)} />
                  </Field>
                )}
              />
            ) : null}
            <FormDialogActions close={close} processing={isSubmitting} icon={editing ? Save : BookPlus} label={editing ? "Guardar malla" : "Crear malla"} />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
