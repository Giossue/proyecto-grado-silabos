"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useId, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { designRepeatableTable, type DesignedTable, type RepeatableTableCellType, type RepeatableTableColumn, type RepeatableTableDesign } from "@/api/template"
import { uniqueKey } from "@/components/domain/configuration/templateStructure"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { ResponseOptionsEditor } from "@/components/domain/syllabus/ResponseOptionsEditor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOpened } from "@/composables/useModelOpen"
import type { ResponseOption } from "@/lib/responseKinds"

type TemplateTableDesignerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  design: RepeatableTableDesign | null
  reason?: string | null
  name?: string
  takenKinds: string[]
  onApplied: (table: DesignedTable, created: boolean) => void
}

type ColumnDraft = Omit<RepeatableTableColumn, "max_length" | "maximum" | "decimals" | "width"> & { id: number; max_length: string; maximum: string; decimals: string; width: string }
type Draft = Omit<RepeatableTableDesign, "min" | "max" | "initial" | "columns"> & { min: string; max: string; initial: string; columns: ColumnDraft[]; sequence: number }

const CELL_TYPES: Array<{ value: RepeatableTableCellType; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "choice", label: "Elegir una" },
  { value: "number", label: "Número" },
]
const DECIMALS = ["0", "1", "2", "3"]

const text = (value: number | null | undefined, fallback = ""): string => (value === null || value === undefined ? fallback : String(value))
const toColumn = (column: RepeatableTableColumn, id: number): ColumnDraft => ({
  ...column,
  id,
  options: column.options?.map((option) => ({ ...option })) ?? [],
  max_length: text(column.max_length, "1000"),
  multiline: column.multiline ?? false,
  maximum: text(column.maximum, "999.99"),
  decimals: text(column.decimals, "2"),
  width: text(column.width),
})
const blankColumn = (position: number, id: number): ColumnDraft => toColumn({ title: `Columna ${position}`, type: "text", max_length: 1000, multiline: false, width: null, required: false }, id)
const fromDesign = (design: RepeatableTableDesign | null): Draft => design
  ? { ...design, min: String(design.min), max: String(design.max), initial: String(design.initial), columns: design.columns.map((column, index) => toColumn(column, index + 1)), sequence: design.columns.length }
  : { kind: "", label: "", list: "", item: "fila", min: "1", max: "20", initial: "1", band: null, columns: [blankColumn(1, 1)], sequence: 1 }

const whole = (value: string): number | string => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : value.trim())
const decimal = (value: string): number | string => (/^\d+([.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(",", ".")) : value.trim())
const columnPayload = (column: ColumnDraft): RepeatableTableColumn => {
  const base = { ...(column.key ? { key: column.key } : {}), title: column.title.trim(), type: column.type, width: column.width.trim() === "" ? null : whole(column.width) as number, required: column.required }
  if (column.type === "choice") return { ...base, options: (column.options ?? []).map((option) => ({ ...(option.value ? { value: option.value } : {}), label: option.label })) }
  if (column.type === "number") return { ...base, maximum: decimal(column.maximum) as number, decimals: whole(column.decimals) as number }
  return { ...base, max_length: whole(column.max_length) as number, multiline: column.multiline ?? false }
}
const payloadOf = (draft: Draft): RepeatableTableDesign => ({
  kind: draft.kind,
  label: draft.label.trim(),
  list: draft.list,
  item: draft.item.trim(),
  min: whole(draft.min) as number,
  max: whole(draft.max) as number,
  initial: whole(draft.initial) as number,
  band: draft.band,
  columns: draft.columns.map(columnPayload),
  ...(draft.extras ? { extras: draft.extras } : {}),
})
const optionsOf = (column: ColumnDraft): ResponseOption[] => (column.options ?? []).map((option, index) => ({ const: option.value ?? `o${index + 1}`, title: option.label }))
const cellHint = (column: ColumnDraft): string => {
  if (column.type === "choice") return (column.options ?? []).map((option) => option.label).filter(Boolean).join(" / ") || "Elegir una"
  if (column.type === "number") return "Número"
  return column.multiline ? "Texto largo" : "Texto"
}
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const invalid = (messages: string[] | undefined): true | undefined => (messages ? true : undefined)

export function TemplateTableDesigner({ open, onOpenChange, templateId, design, reason = null, name, takenKinds, onApplied }: TemplateTableDesignerProps) {
  const id = useId()
  const [draft, setDraft] = useState<Draft>(() => fromDesign(design))
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const readOnly = Boolean(reason)
  const creating = design === null && !readOnly

  useOpened(open, () => {
    setDraft(fromDesign(design))
    setErrors({})
    setGeneral(null)
  })

  const patch = (changes: Partial<Draft>): void => setDraft((current) => ({ ...current, ...changes }))
  const patchColumn = (columnId: number, changes: Partial<ColumnDraft>): void =>
    setDraft((current) => ({ ...current, columns: current.columns.map((column) => (column.id === columnId ? { ...column, ...changes } : column)) }))
  const addColumn = (): void => setDraft((current) => ({ ...current, sequence: current.sequence + 1, columns: [...current.columns, blankColumn(current.columns.length + 1, current.sequence + 1)] }))
  const removeColumn = (index: number): void => setDraft((current) => ({ ...current, columns: current.columns.filter((_, position) => position !== index) }))
  const moveColumn = (index: number, step: number): void => setDraft((current) => {
    const columns = [...current.columns]
    const [column] = columns.splice(index, 1)
    if (column) columns.splice(index + step, 0, column)
    return { ...current, columns }
  })
  const setOptions = (columnId: number, options: ResponseOption[]): void => patchColumn(columnId, { options: options.map((option) => ({ value: option.const, label: option.title })) })
  const errorOf = (path: string): string[] | undefined => errors[path]
  const columnErrors = (index: number, field: string): string[] | undefined => errors[`columns.${index}.${field}`]

  const previewRows = Math.max(1, Math.min(5, Number(whole(draft.initial)) || 1))
  const limitsLabel = `Entre ${draft.min || 0} y ${draft.max || 0} filas; el docente usa «Agregar ${draft.item.trim() || "fila"}».`

  const friendly = (message: string): string => {
    const match = /\.catalog\.map\.([a-z_]+): /.exec(message)
    const catalog = design?.extras?.catalog as { map?: Record<string, string> } | undefined
    const key = match ? catalog?.map?.[match[1]!] : undefined
    const column = key ? design?.columns.find((item) => item.key === key) : undefined
    if (!column) return message
    return draft.columns.some((item) => item.key === key)
      ? `La búsqueda en biblioteca usa la columna «${column.title}»: debe seguir siendo de texto.`
      : `La búsqueda en biblioteca usa la columna «${column.title}»: no se puede quitar.`
  }

  const apply = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy || readOnly) return
    const body = payloadOf(draft)
    if (!creating && design && same(body, design)) {
      onOpenChange(false)
      return
    }
    if (creating) body.kind = uniqueKey(`tabla ${body.label}`, "tabla", takenKinds).slice(0, 40)
    setBusy(true)
    setErrors({})
    setGeneral(null)
    try {
      const table = await designRepeatableTable(templateId, { ...body, ...(creating ? { new: true } : {}) })
      onApplied(table, creating)
      onOpenChange(false)
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422) {
        setErrors(failure.errors)
        const known = Object.keys(failure.errors).filter((path) => path !== "definition" && path !== "kind")
        setGeneral([...(failure.errors.definition ?? []).map(friendly), ...(failure.errors.kind ?? [])].join(" ") || (known.length ? null : failure.message))
      } else {
        setGeneral("No se pudo preparar la tabla")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-(--overlay-max-height) overflow-y-auto sm:max-w-3xl" data-table-designer>
        <DialogHeader>
          <DialogTitle>{creating ? "Nueva tabla repetible" : `Tabla repetible: ${design?.label ?? name ?? ""}`}</DialogTitle>
          <DialogDescription>El docente agrega filas y llena cada celda según su tipo.</DialogDescription>
        </DialogHeader>

        {readOnly ? (
          <Alert data-table-designer-readonly>
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        ) : (
          <form id={`${id}-form`} noValidate className="flex flex-col gap-6" onSubmit={(event) => void apply(event)}>
            {general ? (
              <Alert variant="destructive" role="alert" data-table-designer-error>
                <AlertDescription>{general}</AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid(errorOf("label"))}>
                <FieldLabel htmlFor={`${id}-label`}>Título de la tabla</FieldLabel>
                <Input id={`${id}-label`} value={draft.label} maxLength={120} data-table-label onChange={(event) => patch({ label: event.target.value })} />
                <FieldError errors={errorOf("label")} />
              </Field>
              <Field data-invalid={invalid(errorOf("item"))}>
                <FieldLabel htmlFor={`${id}-item`}>Cada fila se llama</FieldLabel>
                <Input id={`${id}-item`} value={draft.item} maxLength={60} data-table-item onChange={(event) => patch({ item: event.target.value })} />
                <FieldDescription>En singular, por ejemplo «práctica»</FieldDescription>
                <FieldError errors={errorOf("item")} />
              </Field>
            </FieldGroup>
            <FieldGroup className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={invalid(errorOf("min"))}>
                <FieldLabel htmlFor={`${id}-min`}>Mínimo de filas</FieldLabel>
                <Input id={`${id}-min`} value={draft.min} inputMode="numeric" data-table-min onChange={(event) => patch({ min: event.target.value })} />
                <FieldError errors={errorOf("min")} />
              </Field>
              <Field data-invalid={invalid(errorOf("max"))}>
                <FieldLabel htmlFor={`${id}-max`}>Máximo de filas</FieldLabel>
                <Input id={`${id}-max`} value={draft.max} inputMode="numeric" data-table-max onChange={(event) => patch({ max: event.target.value })} />
                <FieldError errors={errorOf("max")} />
              </Field>
              <Field data-invalid={invalid(errorOf("initial"))}>
                <FieldLabel htmlFor={`${id}-initial`}>Filas al empezar</FieldLabel>
                <Input id={`${id}-initial`} value={draft.initial} inputMode="numeric" data-table-initial onChange={(event) => patch({ initial: event.target.value })} />
                <FieldError errors={errorOf("initial")} />
              </Field>
            </FieldGroup>

            <section className="flex flex-col gap-3" aria-label="Columnas">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Columnas</h3>
                <Button type="button" variant="outline" size="sm" disabled={draft.columns.length >= 24} data-table-add-column onClick={addColumn}>
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  Agregar columna
                </Button>
              </div>
              <FieldError errors={errorOf("columns")} />
              <ol className="flex flex-col gap-3">
                {draft.columns.map((column, index) => (
                  <li key={column.id} className="rounded-md p-3 ring-1 ring-border" data-table-column>
                    <div className="flex flex-wrap items-start gap-3">
                      <Field className="min-w-40 flex-1" data-invalid={invalid(columnErrors(index, "title"))}>
                        <FieldLabel htmlFor={`${id}-title-${column.id}`}>Nombre</FieldLabel>
                        <Input id={`${id}-title-${column.id}`} value={column.title} maxLength={300} data-column-title onChange={(event) => patchColumn(column.id, { title: event.target.value })} />
                        <FieldError errors={columnErrors(index, "title")} />
                      </Field>
                      <Field className="w-40">
                        <FieldLabel htmlFor={`${id}-type-${column.id}`}>Tipo de celda</FieldLabel>
                        <Select value={column.type} onValueChange={(value) => patchColumn(column.id, { type: value as RepeatableTableCellType })}>
                          <SelectTrigger id={`${id}-type-${column.id}`} data-column-type>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {CELL_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className="w-28" data-invalid={invalid(columnErrors(index, "width"))}>
                        <FieldLabel htmlFor={`${id}-width-${column.id}`}>Ancho (px)</FieldLabel>
                        <Input id={`${id}-width-${column.id}`} value={column.width} inputMode="numeric" placeholder="Auto" data-column-width onChange={(event) => patchColumn(column.id, { width: event.target.value })} />
                        <FieldError errors={columnErrors(index, "width")} />
                      </Field>
                      <div className="flex items-center gap-0.5 self-end pb-1">
                        <IconTooltip label="Subir columna">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir columna" disabled={index === 0} onClick={() => moveColumn(index, -1)}>
                            <ArrowUp aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="Bajar columna">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Bajar columna" disabled={index === draft.columns.length - 1} onClick={() => moveColumn(index, 1)}>
                            <ArrowDown aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="Quitar columna">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar columna" disabled={draft.columns.length === 1} data-column-remove onClick={() => removeColumn(index)}>
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-start gap-4">
                      {column.type === "text" ? (
                        <>
                          <Field className="w-36" data-invalid={invalid(columnErrors(index, "max_length"))}>
                            <FieldLabel htmlFor={`${id}-length-${column.id}`}>Máx. caracteres</FieldLabel>
                            <Input id={`${id}-length-${column.id}`} value={column.max_length} inputMode="numeric" data-column-length onChange={(event) => patchColumn(column.id, { max_length: event.target.value })} />
                            <FieldError errors={columnErrors(index, "max_length")} />
                          </Field>
                          <Field orientation="horizontal" className="w-fit self-end pb-2">
                            <Switch id={`${id}-multiline-${column.id}`} checked={column.multiline ?? false} onCheckedChange={(checked) => patchColumn(column.id, { multiline: checked })} />
                            <FieldLabel htmlFor={`${id}-multiline-${column.id}`}>Varias líneas</FieldLabel>
                          </Field>
                        </>
                      ) : column.type === "choice" ? (
                        <Field className="min-w-56 flex-1" data-invalid={invalid(columnErrors(index, "options"))}>
                          <FieldLabel>Opciones</FieldLabel>
                          <ResponseOptionsEditor value={optionsOf(column)} onValueChange={(options) => setOptions(column.id, options)} />
                          <FieldError errors={columnErrors(index, "options")} />
                        </Field>
                      ) : (
                        <>
                          <Field className="w-32" data-invalid={invalid(columnErrors(index, "maximum"))}>
                            <FieldLabel htmlFor={`${id}-maximum-${column.id}`}>Número máximo</FieldLabel>
                            <Input id={`${id}-maximum-${column.id}`} value={column.maximum} inputMode="decimal" data-column-maximum onChange={(event) => patchColumn(column.id, { maximum: event.target.value })} />
                            <FieldError errors={columnErrors(index, "maximum")} />
                          </Field>
                          <Field className="w-28">
                            <FieldLabel htmlFor={`${id}-decimals-${column.id}`}>Decimales</FieldLabel>
                            <Select value={column.decimals} onValueChange={(value) => patchColumn(column.id, { decimals: value })}>
                              <SelectTrigger id={`${id}-decimals-${column.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {DECIMALS.map((digits) => <SelectItem key={digits} value={digits}>{digits}</SelectItem>)}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                        </>
                      )}
                      <Field orientation="horizontal" className="ml-auto w-fit self-end pb-2">
                        <Switch id={`${id}-required-${column.id}`} checked={column.required} data-column-required onCheckedChange={(checked) => patchColumn(column.id, { required: checked })} />
                        <FieldLabel htmlFor={`${id}-required-${column.id}`}>Obligatoria</FieldLabel>
                      </Field>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="flex flex-col gap-2" aria-label="Vista previa de la tabla">
              <h3 className="text-sm font-medium">Vista previa</h3>
              <Table className="table-fixed" data-table-preview>
                <TableHeader>
                  <TableRow>
                    {draft.columns.map((column) => (
                      <TableHead key={column.id} className="bg-muted" style={column.width.trim() && /^\d+$/.test(column.width.trim()) ? { width: `${column.width.trim()}px` } : undefined}>
                        {column.title || "Sin nombre"}
                        {column.required ? <span className="text-destructive" aria-label="obligatoria"> *</span> : null}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: previewRows }, (_, row) => (
                    <TableRow key={row}>
                      {draft.columns.map((column) => (
                        <TableCell key={column.id} className="truncate text-muted-foreground">{cellHint(column)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-sm text-muted-foreground" data-table-limits>{limitsLabel}</p>
            </section>
          </form>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{readOnly ? "Cerrar" : "Cancelar"}</Button>
          </DialogClose>
          {!readOnly ? (
            <Button type="submit" form={`${id}-form`} disabled={busy} data-table-apply>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {creating ? "Insertar tabla" : "Aplicar cambios"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
