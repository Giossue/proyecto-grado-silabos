"use client"

import { ListChecks, X } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { applySubjectProfileBulk, getSubjectProfile, type ScheduledSubjects, type SubjectProfileBulkSummary } from "@/api/career-academics"
import { ApiError } from "@/api/client"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { withoutFinalPeriod } from "@/lib/utils"
import { careerAcademicKeys } from "@/queries/careerAcademics"
import type { SubjectProfileBulkAction } from "@silabos/shared/schemas/imports"

type Subject = ScheduledSubjects["options"]["activeSubjects"][number]
type Scope = "pendientes" | "elegidos"

type CareerProjectBulkActionsProps = {
  subjects: Subject[]
  lockReason: string | null
  onApplied: (message: string) => void
  onClear: () => void
}

const ACTIONS: Array<{ value: SubjectProfileBulkAction; title: string; description: string }> = [
  { value: "plantilla", title: "Usar el texto de la plantilla", description: "El campo queda definido con el texto de la plantilla tal cual" },
  { value: "docente", title: "Que lo escriba el docente", description: "El campo queda como «Texto libre» para el docente" },
]
const NO_FIELDS = "Elija al menos un campo"

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`
const pendingOf = (subject: Subject): number => (subject.profile_complete ? 0 : Math.max((subject.profile_total ?? 0) - (subject.profile_filled ?? 0), 0))

export const bulkSummary = ({ applied, skipped, not_applicable: notApplicable }: SubjectProfileBulkSummary): string =>
  [
    applied === 0 ? "No se definió ningún campo" : applied === 1 ? "Se definió 1 campo" : `Se definieron ${applied} campos`,
    skipped ? (skipped === 1 ? "1 ya estaba definido" : `${skipped} ya estaban definidos`) : null,
    notApplicable ? (notApplicable === 1 ? "1 no admite esta acción" : `${notApplicable} no admiten esta acción`) : null,
  ]
    .filter(Boolean)
    .join(". ")

export function CareerProjectBulkActions({ subjects, lockReason, onApplied, onClear }: CareerProjectBulkActionsProps) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<SubjectProfileBulkAction>("plantilla")
  const [scope, setScope] = useState<Scope>("pendientes")
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldsMissing, setFieldsMissing] = useState(false)
  const firstField = useRef<HTMLButtonElement>(null)
  const sample = subjects[0]?.id ?? ""
  const profile = useQuery({ queryKey: careerAcademicKeys.subjectProfileFields(sample), queryFn: () => getSubjectProfile(sample), enabled: open && sample !== "" })
  const fields = (profile.data?.fields ?? []).toSorted((first, second) => (first.position ?? 0) - (second.position ?? 0))
  const pending = subjects.reduce((total, subject) => total + pendingOf(subject), 0)
  const selected = `${plural(subjects.length, "materia seleccionada", "materias seleccionadas")}`

  const openDialog = (): void => {
    setAction("plantilla")
    setScope("pendientes")
    setChosen([])
    setError(null)
    setFieldsMissing(false)
    setOpen(true)
  }

  const toggleField = (fieldId: string, checked: boolean): void => {
    setFieldsMissing(false)
    setChosen((current) => (checked ? [...current, fieldId] : current.filter((item) => item !== fieldId)))
  }

  const apply = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    const fieldIds = scope === "elegidos" ? fields.filter((field) => chosen.includes(field.id)).map((field) => field.id) : []
    if (scope === "elegidos" && fieldIds.length === 0) {
      setFieldsMissing(true)
      firstField.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const summary = await applySubjectProfileBulk({ subjects: subjects.map((subject) => subject.id), fields: fieldIds, action })
      setOpen(false)
      onApplied(bulkSummary(summary))
      onClear()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo aplicar la acción masiva")
    } finally {
      setBusy(false)
    }
  }

  const trigger = (
    <Button type="button" size="sm" variant="outline" disabled={Boolean(lockReason) || busy} onClick={openDialog}>
      {busy ? <Spinner data-icon="inline-start" /> : <ListChecks data-icon="inline-start" aria-hidden="true" />}
      Acciones masivas
    </Button>
  )

  return (
    <Card className="flex-row flex-wrap items-center gap-2 px-3 py-2" role="region" aria-label="Acciones masivas del proyecto de carrera">
      <span className="text-sm font-medium">{selected}</span>
      {lockReason ? (
        <>
          <IconTooltip label={withoutFinalPeriod(lockReason)}>
            <span className="inline-flex" tabIndex={0} aria-describedby="career-project-bulk-lock">
              {trigger}
            </span>
          </IconTooltip>
          <span id="career-project-bulk-lock" className="sr-only">
            {lockReason}
          </span>
        </>
      ) : (
        trigger
      )}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClear}>
        <X data-icon="inline-start" aria-hidden="true" />
        Quitar selección
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acciones masivas</DialogTitle>
            <DialogDescription>
              {selected} con {plural(pending, "campo sin definir", "campos sin definir")}. Solo se tocan los campos sin definir; los que ya están definidos no cambian
            </DialogDescription>
          </DialogHeader>
          <form className="contents" onSubmit={(event) => void apply(event)} noValidate>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup>
              <FieldSet>
                <FieldLegend variant="label">Acción</FieldLegend>
                <RadioGroup value={action} onValueChange={(value) => setAction(value as SubjectProfileBulkAction)}>
                  {ACTIONS.map((item) => (
                    <FieldLabel key={item.value} htmlFor={`career-project-bulk-${item.value}`}>
                      <Field orientation="horizontal">
                        <RadioGroupItem value={item.value} id={`career-project-bulk-${item.value}`} />
                        <FieldContent>
                          <FieldTitle>{item.title}</FieldTitle>
                          <FieldDescription>{item.description}</FieldDescription>
                        </FieldContent>
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Campos</FieldLegend>
                <RadioGroup value={scope} onValueChange={(value) => setScope(value as Scope)}>
                  <FieldLabel htmlFor="career-project-bulk-pending">
                    <Field orientation="horizontal">
                      <RadioGroupItem value="pendientes" id="career-project-bulk-pending" />
                      <FieldTitle>Todos los campos sin definir</FieldTitle>
                    </Field>
                  </FieldLabel>
                  <FieldLabel htmlFor="career-project-bulk-chosen">
                    <Field orientation="horizontal">
                      <RadioGroupItem value="elegidos" id="career-project-bulk-chosen" />
                      <FieldTitle>Elegir campos</FieldTitle>
                    </Field>
                  </FieldLabel>
                </RadioGroup>
                {scope === "elegidos" ? (
                  <Field data-invalid={fieldsMissing}>
                    {profile.isPending ? (
                      <Spinner aria-label="Cargando los campos" />
                    ) : profile.isError ? (
                      <Alert variant="destructive">
                        <AlertDescription>No se pudieron cargar los campos</AlertDescription>
                      </Alert>
                    ) : (
                      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                        {fields.map((field, position) => (
                          <Field key={field.id} orientation="horizontal">
                            <Checkbox
                              ref={position === 0 ? firstField : undefined}
                              id={`career-project-bulk-field-${field.id}`}
                              aria-label={field.label}
                              aria-invalid={fieldsMissing}
                              checked={chosen.includes(field.id)}
                              onCheckedChange={(checked) => toggleField(field.id, checked === true)}
                            />
                            <FieldLabel htmlFor={`career-project-bulk-field-${field.id}`} className="font-normal">
                              {field.label}
                            </FieldLabel>
                          </Field>
                        ))}
                      </div>
                    )}
                    {fieldsMissing ? <FieldError>{NO_FIELDS}</FieldError> : null}
                  </Field>
                ) : null}
              </FieldSet>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Aplicar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
