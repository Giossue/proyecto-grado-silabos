"use client"

import { Check, Download, FileSpreadsheet, FileUp, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { applyFichaWorkbook, downloadFichaWorkbook, previewFichaWorkbook, type FichaRemovedAnswer, type FichaWorkbookPreview, type FichaWorkbookSubject } from "@/api/ficha-imports"
import { FichaProposalValue } from "@/components/domain/academic/FichaProposalValue"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { FileDropzone } from "@/components/domain/FileDropzone"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { useOpened } from "@/composables/useModelOpen"
import { cn } from "@/lib/utils"

type FichaImportDialogProps = { disabled?: boolean; onApplied?: (message: string) => void }

const removingKeys = (subject: FichaWorkbookSubject): string[] => Object.keys(subject.removed_answers ?? {}).filter((key) => key in subject.values)

function AnswerWarning({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-warning">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

function Choices({ options }: { options: string[] }) {
  if (options.length === 0) return <p className="text-muted-foreground">El docente elige, pero todavía no hay opciones</p>

  return (
    <>
      <p className="text-muted-foreground">El docente elige entre:</p>
      <ul className="list-disc pl-5">
        {options.map((option, index) => (
          <li key={index}>{option}</li>
        ))}
      </ul>
    </>
  )
}

function CurrentContent({ text, removed }: { text?: string; removed?: FichaRemovedAnswer[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">Actual</p>
      {text ? <p className="whitespace-pre-wrap">{text}</p> : null}
      {!text && !removed ? <p className="text-muted-foreground">Vacío</p> : null}
      {removed?.some((answer) => answer.kind === "texto") ? <p className="text-muted-foreground">El docente escribe aquí («Texto libre»)</p> : null}
      {removed?.filter((answer) => answer.kind !== "texto").map((answer, index) => <Choices key={index} options={answer.options} />)}
    </div>
  )
}

export function FichaImportDialog({ disabled, onApplied }: FichaImportDialogProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<FichaWorkbookPreview | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [chosen, setChosen] = useState<Set<string>>(() => new Set())
  const [excluded, setExcluded] = useState<Record<string, string[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = (): void => {
    setCurrent(null)
    setFile(null)
    setChosen(new Set())
    setExcluded({})
    setExpanded(new Set())
    setError(null)
  }
  useOpened(open, reset)

  const ready = current !== null
  const fields = current?.fields ?? []
  const proposed = (current?.subjects ?? []).filter((subject) => subject.state === "lista")
  const fieldLabel = (key: string): string => fields.find((field) => field.key === key)?.label ?? key
  const found = (subject: FichaWorkbookSubject): number => subject.coverage?.found ?? Object.keys(subject.values).length
  const total = (subject: FichaWorkbookSubject): number => subject.coverage?.total ?? fields.length
  const missing = (subject: FichaWorkbookSubject) =>
    subject.missing ?? fields.filter((field) => !(field.key in subject.values)).map((field) => ({ ...field, reason: "no_encontrado" as const }))
  const fieldChosen = (subjectId: string, key: string): boolean => !(excluded[subjectId] ?? []).includes(key)
  const hasChosenField = (subject: FichaWorkbookSubject): boolean => Object.keys(subject.values).some((key) => fieldChosen(subject.subject_id, key))
  const applies = (subject: FichaWorkbookSubject): boolean => chosen.has(subject.subject_id) && hasChosenField(subject)
  const selectedSubjects = proposed.filter(applies).map((subject) => subject.subject_id)
  const removesAnswers = proposed.some((subject) => removingKeys(subject).length > 0)

  const run = async (action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (reason) {
      setError(reason instanceof ApiError ? (Object.values(reason.errors).flat()[0] ?? reason.message) : fallback)
      return false
    } finally {
      setBusy(false)
    }
  }

  const download = async (): Promise<void> => {
    setDownloading(true)
    try {
      await run(downloadFichaWorkbook, "No se pudo descargar la plantilla")
    } finally {
      setDownloading(false)
    }
  }

  const analyze = async (): Promise<void> => {
    if (!file) return
    await run(async () => {
      const { preview } = await previewFichaWorkbook(file)
      setCurrent(preview)
      setChosen(new Set(preview.subjects.filter((subject) => subject.state === "lista").map((subject) => subject.subject_id)))
      setExcluded(Object.fromEntries(preview.subjects.map((subject) => [subject.subject_id, removingKeys(subject)])))
      setExpanded(new Set())
    }, "No se pudo leer el Excel")
  }

  const chosenFields = (): Record<string, string[]> | undefined => {
    const selection: Record<string, string[]> = {}
    for (const subject of current?.subjects ?? []) {
      if (!selectedSubjects.includes(subject.subject_id) || !(excluded[subject.subject_id] ?? []).length) continue
      selection[subject.subject_id] = Object.keys(subject.values).filter((key) => fieldChosen(subject.subject_id, key))
    }

    return Object.keys(selection).length ? selection : undefined
  }

  const apply = async (): Promise<void> => {
    if (!current || !file) return
    const count = selectedSubjects.length
    if (await run(() => applyFichaWorkbook(file, current, selectedSubjects, chosenFields()), "No se pudo aplicar el proyecto de carrera")) {
      setOpen(false)
      onApplied?.(`Proyecto de carrera aplicado a ${count} materias`)
    }
  }

  const toggleField = (subjectId: string, key: string, value: boolean): void => {
    setExcluded((previous) => {
      const rest = (previous[subjectId] ?? []).filter((item) => item !== key)
      return { ...previous, [subjectId]: value ? rest : [...rest, key] }
    })
  }
  const toggleExpanded = (id: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }
  const toggle = (subject: FichaWorkbookSubject, value: boolean): void => {
    const id = subject.subject_id
    setChosen((previous) => {
      const next = new Set(previous)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
    if (!value || hasChosenField(subject)) return
    const kept = removingKeys(subject)
    if (kept.length < Object.keys(subject.values).length) setExcluded((previous) => ({ ...previous, [id]: kept }))
    else setExpanded((previous) => new Set(previous).add(id))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="success" disabled={disabled}>
          <FileSpreadsheet data-icon="inline-start" aria-hidden="true" />
          Importar desde Excel
        </Button>
      </DialogTrigger>
      <DialogContent className={cn("flex max-h-(--overlay-max-height) flex-col gap-0 overflow-hidden p-0", ready ? "sm:max-w-3xl" : "sm:max-w-md")}>
        <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-2rem)]">
          <div className="grid gap-4 p-6">
            <DialogHeader>
              <DialogTitle>Importar el proyecto de carrera</DialogTitle>
              <DialogDescription>Suba el Excel y revise los cambios antes de aplicarlos</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {error ? <FeedbackAlert message={error} /> : null}
              <p className="text-sm text-muted-foreground">Al cerrar o recargar, deberá volver a subir el Excel para revisarlo</p>
              {ready ? (
                <>
                  <p className="text-sm">
                    Vista previa del Excel para {proposed.length} de {current.subjects.length} materias. Revise el contenido antes de aplicar. Los campos vacíos conservan sus valores actuales
                  </p>
                  {removesAnswers ? (
                    <Alert className="[&>svg]:text-warning">
                      <TriangleAlert aria-hidden="true" />
                      <AlertDescription>En algunos campos responde el docente y el Excel quitaría ese espacio. Por eso vienen sin marcar: márquelos solo si quiere reemplazarlos</AlertDescription>
                    </Alert>
                  ) : null}
                  <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-96">
                    <ul className="flex flex-col gap-2">
                      {current.subjects.map((subject) => {
                        const isExpanded = expanded.has(subject.subject_id)
                        const missingFields = missing(subject)
                        const replaced = removingKeys(subject).filter((key) => chosen.has(subject.subject_id) && fieldChosen(subject.subject_id, key))
                        const kept = removingKeys(subject).filter((key) => !replaced.includes(key))

                        return (
                          <li key={subject.subject_id} className="rounded-md p-3 ring-1 ring-surface-ring">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`ficha-${subject.subject_id}`}
                                checked={applies(subject)}
                                disabled={subject.state !== "lista" || busy}
                                aria-label={`Aplicar el proyecto de carrera de ${subject.name}`}
                                onCheckedChange={(checked) => toggle(subject, checked === true)}
                              />
                              <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <FieldLabel htmlFor={`ficha-${subject.subject_id}`} className="font-medium">
                                  {subject.name}
                                  <span className="font-normal text-muted-foreground"> · {subject.code}</span>
                                </FieldLabel>
                                <p className="text-sm text-muted-foreground">
                                  {found(subject)} de {total(subject)} campos con contenido
                                  {subject.state === "lista" && subject.replaces ? " · actualiza solo los campos que aplique" : null}
                                </p>
                                {replaced.length ? <AnswerWarning>{`El docente ya no responderá en: ${replaced.map(fieldLabel).join(", ")}`}</AnswerWarning> : null}
                                {kept.length ? <AnswerWarning>{`Sin marcar para no quitar lo que responde el docente: ${kept.map(fieldLabel).join(", ")}`}</AnswerWarning> : null}
                                <div className="text-sm">
                                  <Button type="button" variant="link" size="sm" className="h-auto px-0" aria-expanded={isExpanded} onClick={() => toggleExpanded(subject.subject_id)}>
                                    {isExpanded ? "Ocultar la comparación" : subject.replaces ? "Comparar con el proyecto de carrera actual" : "Revisar campos"}
                                  </Button>
                                  {isExpanded
                                    ? Object.entries(subject.values).map(([key, value]) => (
                                        <div key={key} className="mt-3 rounded-md p-2 ring-1 ring-surface-ring">
                                          <div className="flex items-center gap-2">
                                            <Checkbox
                                              id={`ficha-${subject.subject_id}-${key}`}
                                              checked={fieldChosen(subject.subject_id, key)}
                                              disabled={!chosen.has(subject.subject_id) || busy}
                                              onCheckedChange={(checked) => toggleField(subject.subject_id, key, checked === true)}
                                            />
                                            <FieldLabel htmlFor={`ficha-${subject.subject_id}-${key}`} className="font-medium">
                                              {fieldLabel(key)}
                                            </FieldLabel>
                                          </div>
                                          {subject.removed_answers?.[key] ? <p className="mt-2 text-warning">Si marca este campo, el docente ya no responde aquí y queda el texto del Excel</p> : null}
                                          <div className={cn("mt-2 grid gap-3", subject.replaces && "sm:grid-cols-2")}>
                                            {subject.replaces ? <CurrentContent text={subject.current[key]} removed={subject.removed_answers?.[key]} /> : null}
                                            <div>
                                              <p className="text-xs font-medium text-muted-foreground">Contenido del Excel</p>
                                              <FichaProposalValue value={value} label={fieldLabel(key)} />
                                            </div>
                                          </div>
                                        </div>
                                      ))
                                    : null}
                                  {isExpanded && missingFields.length ? (
                                    <div className="mt-3 flex flex-col gap-2">
                                      <p className="font-medium">Campos pendientes</p>
                                      <ul className="flex flex-col gap-2">
                                        {missingFields.map((field) => (
                                          <li key={field.key}>
                                            <span className="font-medium">{field.label}</span>
                                            <p className="text-muted-foreground">Sin contenido en el archivo. Este campo no se cambiará</p>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </ScrollArea>
                </>
              ) : (
                <>
                  <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                    <li>Descargue el Excel con las materias y campos actuales de su carrera</li>
                    <li>Complete las celdas de contenido. Conserve los nombres de las hojas, los campos y las materias</li>
                    <li>Cargue el archivo y revise la vista previa. Las celdas vacías no cambian el proyecto de carrera actual</li>
                  </ol>
                  <div>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void download()}>
                      {downloading ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" aria-hidden="true" />}
                      Descargar plantilla Excel
                    </Button>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="ficha-import-files">Excel completado (.xlsx)</FieldLabel>
                      <FileDropzone
                        value={file}
                        onValueChange={setFile}
                        inputId="ficha-import-files"
                        kind="xlsx"
                        maxBytes={20 * 1024 * 1024}
                        disabled={busy}
                        invalid={Boolean(error)}
                        onValidationError={(message) => {
                          if (message) setError(message)
                        }}
                      />
                    </Field>
                  </FieldGroup>
                </>
              )}
            </div>
            <DialogFooter>
              {!ready ? (
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={busy}>
                    Cerrar
                  </Button>
                </DialogClose>
              ) : null}
              {ready ? (
                <>
                  <Button type="button" variant="outline" disabled={busy} onClick={reset}>
                    Descartar
                  </Button>
                  <Button type="button" disabled={busy || selectedSubjects.length === 0} onClick={() => void apply()}>
                    {busy ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" aria-hidden="true" />}
                    Aplicar a {selectedSubjects.length} materias
                  </Button>
                </>
              ) : (
                <Button type="button" disabled={busy || !file} onClick={() => void analyze()}>
                  {busy && !downloading ? <Spinner data-icon="inline-start" /> : <FileUp data-icon="inline-start" aria-hidden="true" />}
                  Revisar Excel
                </Button>
              )}
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
