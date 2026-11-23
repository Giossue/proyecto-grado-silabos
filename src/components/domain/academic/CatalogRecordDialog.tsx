"use client"

import { ArrowLeft, ArrowRight, Plus } from "lucide-react"
import { useEffect, useEffectEvent, useState, type FormEvent } from "react"
import { createAcademicRecord } from "@/api/academic"
import { ApiError } from "@/api/client"
import type { CatalogLibrary } from "@/api/libraryCatalog"
import { DatePicker } from "@/components/DatePicker"
import { FacultyLibraryChecks } from "@/components/domain/academic/FacultyLibraryChecks"
import { FacultyLogoField } from "@/components/domain/academic/FacultyLogoField"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { initialLibraries, librariesToStore, useCatalogLibraries } from "@/composables/useCatalogLibraries"
import { useInstitutionToday } from "@/composables/useInstitutionDate"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { cn } from "@/lib/utils"
import { VALIDATION_LIMITS } from "@/lib/validationLimits"
import type { AcademicStructureProps, GovernanceCatalogEntity } from "@/types/academic"

type RecordForm = { nombre: string; code: string; faculty_id: string; campus: string; modality: string; cycle_count: string; starts_on: string; ends_on: string }
type Errors = Record<string, string[]>

type CatalogRecordDialogProps = Pick<AcademicStructureProps, "options"> & {
  entity: GovernanceCatalogEntity
  disabled?: boolean
  showTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

const EMPTY_FORM: RecordForm = { nombre: "", code: "", faculty_id: "", campus: "", modality: "", cycle_count: "", starts_on: "", ends_on: "" }

const LABELS: Record<GovernanceCatalogEntity, { trigger: string; title: string; description: string; submit: string }> = {
  facultad: { trigger: "Nueva facultad", title: "Nueva facultad", description: "Complete los datos de la facultad", submit: "Crear facultad" },
  carrera: { trigger: "Nueva carrera", title: "Nueva carrera", description: "Complete los datos de la carrera", submit: "Crear carrera" },
  periodo: { trigger: "Nuevo periodo académico", title: "Nuevo periodo académico", description: "Complete los datos del periodo académico", submit: "Crear periodo" },
}

const filled = (...values: string[]): boolean => values.every((value) => String(value).trim() !== "")

export function CatalogRecordDialog({ options, entity, disabled = false, showTrigger = true, open, onOpenChange, onSaved }: CatalogRecordDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [form, setForm] = useState<RecordForm>(EMPTY_FORM)
  const [logo, setLogo] = useState<File | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [forward, setForward] = useState(true)
  const [chosenLibraries, setChosenLibraries] = useState<string[]>([])
  const { libraries: koha, error: kohaError, load: loadKoha } = useCatalogLibraries()
  const minimumPeriodDate = useInstitutionToday()
  const minimumPeriodEndDate = form.starts_on || minimumPeriodDate
  const labels = LABELS[entity]

  useOpened(isOpen, () => {
    setForm(EMPTY_FORM)
    setLogo(null)
    setErrors({})
    setStep(1)
    setForward(true)
    setChosenLibraries([])
  })

  const markLibraries = useEffectEvent((found: CatalogLibrary[] | null): void => {
    if (found !== null) setChosenLibraries(initialLibraries([], found))
  })

  useEffect(() => {
    if (!isOpen || entity !== "facultad") return
    void loadKoha().then(markLibraries)
  }, [isOpen, entity, loadKoha])

  const goTo = (target: 1 | 2): void => {
    setForward(target > step)
    setStep(target)
  }

  const missingRequired = !{
    facultad: filled(form.nombre, form.campus),
    carrera: filled(form.faculty_id, form.modality, form.nombre, form.code, form.cycle_count),
    periodo: filled(form.starts_on, form.ends_on),
  }[entity]

  const setField = (key: keyof RecordForm, value: string): void => {
    const changed: (keyof RecordForm)[] = [key]
    const next = { ...form, [key]: value }
    if (key === "starts_on" && value && next.ends_on && next.ends_on < value) {
      next.ends_on = ""
      changed.push("ends_on")
    }
    setForm(next)
    setErrors((current) => {
      if (!changed.some((name) => name in current)) return current
      return Object.fromEntries(Object.entries(current).filter(([name]) => !changed.includes(name as keyof RecordForm)))
    })
  }

  const logoValidationError = (message: string | null): void => {
    setErrors((current) => {
      const next = { ...current }
      if (message) next.logo = [message]
      else delete next.logo
      return next
    })
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (disabled) return
    setErrors({})
    if (entity === "facultad" && !logo) {
      setErrors({ logo: ["Cargue el logo de la facultad"] })
      return
    }
    if (entity === "facultad" && step === 1) {
      goTo(2)
      return
    }
    if (entity === "facultad" && koha !== null && chosenLibraries.length === 0) {
      setErrors({ catalog_libraries: ["Marque al menos una biblioteca"] })
      return
    }
    setProcessing(true)
    const payload = new FormData()
    for (const [key, value] of Object.entries(form)) {
      if (key === "code" && entity !== "carrera") continue
      payload.set(key, String(value))
    }
    if (logo) payload.set("logo", logo)
    const libraries = entity === "facultad" && koha !== null ? librariesToStore(chosenLibraries, koha) : []
    if (libraries.length > 0) payload.set("catalog_libraries", JSON.stringify(libraries))
    try {
      const result = await createAcademicRecord(entity, payload)
      setOpen(false)
      onSaved?.(result.message)
    } catch (reason) {
      const received = reason instanceof ApiError ? reason.errors : {}
      setErrors(received)
      if (entity === "facultad") goTo(Object.keys(received).some((key) => key.startsWith("catalog_libraries")) ? 2 : 1)
    } finally {
      setProcessing(false)
    }
  }

  const stepClass = cn("animate-in fade-in-0 duration-200 motion-reduce:animate-none", forward ? "slide-in-from-right-8" : "slide-in-from-left-8")

  const selectField = (key: keyof RecordForm, id: string, label: string, placeholder: string, items: { value: string; label: string }[]) => (
    <Field data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={id} required>
        {label}
      </FieldLabel>
      <Select value={form[key]} onValueChange={(value) => setField(key, value)} required>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError errors={errors[key]} />
    </Field>
  )

  const nameField = (
    <Field data-invalid={Boolean(errors.nombre)}>
      <FieldLabel htmlFor="catalog-name" required>
        Nombre
      </FieldLabel>
      <Input id="catalog-name" value={form.nombre} onChange={(event) => setField("nombre", event.target.value)} aria-required="true" />
      <FieldError errors={errors.nombre} />
    </Field>
  )

  return (
    <FormModal
      open={isOpen}
      onOpenChange={setOpen}
      disabled={disabled}
      showTrigger={showTrigger}
      triggerLabel={labels.trigger}
      title={labels.title}
      description={labels.description}
    >
      {({ close }) => (
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            {entity === "facultad" && step === 1 ? (
              <FieldGroup key="datos" className={stepClass}>
                {nameField}
                {selectField("campus", "catalog-campus", "Campus", "Seleccione el campus de la facultad", options.campusOptions)}
                <Field data-invalid={Boolean(errors.logo)}>
                  <FieldLabel htmlFor="faculty-logo" required>
                    Logo de la facultad
                  </FieldLabel>
                  <FacultyLogoField
                    value={logo}
                    onValueChange={setLogo}
                    inputId="faculty-logo"
                    required
                    disabled={processing}
                    invalid={Boolean(errors.logo)}
                    onValidationError={logoValidationError}
                  />
                  <FieldDescription>PNG, JPG o WebP. Se ajusta a 600 × 180 px con fondo transparente.</FieldDescription>
                  <FieldError errors={errors.logo} />
                </Field>
              </FieldGroup>
            ) : null}
            {entity === "facultad" && step === 2 ? (
              <div key="bibliotecas" className={stepClass}>
                <FacultyLibraryChecks
                  value={chosenLibraries}
                  onValueChange={setChosenLibraries}
                  libraries={koha}
                  error={kohaError}
                  idPrefix="new-library"
                  invalid={errors.catalog_libraries}
                />
              </div>
            ) : null}
            {entity === "carrera" ? (
              <>
                {selectField(
                  "faculty_id",
                  "catalog-faculty",
                  "Facultad",
                  "Seleccione una facultad",
                  options.faculties.map((item) => ({ value: item.id, label: item.nombre ?? "" })),
                )}
                {selectField("modality", "catalog-modality", "Modalidad", "Seleccione la modalidad aprobada", options.modalityOptions)}
                {nameField}
                <div className="grid grid-cols-2 items-start gap-4">
                  <Field data-invalid={Boolean(errors.code)}>
                    <FieldLabel htmlFor="catalog-code" required>
                      Código de carrera
                    </FieldLabel>
                    <Input id="catalog-code" value={form.code} onChange={(event) => setField("code", event.target.value)} aria-required="true" />
                    <FieldError errors={errors.code} />
                  </Field>
                  <Field data-invalid={Boolean(errors.cycle_count)}>
                    <FieldLabel htmlFor="catalog-cycle-count" required>
                      Cantidad de ciclos
                    </FieldLabel>
                    <Input
                      id="catalog-cycle-count"
                      value={form.cycle_count}
                      onChange={(event) => setField("cycle_count", event.target.value)}
                      type="number"
                      min={1}
                      max={VALIDATION_LIMITS.cycleCount}
                      step={1}
                      aria-required="true"
                    />
                    <FieldError errors={errors.cycle_count} />
                  </Field>
                </div>
              </>
            ) : null}
            {entity === "periodo" ? (
              <div className="grid grid-cols-2 items-start gap-4">
                <Field data-invalid={Boolean(errors.starts_on)}>
                  <FieldLabel htmlFor="catalog-starts-on" required>
                    Fecha de inicio
                  </FieldLabel>
                  <DatePicker id="catalog-starts-on" value={form.starts_on} onValueChange={(value) => setField("starts_on", value)} ariaInvalid={Boolean(errors.starts_on)} required />
                  <FieldError errors={errors.starts_on} />
                </Field>
                <Field data-invalid={Boolean(errors.ends_on)}>
                  <FieldLabel htmlFor="catalog-ends-on" required>
                    Fecha de fin
                  </FieldLabel>
                  <DatePicker
                    id="catalog-ends-on"
                    value={form.ends_on}
                    onValueChange={(value) => setField("ends_on", value)}
                    minValue={minimumPeriodEndDate}
                    ariaInvalid={Boolean(errors.ends_on)}
                    required
                  />
                  <FieldError errors={errors.ends_on} />
                </Field>
              </div>
            ) : null}
            {entity === "facultad" ? (
              <DialogFooter className="absolute inset-x-0 bottom-0 mx-0 flex-col bg-card p-4 pb-(--safe-footer-inset) sm:flex-col sm:justify-start">
                <Field orientation="horizontal" className="justify-end">
                  {step === 1 ? (
                    <Button type="button" variant="outline" onClick={close}>
                      Cancelar
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => goTo(1)}>
                      <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                      Atrás
                    </Button>
                  )}
                  {step === 1 ? (
                    <Button type="submit" disabled={missingRequired}>
                      Siguiente
                      <ArrowRight data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={processing || (koha !== null && chosenLibraries.length === 0)}>
                      {processing ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" aria-hidden="true" />}
                      {labels.submit}
                    </Button>
                  )}
                </Field>
              </DialogFooter>
            ) : (
              <FormDialogActions close={close} processing={processing} disabled={missingRequired} icon={Plus} label={labels.submit} />
            )}
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
