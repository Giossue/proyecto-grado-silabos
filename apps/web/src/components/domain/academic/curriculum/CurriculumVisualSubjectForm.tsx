"use client"

import { Check } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { createCareerRecord, updateCareerRecord } from "@/api/career-academics"
import { CurriculumSubjectFieldInput } from "@/components/domain/academic/curriculum/CurriculumSubjectFieldInput"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useCurriculumSubjectFieldValues } from "@/composables/useCurriculumSubjectFieldValues"
import { SERVER_ERROR, errorMap, useSchemaForm } from "@/lib/forms"
import { INHERITED_MODALITY } from "@/lib/studyModalities"
import { subjectSchema } from "@silabos/shared/schemas/academic"
import type { CurriculumBuilderProps, CurriculumBuilderSubject, FixedSubjectField } from "@/types/academic"

type CurriculumVisualSubjectFormProps = {
  career: CurriculumBuilderProps["career"]
  modalityOptions: CurriculumBuilderProps["modalityOptions"]
  curriculum: CurriculumBuilderProps["curriculum"]
  fixedFields: FixedSubjectField[]
  subject: CurriculumBuilderSubject | null
  cycle: number
  position: number
  organizationUnits: CurriculumBuilderProps["organizationUnitOptions"]
  onCancel: () => void
  onSaved: (message?: string) => void
}

const schema = subjectSchema().pick({ code: true, nombre: true, organization_unit: true })

const errorKey = (field: FixedSubjectField): string => field.system_key

export function CurriculumVisualSubjectForm({ career, modalityOptions, curriculum, fixedFields, subject, cycle, position, organizationUnits, onCancel, onSaved }: CurriculumVisualSubjectFormProps) {
  const [modality, setModality] = useState(subject?.modality ?? INHERITED_MODALITY)
  const [generatesSyllabus, setGeneratesSyllabus] = useState(subject?.generates_syllabus ?? true)
  const form = useSchemaForm(schema, { defaultValues: { code: subject?.code ?? "", nombre: subject?.name ?? "", organization_unit: subject?.organization_unit ?? "" } })
  const { isSubmitting: processing } = form.formState
  const errorLists = errorMap(form.formState.errors)
  const errors: Record<string, string | undefined> = Object.fromEntries(Object.entries(errorLists).map(([key, list]) => [key === "root.server" ? "record" : key, list[0]]))
  const organizationUnit = String(form.watch("organization_unit") ?? "")
  const { updateValue, valueFor } = useCurriculumSubjectFieldValues(subject, fixedFields)
  const idPart = subject?.id ?? cycle

  const clearError = (key: string): void => form.clearErrors(key as "code")

  const clearInputError = (event: FormEvent<HTMLFormElement>): void => {
    if (event.target instanceof HTMLInputElement && event.target.name) clearError(event.target.name)
  }

  const submit = (event: FormEvent<HTMLFormElement>): Promise<void> => {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries())

    return form.handleSubmit(async () => {
      try {
        const result = subject ? await updateCareerRecord("asignatura", subject.id, payload) : await createCareerRecord("asignatura", { ...payload, malla_id: curriculum.id })
        onSaved(result.message)
      } catch (reason) {
        if (!(reason instanceof ApiError)) {
          form.setError(SERVER_ERROR, { type: "server", message: "No se pudo guardar la materia" })
          return
        }
        const shown = new Set(["code", "nombre", "organization_unit", "modality", "generates_syllabus", ...fixedFields.map(errorKey)])
        const entries = Object.entries(reason.errors).filter(([, list]) => list.length > 0)
        for (const [key, list] of entries) if (shown.has(key)) form.setError(key as "code", { type: "server", message: list[0] })
        const hidden = entries.find(([key]) => !shown.has(key))
        if (hidden !== undefined || entries.length === 0) form.setError(SERVER_ERROR, { type: "server", message: hidden?.[1][0] ?? reason.message })
      }
    })(event)
  }

  return (
    <form onSubmit={(event) => void submit(event)} onInput={clearInputError} noValidate>
      <input type="hidden" name="cycle" value={cycle} />
      <input type="hidden" name="position" value={position} />
      <FieldGroup className="gap-3">
        {errors.record ? (
          <Field data-invalid>
            <FieldError errors={[errors.record]} />
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Field data-invalid={Boolean(errors.code)}>
            <FieldLabel htmlFor={`visual-subject-code-${idPart}`} required>
              Código
            </FieldLabel>
            <Input id={`visual-subject-code-${idPart}`} {...form.register("code")} placeholder="Ej. SW-601" aria-required="true" aria-invalid={Boolean(errors.code)} />
            <FieldError errors={[errors.code]} />
          </Field>
          <Field data-invalid={Boolean(errors.nombre)}>
            <FieldLabel htmlFor={`visual-subject-name-${idPart}`} required>
              Nombre
            </FieldLabel>
            <Input id={`visual-subject-name-${idPart}`} {...form.register("nombre")} placeholder="Ej. Ingeniería de requisitos" aria-required="true" aria-invalid={Boolean(errors.nombre)} />
            <FieldError errors={[errors.nombre]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(errors.organization_unit)}>
          <FieldLabel htmlFor={`visual-subject-unit-${idPart}`} required>
            Unidad de organización curricular
          </FieldLabel>
          <input type="hidden" name="organization_unit" value={organizationUnit} />
          <Select
            value={organizationUnit}
            onValueChange={(value) => {
              form.setValue("organization_unit", value)
              clearError("organization_unit")
            }}
          >
            <SelectTrigger id={`visual-subject-unit-${idPart}`} aria-required="true" aria-invalid={Boolean(errors.organization_unit)}>
              <SelectValue placeholder="Seleccione la unidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {organizationUnits.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError errors={[errors.organization_unit]} />
        </Field>

        <Field data-invalid={Boolean(errors.modality)}>
          <FieldLabel htmlFor={`visual-subject-modality-${idPart}`}>Modalidad</FieldLabel>
          <input type="hidden" name="modality" value={modality === INHERITED_MODALITY ? "" : modality} />
          <Select
            value={modality}
            onValueChange={(value) => {
              setModality(value)
              clearError("modality")
            }}
          >
            <SelectTrigger id={`visual-subject-modality-${idPart}`} aria-invalid={Boolean(errors.modality)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={INHERITED_MODALITY}>Igual que la carrera ({career.modality?.label ?? "sin modalidad"})</SelectItem>
                {modalityOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError errors={[errors.modality]} />
        </Field>

        <Field orientation="horizontal" data-invalid={Boolean(errors.generates_syllabus)}>
          <input type="hidden" name="generates_syllabus" value={generatesSyllabus ? "1" : "0"} />
          <Switch
            id={`visual-subject-syllabus-${idPart}`}
            checked={generatesSyllabus}
            onCheckedChange={(value) => {
              setGeneratesSyllabus(value)
              clearError("generates_syllabus")
            }}
          />
          <FieldLabel htmlFor={`visual-subject-syllabus-${idPart}`}>Puede generar sílabos</FieldLabel>
          <FieldError errors={[errors.generates_syllabus]} />
        </Field>

        {fixedFields.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {fixedFields.map((field) => (
              <CurriculumSubjectFieldInput
                key={field.id}
                className="min-w-0 gap-1"
                field={field}
                inputId={`visual-subject-${idPart}-${field.id}`}
                value={valueFor(field)}
                error={errors[errorKey(field)]}
                onValueChange={(value) => {
                  updateValue(field, value)
                  clearError(errorKey(field))
                }}
              />
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" size="sm" variant="outline" disabled={processing} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={processing}>
            {processing ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" aria-hidden="true" />}
            {subject ? "Guardar" : "Agregar materia"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
