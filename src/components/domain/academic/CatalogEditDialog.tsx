"use client"

import { Check, Pencil, X } from "lucide-react"
import { useEffect, useEffectEvent, useState, type FormEvent } from "react"
import { updateAcademicRecord } from "@/api/academic"
import { ApiError } from "@/api/client"
import type { CatalogLibrary } from "@/api/libraryCatalog"
import { DatePicker } from "@/components/DatePicker"
import { FacultyLibraryChecks } from "@/components/domain/academic/FacultyLibraryChecks"
import { FacultyLogoField } from "@/components/domain/academic/FacultyLogoField"
import { DialogActions, type DialogAction } from "@/components/domain/DialogActions"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { initialLibraries, librariesToStore, sameLibraries, useCatalogLibraries } from "@/composables/useCatalogLibraries"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { requestPurgeConfirmation } from "@/composables/usePurgeConfirmation"
import type { CatalogRecord, GovernanceCatalogEntity } from "@/types/academic"

type Option = { value: string; label: string }
type EditForm = { nombre: string; code: string; faculty_id: string; campus: string; modality: string; starts_on: string; ends_on: string }
type Errors = Record<string, string[]>

type CatalogEditDialogProps = {
  entity: GovernanceCatalogEntity
  recordId: string
  recordName: string
  recordCode?: string | null
  facultyId?: string | null
  modality?: string | null
  campus?: string | null
  startsOn?: string | null
  endsOn?: string | null
  modalityOptions: Option[]
  faculties: CatalogRecord[]
  campusOptions: Option[]
  lockReason?: string | null
  logoUrl?: string | null
  showTrigger?: boolean
  actions?: DialogAction[]
  catalogLibraries?: string[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
  onAction?: (key: string) => void
}

const NO_ACTIONS: DialogAction[] = []
const NO_LIBRARIES: string[] = []
const FIELD_ERRORS = ["nombre", "code", "faculty_id", "campus", "modality", "starts_on", "ends_on", "logo", "catalog_libraries"]
const ENTITY_LABELS: Record<GovernanceCatalogEntity, string> = { facultad: "facultad", carrera: "carrera", periodo: "periodo académico" }
const LOGO_HINT = "PNG, JPG o WebP. Se ajusta a 600 × 180 px con fondo transparente"

export function CatalogEditDialog({
  entity,
  recordId,
  recordName,
  recordCode,
  facultyId,
  modality,
  campus,
  startsOn,
  endsOn,
  modalityOptions,
  faculties,
  campusOptions,
  lockReason,
  logoUrl,
  showTrigger = true,
  actions = NO_ACTIONS,
  catalogLibraries = NO_LIBRARIES,
  open,
  onOpenChange,
  onSaved,
  onAction,
}: CatalogEditDialogProps) {
  const initialForm = (): EditForm => ({
    nombre: recordName,
    code: recordCode ?? "",
    faculty_id: facultyId ?? "",
    campus: campus ?? "",
    modality: modality ?? "",
    starts_on: startsOn ?? "",
    ends_on: endsOn ?? "",
  })
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [logo, setLogo] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [viewing, setViewing] = useState(true)
  const [form, setForm] = useState<EditForm>(initialForm)
  const [tab, setTab] = useState<"datos" | "bibliotecas">("datos")
  const [chosenLibraries, setChosenLibraries] = useState<string[]>(catalogLibraries)
  const [openedLibraries, setOpenedLibraries] = useState<string[]>(catalogLibraries)
  const { libraries: koha, error: kohaError, load: loadKoha } = useCatalogLibraries()

  const locked = Boolean(lockReason)
  const readOnly = locked || viewing
  const currentLogo = Boolean(logoUrl) && !removeLogo
  const entityLabel = ENTITY_LABELS[entity]
  const capitalizedLabel = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)
  const facultyOptions = faculties.filter((faculty) => faculty.activo || faculty.id === facultyId)
  const noLibraryChosen = (koha?.length ?? 0) > 0 && chosenLibraries.length === 0
  const logoRequired = Boolean(logoUrl) && removeLogo

  const reset = (): void => {
    setViewing(true)
    setForm(initialForm())
    setLogo(null)
    setRemoveLogo(false)
    setErrors({})
    setTab("datos")
    setChosenLibraries([...catalogLibraries])
    setOpenedLibraries([...catalogLibraries])
  }
  useOpened(isOpen, reset, true)
  const markLibraries = useEffectEvent((found: CatalogLibrary[] | null): void => {
    if (found === null) return
    const initial = initialLibraries(catalogLibraries, found)
    setChosenLibraries(initial)
    setOpenedLibraries([...initial])
  })

  useEffect(() => {
    if (!isOpen || entity !== "facultad") return
    void loadKoha().then(markLibraries)
  }, [isOpen, entity, loadKoha])

  const generalKey = Object.keys(errors).find((name) => !FIELD_ERRORS.some((field) => name === field || name.startsWith(`${field}.`)) && !name.startsWith("purge_"))
  const generalError = generalKey === undefined ? null : (errors[generalKey]?.[0] ?? null)

  const initial = initialForm()
  const unchanged =
    (Object.keys(initial) as (keyof EditForm)[]).every((key) => form[key] === initial[key]) &&
    logo === null &&
    !removeLogo &&
    (entity !== "facultad" || sameLibraries(chosenLibraries, openedLibraries))

  const setField = (key: keyof EditForm, value: string): void => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
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

  const librariesToSave = (): string[] | null => {
    if (koha === null) return null
    const stored = librariesToStore(chosenLibraries, koha)

    return sameLibraries(stored, catalogLibraries) ? null : stored
  }

  const submit = async (confirmPurge = false): Promise<void> => {
    if (readOnly) return
    setErrors({})
    if (entity === "facultad" && logoRequired && !logo) {
      setErrors({ logo: ["Cargue el logo nuevo de la facultad"] })
      setTab("datos")
      return
    }
    if (entity === "facultad" && noLibraryChosen) {
      setErrors({ catalog_libraries: ["Marque al menos una biblioteca"] })
      setTab("bibliotecas")
      return
    }
    setProcessing(true)
    const payload = new FormData()
    for (const [key, value] of Object.entries(form)) {
      if (key === "code" && entity !== "carrera") continue
      payload.set(key, String(value))
    }
    if (logo) payload.set("logo", logo)
    const libraries = entity === "facultad" ? librariesToSave() : null
    if (libraries !== null) payload.set("catalog_libraries", JSON.stringify(libraries))
    if (confirmPurge) payload.set("confirm_purge", "1")
    try {
      const result = await updateAcademicRecord(entity, recordId, payload)
      setOpen(false)
      onSaved?.(result.message)
    } catch (reason) {
      const received = reason instanceof ApiError ? reason.errors : {}
      setErrors(received)
      if (entity === "facultad") setTab(Object.keys(received).some((key) => key.startsWith("catalog_libraries")) ? "bibliotecas" : "datos")
      const purgeMessage = received.purge_required?.[0]
      if (purgeMessage) {
        requestPurgeConfirmation(purgeMessage, Number(received.purge_count?.[0] ?? 0), () => void submit(true), undefined, received.purge_mode?.[0])
      }
    } finally {
      setProcessing(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void submit()
  }

  const selectField = (key: keyof EditForm, id: string, label: string, placeholder: string, options: Option[]) => (
    <Field data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={id} required>
        {label}
      </FieldLabel>
      <Select value={form[key]} onValueChange={(value) => setField(key, value)} required disabled={readOnly}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((item) => (
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
      <FieldLabel htmlFor={`edit-name-${recordId}`} required>
        Nombre
      </FieldLabel>
      <Input id={`edit-name-${recordId}`} value={form.nombre} onChange={(event) => setField("nombre", event.target.value)} aria-required="true" disabled={readOnly} />
      <FieldError errors={errors.nombre} />
    </Field>
  )

  return (
    <FormModal
      open={isOpen}
      onOpenChange={setOpen}
      triggerLabel="Editar"
      title={viewing ? capitalizedLabel : `Editar ${entityLabel}`}
      description={viewing ? "Datos registrados" : "Cambie los datos y guarde"}
      showTrigger={showTrigger}
    >
      {({ close }) => (
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {generalError ? (
              <Alert variant="destructive">
                <AlertDescription>{generalError}</AlertDescription>
              </Alert>
            ) : null}
            {entity === "facultad" ? (
              <Tabs value={tab} onValueChange={(value) => setTab(value as "datos" | "bibliotecas")} className="gap-4">
                <TabsList aria-label="Secciones de la facultad">
                  <TabsTrigger value="datos">Datos</TabsTrigger>
                  <TabsTrigger value="bibliotecas">Bibliotecas</TabsTrigger>
                </TabsList>
                <TabsContent value="datos" className="flex flex-col gap-7">
                  {nameField}
                  {selectField("campus", `edit-campus-${recordId}`, "Campus", "Seleccione el campus de la facultad", campusOptions)}
                  <Field data-invalid={Boolean(errors.logo)}>
                    <FieldLabel htmlFor={`edit-faculty-logo-${recordId}`} required={logoRequired}>
                      Logo de la facultad
                    </FieldLabel>
                    {currentLogo ? (
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoUrl ?? ""} alt="Logo actual de la facultad" className="h-24 min-w-0 flex-1 rounded-md border bg-background object-contain p-2" />
                        <IconTooltip label="Quitar logo">
                          <Button type="button" variant="outline" size="icon-sm" aria-label="Quitar logo" disabled={processing || readOnly} onClick={() => setRemoveLogo(true)}>
                            <X aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                      </div>
                    ) : (
                      <FacultyLogoField
                        value={logo}
                        onValueChange={setLogo}
                        inputId={`edit-faculty-logo-${recordId}`}
                        disabled={processing || readOnly}
                        invalid={Boolean(errors.logo)}
                        required={logoRequired}
                        onValidationError={logoValidationError}
                      />
                    )}
                    {!currentLogo ? <FieldDescription>{LOGO_HINT}</FieldDescription> : null}
                    <FieldError errors={errors.logo} />
                  </Field>
                </TabsContent>
                <TabsContent value="bibliotecas">
                  <FacultyLibraryChecks
                    value={chosenLibraries}
                    onValueChange={setChosenLibraries}
                    libraries={koha}
                    error={kohaError}
                    saved={catalogLibraries}
                    idPrefix={`edit-library-${recordId}`}
                    invalid={errors.catalog_libraries}
                    disabled={readOnly}
                  />
                </TabsContent>
              </Tabs>
            ) : null}
            {entity === "carrera" ? (
              <>
                {selectField(
                  "faculty_id",
                  `edit-faculty-${recordId}`,
                  "Facultad",
                  "Seleccione una facultad",
                  facultyOptions.map((faculty) => ({ value: faculty.id, label: faculty.activo ? faculty.nombre : `${faculty.nombre} (inactiva)` })),
                )}
                {selectField("modality", `edit-modality-${recordId}`, "Modalidad", "Seleccione la modalidad aprobada", modalityOptions)}
                {nameField}
                <Field data-invalid={Boolean(errors.code)}>
                  <FieldLabel htmlFor={`edit-code-${recordId}`} required>
                    Código de carrera
                  </FieldLabel>
                  <Input id={`edit-code-${recordId}`} value={form.code} onChange={(event) => setField("code", event.target.value)} aria-required="true" disabled={readOnly} />
                  <FieldError errors={errors.code} />
                </Field>
              </>
            ) : null}
            {entity === "periodo" ? (
              <div className="grid grid-cols-2 items-start gap-4">
                <Field data-invalid={Boolean(errors.starts_on)}>
                  <FieldLabel htmlFor={`edit-starts-on-${recordId}`} required>
                    Fecha de inicio
                  </FieldLabel>
                  <DatePicker id={`edit-starts-on-${recordId}`} value={form.starts_on} onValueChange={(value) => setField("starts_on", value)} required disabled={readOnly} />
                  <FieldError errors={errors.starts_on} />
                </Field>
                <Field data-invalid={Boolean(errors.ends_on)}>
                  <FieldLabel htmlFor={`edit-ends-on-${recordId}`} required>
                    Fecha de fin
                  </FieldLabel>
                  <DatePicker id={`edit-ends-on-${recordId}`} value={form.ends_on} onValueChange={(value) => setField("ends_on", value)} required disabled={readOnly} />
                  <FieldError errors={errors.ends_on} />
                </Field>
              </div>
            ) : null}
            {viewing ? (
              <DialogFooter className="absolute inset-x-0 bottom-0 mx-0 flex-col bg-card p-4 pb-(--safe-footer-inset) sm:flex-col sm:justify-start">
                <Field orientation="horizontal" className="flex-wrap justify-end">
                  {locked ? <DialogActions actions={actions} onSelect={(key) => onAction?.(key)} /> : null}
                  <Button type="button" variant="outline" onClick={close}>
                    Cerrar
                  </Button>
                  <Button type="button" disabled={locked} onClick={() => setViewing(false)}>
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    Editar
                  </Button>
                </Field>
              </DialogFooter>
            ) : (
              <FormDialogActions
                close={reset}
                processing={processing}
                disabled={unchanged || locked || (entity === "facultad" && noLibraryChosen)}
                icon={Check}
                label="Guardar cambios"
                secondary={<DialogActions actions={actions} onSelect={(key) => onAction?.(key)} />}
              />
            )}
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
