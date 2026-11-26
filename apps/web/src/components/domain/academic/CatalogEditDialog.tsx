"use client"

import { Check, Pencil, RefreshCw } from "lucide-react"
import { useEffect, useEffectEvent, useState, type FormEvent } from "react"
import { updateAcademicRecord } from "@/api/academic"
import type { CatalogLibrary } from "@/api/libraryCatalog"
import { DatePicker } from "@/components/DatePicker"
import { FacultyLibraryChecks } from "@/components/domain/academic/FacultyLibraryChecks"
import { FacultyLogoField } from "@/components/domain/academic/FacultyLogoField"
import { FacultyLogoPreview } from "@/components/domain/academic/FacultyLogoPreview"
import { DialogActions, type DialogAction } from "@/components/domain/DialogActions"
import { FormDialogActions, FormDialogFooter } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { initialLibraries, librariesToStore, sameLibraries, useCatalogLibraries } from "@/composables/useCatalogLibraries"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { requestPurgeConfirmation } from "@/composables/usePurgeConfirmation"
import { applyApiErrors, errorMap, useSchemaForm } from "@/lib/forms"
import { careerSchema, facultySchema, periodSchema } from "@silabos/shared/schemas/academic"
import type { CatalogRecord, GovernanceCatalogEntity } from "@/types/academic"

type Option = { value: string; label: string }
type EditForm = { nombre: string; code: string; faculty_id: string; modality: string; starts_on: string; ends_on: string }

type CatalogEditDialogProps = {
  entity: GovernanceCatalogEntity
  recordId: string
  recordName: string
  recordCode?: string | null
  facultyId?: string | null
  modality?: string | null
  startsOn?: string | null
  endsOn?: string | null
  modalityOptions: Option[]
  faculties: CatalogRecord[]
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
const FIELD_ERRORS = ["nombre", "code", "faculty_id", "modality", "starts_on", "ends_on", "logo", "catalog_libraries"]
const ENTITY_LABELS: Record<GovernanceCatalogEntity, string> = { facultad: "facultad", carrera: "carrera", periodo: "periodo académico" }
const editSchema = (entity: GovernanceCatalogEntity, values: EditForm) =>
  entity === "facultad" ? facultySchema({ updating: true }) : entity === "carrera" ? careerSchema({ updating: true }) : periodSchema({ startsOn: values.starts_on, creating: false })

const LOGO_HINT = "PNG, JPG o WebP. Se ajusta a 600 × 180 px con fondo transparente"

export function CatalogEditDialog({
  entity,
  recordId,
  recordName,
  recordCode,
  facultyId,
  modality,
  startsOn,
  endsOn,
  modalityOptions,
  faculties,
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
    modality: modality ?? "",
    starts_on: startsOn ?? "",
    ends_on: endsOn ?? "",
  })
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const editForm = useSchemaForm((values) => editSchema(entity, values as EditForm), { defaultValues: initialForm() })
  const errors = errorMap(editForm.formState.errors)
  const [logo, setLogo] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [viewing, setViewing] = useState(true)
  const watched = editForm.watch()
  const form: EditForm = { ...initialForm(), ...(watched as Partial<EditForm>) }
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
    editForm.reset(initialForm())
    setLogo(null)
    setRemoveLogo(false)
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
    editForm.setValue(key, value)
    editForm.clearErrors(key)
  }

  const logoValidationError = (message: string | null): void => {
    if (message) editForm.setError("logo" as keyof EditForm, { type: "client", message })
    else editForm.clearErrors("logo" as keyof EditForm)
  }

  const librariesToSave = (): string[] | null => {
    if (koha === null) return null
    const stored = librariesToStore(chosenLibraries, koha)

    return sameLibraries(stored, catalogLibraries) ? null : stored
  }

  const save = async (confirmPurge: boolean): Promise<void> => {
    setProcessing(true)
    const payload = new FormData()
    for (const [key, value] of Object.entries(editForm.getValues())) {
      if (key === "code" && entity !== "carrera") continue
      payload.set(key, String(value ?? ""))
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
      const received = applyApiErrors(editForm.setError, reason, { fallback: "No se pudo guardar" })
      if (entity === "facultad") setTab(Object.keys(received).some((key) => key.startsWith("catalog_libraries")) ? "bibliotecas" : "datos")
      const purgeMessage = received.purge_required?.[0]
      if (purgeMessage) {
        requestPurgeConfirmation(purgeMessage, Number(received.purge_count?.[0] ?? 0), () => void submit(true), undefined, received.purge_mode?.[0])
      }
    } finally {
      setProcessing(false)
    }
  }

  const submit = async (confirmPurge = false): Promise<void> => {
    if (readOnly) return
    editForm.clearErrors()
    if (entity === "facultad" && logoRequired && !logo) {
      editForm.setError("logo" as keyof EditForm, { type: "client", message: "Cargue el logo nuevo de la facultad" })
      setTab("datos")
      return
    }
    if (entity === "facultad" && noLibraryChosen) {
      editForm.setError("catalog_libraries" as keyof EditForm, { type: "client", message: "Marque al menos una biblioteca" })
      setTab("bibliotecas")
      return
    }
    await editForm.handleSubmit(
      () => save(confirmPurge),
      () => {
        if (entity === "facultad") setTab("datos")
      },
    )()
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
        <form onSubmit={onSubmit} noValidate>
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
                  <Field data-invalid={Boolean(errors.logo)}>
                    <FieldLabel htmlFor={`edit-faculty-logo-${recordId}`} required={logoRequired}>
                      Logo de la facultad
                    </FieldLabel>
                    {currentLogo ? (
                      <FacultyLogoPreview
                        url={logoUrl ?? ""}
                        name={recordName}
                        action={
                          !readOnly ? (
                            <Button type="button" variant="outline" size="sm" className="bg-card/90" disabled={processing} onClick={() => setRemoveLogo(true)}>
                              <RefreshCw data-icon="inline-start" aria-hidden="true" />
                              Reemplazar
                            </Button>
                          ) : null
                        }
                      />
                    ) : (
                      <>
                        <FacultyLogoField
                          value={logo}
                          onValueChange={setLogo}
                          inputId={`edit-faculty-logo-${recordId}`}
                          disabled={processing || readOnly}
                          invalid={Boolean(errors.logo)}
                          required={logoRequired}
                          onValidationError={logoValidationError}
                        />
                        {logoUrl && !readOnly ? (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto self-start p-0"
                            disabled={processing}
                            onClick={() => {
                              setLogo(null)
                              setRemoveLogo(false)
                            }}
                          >
                            Mantener el logo actual
                          </Button>
                        ) : null}
                      </>
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
              <FormDialogFooter>
                {locked ? <DialogActions actions={actions} onSelect={(key) => onAction?.(key)} /> : null}
                <Button type="button" variant="outline" onClick={close}>
                  Cerrar
                </Button>
                <Button type="button" disabled={locked} onClick={() => setViewing(false)}>
                  <Pencil data-icon="inline-start" aria-hidden="true" />
                  Editar
                </Button>
              </FormDialogFooter>
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
