"use client"

import { useQuery } from "@tanstack/react-query"
import { CircleCheck, PencilLine } from "lucide-react"
import { useState, type FormEvent } from "react"
import { academicCareerScope } from "@/api/careerScope"
import { ApiError } from "@/api/client"
import { fillBulkField, getBulkFields, type BulkField } from "@/api/ficha-bulk"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useOpened } from "@/composables/useModelOpen"
import { queryErrorMessage } from "@/lib/queryClient"
import { withoutFinalPeriod } from "@/lib/utils"
import { BULK_NO_OPTIONS, BULK_UNDECIDED } from "@silabos/shared/schemas/imports"
import { RESPONSE_NODE, careerFieldUndecided, responseAttrs, responseNeedsOptions } from "@silabos/shared/lib/responseKinds"
import { nodesOfType, type DocumentNode } from "@silabos/shared/lib/templateDocument"

export type BulkSubject = { id: string; name: string; code: string }

type BulkFieldDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjects: BulkSubject[]
  onApplied: (message: string) => void
}

type Problems = { field?: string; value?: string; subjects?: string; request?: string }

const CHOOSE_FIELD = "Elija qué campo va a llenar"
const CHOOSE_REPLACED = "Marque qué materias quiere reemplazar: todas ya tienen contenido"
const GENERAL = "General"

const sectionOf = (field: BulkField): string => field.section?.trim() || GENERAL
const nameOf = (field: BulkField): string => field.label.trim() || sectionOf(field)
const startOf = (field: BulkField): DocumentNode => (field.template ?? field.content) as DocumentNode
const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many)
const subjectsText = (count: number): string => `${count} ${plural(count, "materia", "materias")}`

const problemOf = (field: BulkField, value: DocumentNode): string | null => {
  if (nodesOfType(value, RESPONSE_NODE).some((node) => responseNeedsOptions(responseAttrs(node)))) return BULK_NO_OPTIONS

  return careerFieldUndecided(startOf(field), value) ? BULK_UNDECIDED : null
}

const focus = (id: string): void => document.getElementById(id)?.focus()

export function BulkFieldDialog({ open, onOpenChange, subjects, onApplied }: BulkFieldDialogProps) {
  const [fieldId, setFieldId] = useState<string | null>(null)
  const [value, setValue] = useState<DocumentNode | null>(null)
  const [replace, setReplace] = useState<string[]>([])
  const [problems, setProblems] = useState<Problems>({})
  const [saving, setSaving] = useState(false)
  const query = useQuery({ queryKey: ["career-academics", "bulk-fields", academicCareerScope()], queryFn: getBulkFields, enabled: open, staleTime: 0, gcTime: 0 })

  useOpened(open, () => {
    setFieldId(null)
    setValue(null)
    setReplace([])
    setProblems({})
  })

  const fields = query.data?.fields ?? []
  const lockReason = query.data?.lock_reason ?? null
  const loadError = queryErrorMessage(query, "No se pudieron cargar los campos")
  const field = fields.find((candidate) => candidate.id === fieldId) ?? null
  const sections = [...new Set(fields.map(sectionOf))]
  const missingIn = (candidate: BulkField): number => subjects.filter((subject) => !candidate.filled_subjects.includes(subject.id)).length
  const undefinedSubjects = field ? subjects.filter((subject) => !field.filled_subjects.includes(subject.id)) : []
  const filledSubjects = field ? subjects.filter((subject) => field.filled_subjects.includes(subject.id)) : []
  const replaced = filledSubjects.filter((subject) => replace.includes(subject.id)).map((subject) => subject.id)
  const total = undefinedSubjects.length + replaced.length

  const chooseField = (id: string): void => {
    if (id === fieldId) return
    setFieldId(id)
    setValue(null)
    setReplace([])
    setProblems({})
  }

  const toggle = (id: string, checked: boolean): void => {
    setReplace((previous) => (checked ? [...previous.filter((item) => item !== id), id] : previous.filter((item) => item !== id)))
    setProblems((previous) => ({ ...previous, subjects: undefined }))
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    if (!field) {
      setProblems({ field: CHOOSE_FIELD })
      focus("bulk-field")
      return
    }
    const written = value ?? startOf(field)
    const problem = problemOf(field, written)
    if (problem) {
      setProblems({ value: withoutFinalPeriod(problem) })
      focus("bulk-value")
      return
    }
    if (total === 0) {
      setProblems({ subjects: CHOOSE_REPLACED })
      focus(filledSubjects.length > 1 ? "bulk-replace-all" : `bulk-replace-${filledSubjects[0]?.id}`)
      return
    }
    setSaving(true)
    setProblems({})
    try {
      const { applied } = await fillBulkField({ field_id: field.id, value: written, subjects: subjects.map((subject) => subject.id), replace: replaced })
      onApplied(applied === 0 ? "Ninguna materia cambió: ya tenían contenido" : `Campo llenado en ${subjectsText(applied)}`)
      onOpenChange(false)
    } catch (reason) {
      if (!(reason instanceof ApiError)) setProblems({ request: "No se pudo llenar el campo" })
      else {
        const { value: onValue, ...others } = reason.errors
        setProblems({ value: onValue?.[0], request: onValue ? undefined : (Object.values(others).flat()[0] ?? reason.message) })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-(--overlay-max-height) flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (value !== null) event.preventDefault()
        }}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)} noValidate>
          <DialogHeader className="p-6 pb-4">
            <DialogTitle>Llenar un campo</DialogTitle>
            <DialogDescription>
              Se escribe una sola vez para {subjects.length === 1 ? "la materia seleccionada" : `las ${subjects.length} materias seleccionadas`}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
            {loadError ? (
              <LoadErrorState message={loadError} onRetry={() => void query.refetch()} />
            ) : !query.data ? (
              <Skeleton className="h-9 w-full" />
            ) : lockReason ? (
              <FeedbackAlert message={lockReason} variant="default" />
            ) : (
              <FieldGroup>
                {problems.request ? <FeedbackAlert message={problems.request} /> : null}
                <Field data-invalid={Boolean(problems.field)}>
                  <FieldLabel htmlFor="bulk-field" required>
                    Campo
                  </FieldLabel>
                  <Select value={fieldId ?? ""} onValueChange={chooseField}>
                    <SelectTrigger id="bulk-field" className="w-full" aria-invalid={Boolean(problems.field)}>
                      <SelectValue placeholder="Elija qué campo llenar" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((section) => (
                        <SelectGroup key={section}>
                          <SelectLabel>{section}</SelectLabel>
                          {fields
                            .filter((candidate) => sectionOf(candidate) === section)
                            .map((candidate) => (
                              <SelectItem key={candidate.id} value={candidate.id}>
                                {nameOf(candidate)}
                                <span className="text-muted-foreground"> · {missingIn(candidate) ? `falta en ${missingIn(candidate)}` : "todas ya lo tienen"}</span>
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  {problems.field ? <FieldError errors={[problems.field]} /> : null}
                </Field>
                {field ? (
                  <>
                    <Field data-invalid={Boolean(problems.value)}>
                      <FieldLabel htmlFor={`bulk-editor-${field.id}`}>Lo que irá en las materias</FieldLabel>
                      <div id="bulk-value" tabIndex={-1} aria-describedby={problems.value ? "bulk-value-error" : undefined}>
                        <FieldResponseEditor
                          key={field.id}
                          id={`bulk-editor-${field.id}`}
                          template={field.template}
                          label={nameOf(field)}
                          career
                          askFor="a Administración"
                          value={value ?? startOf(field)}
                          onValueChange={(next) => {
                            setValue(next)
                            setProblems((previous) => ({ ...previous, value: undefined }))
                          }}
                        />
                      </div>
                      {problems.value ? (
                        <div id="bulk-value-error">
                          <FieldError errors={[problems.value]} />
                        </div>
                      ) : null}
                    </Field>
                    {undefinedSubjects.length ? (
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
                        Se llenará en {subjectsText(undefinedSubjects.length)} sin definir
                      </p>
                    ) : null}
                    {filledSubjects.length ? (
                      <FieldSet className="gap-3 rounded-md p-3 ring-1 ring-surface-ring">
                        <FieldLegend variant="label" className="mb-0">
                          {filledSubjects.length === 1
                            ? "1 ya tiene contenido y no cambia, salvo que la marque"
                            : `${filledSubjects.length} ya tienen contenido y no cambian, salvo las que marque`}
                        </FieldLegend>
                        {filledSubjects.length > 1 ? (
                          <Field orientation="horizontal">
                            <Checkbox
                              id="bulk-replace-all"
                              checked={replaced.length === filledSubjects.length ? true : replaced.length ? "indeterminate" : false}
                              onCheckedChange={(checked) => {
                                setReplace(checked === true ? filledSubjects.map((subject) => subject.id) : [])
                                setProblems((previous) => ({ ...previous, subjects: undefined }))
                              }}
                            />
                            <FieldLabel htmlFor="bulk-replace-all">Reemplazar en todas</FieldLabel>
                          </Field>
                        ) : null}
                        <ul className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                          {filledSubjects.map((subject) => (
                            <li key={subject.id}>
                              <Field orientation="horizontal">
                                <Checkbox id={`bulk-replace-${subject.id}`} checked={replaced.includes(subject.id)} onCheckedChange={(checked) => toggle(subject.id, checked === true)} />
                                <FieldLabel htmlFor={`bulk-replace-${subject.id}`} className="font-normal">
                                  {subject.name}
                                  <span className="text-muted-foreground"> · {subject.code}</span>
                                </FieldLabel>
                              </Field>
                            </li>
                          ))}
                        </ul>
                        {problems.subjects ? <FieldError errors={[problems.subjects]} /> : null}
                      </FieldSet>
                    ) : null}
                  </>
                ) : null}
              </FieldGroup>
            )}
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              {lockReason ? "Cerrar" : "Cancelar"}
            </Button>
            {query.data && !lockReason ? (
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner data-icon="inline-start" /> : <PencilLine data-icon="inline-start" aria-hidden="true" />}
                {field && total ? `Llenar ${subjectsText(total)}` : "Llenar materias"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
