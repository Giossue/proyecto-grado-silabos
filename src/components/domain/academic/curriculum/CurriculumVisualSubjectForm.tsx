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
import { INHERITED_MODALITY } from "@/lib/studyModalities"
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

type Errors = Record<string, string | undefined>

const errorKey = (field: FixedSubjectField): string => field.system_key

export function CurriculumVisualSubjectForm({ career, modalityOptions, fixedFields, subject, cycle, position, organizationUnits, onCancel, onSaved }: CurriculumVisualSubjectFormProps) {
  const [modality, setModality] = useState(subject?.modality ?? INHERITED_MODALITY)
  const [organizationUnit, setOrganizationUnit] = useState(subject?.organization_unit ?? "")
  const [generatesSyllabus, setGeneratesSyllabus] = useState(subject?.generates_syllabus ?? true)
  const [errors, setErrors] = useState<Errors>({})
  const [processing, setProcessing] = useState(false)
  const { updateValue, valueFor } = useCurriculumSubjectFieldValues(subject, fixedFields)
  const idPart = subject?.id ?? cycle

  const clearError = (key: string): void => setErrors((current) => (current[key] === undefined ? current : { ...current, [key]: undefined }))

  const clearInputError = (event: FormEvent<HTMLFormElement>): void => {
    if (event.target instanceof HTMLInputElement && event.target.name) clearError(event.target.name)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries())
    setProcessing(true)
    setErrors({})
    try {
      const result = subject ? await updateCareerRecord("asignatura", subject.id, payload) : await createCareerRecord("asignatura", payload)
      onSaved(result.message)
    } catch (reason) {
      if (reason instanceof ApiError) {
        const next: Errors = Object.fromEntries(Object.entries(reason.errors).map(([key, values]) => [key, values[0]]))
        const shown = new Set(["code", "nombre", "organization_unit", "modality", "generates_syllabus", ...fixedFields.map(errorKey)])
        const hidden = Object.entries(next).find(([key]) => !shown.has(key))
        if (hidden !== undefined || Object.keys(next).length === 0) next.record ??= hidden?.[1] ?? reason.message
        setErrors(next)
      } else {
        setErrors({ record: "No se pudo guardar la materia" })
      }
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} onInput={clearInputError}>
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
            <Input id={`visual-subject-code-${idPart}`} name="code" defaultValue={subject?.code} placeholder="Ej. SW-601" aria-required="true" aria-invalid={Boolean(errors.code)} />
            <FieldError errors={[errors.code]} />
          </Field>
          <Field data-invalid={Boolean(errors.nombre)}>
            <FieldLabel htmlFor={`visual-subject-name-${idPart}`} required>
              Nombre
            </FieldLabel>
            <Input id={`visual-subject-name-${idPart}`} name="nombre" defaultValue={subject?.name} placeholder="Ej. Ingeniería de requisitos" aria-required="true" aria-invalid={Boolean(errors.nombre)} />
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
              setOrganizationUnit(value)
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
