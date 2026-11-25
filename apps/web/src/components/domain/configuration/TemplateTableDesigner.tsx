"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useId, type FormEvent } from "react"
import { Controller, useFieldArray, useWatch } from "react-hook-form"
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
import { applyApiErrors, errorMap, serverMessage, useSchemaForm } from "@/lib/forms"
import type { ResponseOption } from "@silabos/shared/lib/responseKinds"
import { tableDesignerSchema, type TableDesignerValues } from "@silabos/shared/schemas/template"

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

type ColumnDraft = TableDesignerValues["columns"][number]

const CELL_TYPES: Array<{ value: RepeatableTableCellType; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "choice", label: "Elegir una" },
  { value: "number", label: "Número" },
]
const DECIMALS = ["0", "1", "2", "3"]

const text = (value: number | null | undefined, fallback = ""): string => (value === null || value === undefined ? fallback : String(value))
const toColumn = (column: RepeatableTableColumn): ColumnDraft => ({
  ...column,
  options: column.options?.map((option) => ({ ...option })) ?? [],
  max_length: text(column.max_length, "1000"),
  multiline: column.multiline ?? false,
  maximum: text(column.maximum, "999.99"),
  decimals: text(column.decimals, "2"),
  width: text(column.width),
})
const blankColumn = (position: number): ColumnDraft => toColumn({ title: `Columna ${position}`, type: "text", max_length: 1000, multiline: false, width: null, required: false })
const fromDesign = (design: RepeatableTableDesign | null): TableDesignerValues => design
  ? { ...design, min: String(design.min), max: String(design.max), initial: String(design.initial), columns: design.columns.map(toColumn) }
  : { kind: "", label: "", list: "", item: "fila", min: "1", max: "20", initial: "1", band: null, columns: [blankColumn(1)] }

const whole = (value: string): number | string => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : value.trim())
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
const SERVER_FIELDS = { columns: "columns.root" }

export function TemplateTableDesigner({ open, onOpenChange, templateId, design, reason = null, name, takenKinds, onApplied }: TemplateTableDesignerProps) {
  const id = useId()
  const form = useSchemaForm(tableDesignerSchema, { defaultValues: fromDesign(design), keepPeriods: true })
  const columns = useFieldArray({ control: form.control, name: "columns" })
  const draft = useWatch({ control: form.control }) as TableDesignerValues
  const watchedColumns = draft.columns ?? []
  const errors = errorMap(form.formState.errors)
  const general = serverMessage(form.formState.errors) ?? null
  const busy = form.formState.isSubmitting
  const readOnly = Boolean(reason)
  const creating = design === null && !readOnly

  useOpened(open, () => form.reset(fromDesign(design)))

  const addColumn = (): void => columns.append(blankColumn(columns.fields.length + 1))
  const setOptions = (index: number, options: ResponseOption[]): void =>
    form.setValue(`columns.${index}.options`, options.map((option) => ({ value: option.const, label: option.title })))
  const errorOf = (path: string): string[] | undefined => errors[path]
  const columnErrors = (index: number, field: string): string[] | undefined => errors[`columns.${index}.${field}`]

  const previewRows = Math.max(1, Math.min(5, Number(whole(draft.initial ?? "")) || 1))
  const limitsLabel = `Entre ${draft.min || 0} y ${draft.max || 0} filas; el docente usa «Agregar ${(draft.item ?? "").trim() || "fila"}».`

  const friendly = (message: string): string => {
    const match = /\.catalog\.map\.([a-z_]+): /.exec(message)
    const catalog = design?.extras?.catalog as { map?: Record<string, string> } | undefined
    const key = match ? catalog?.map?.[match[1]!] : undefined
    const column = key ? design?.columns.find((item) => item.key === key) : undefined
    if (!column) return message
    return form.getValues("columns").some((item) => item.key === key)
      ? `La búsqueda en biblioteca usa la columna «${column.title}»: debe seguir siendo de texto.`
      : `La búsqueda en biblioteca usa la columna «${column.title}»: no se puede quitar.`
  }

  const apply = form.handleSubmit(async (converted) => {
    if (readOnly) return
    const body = converted as RepeatableTableDesign
    if (!creating && design && same(body, design)) {
      onOpenChange(false)
      return
    }
    if (creating) body.kind = uniqueKey(`tabla ${body.label}`, "tabla", takenKinds).slice(0, 40)
    try {
      const table = await designRepeatableTable(templateId, { ...body, ...(creating ? { new: true } : {}) })
      onApplied(table, creating)
      onOpenChange(false)
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422) {
        applyApiErrors(form.setError, failure, { fallback: failure.message, aliases: SERVER_FIELDS })
        const known = Object.keys(failure.errors).filter((path) => path !== "definition" && path !== "kind")
        const message = [...(failure.errors.definition ?? []).map(friendly), ...(failure.errors.kind ?? [])].join(" ") || (known.length ? null : failure.message)
        if (message) form.setError("root.server", { type: "server", message })
        else form.clearErrors("root.server")
      } else {
        form.setError("root.server", { type: "server", message: "No se pudo preparar la tabla" })
      }
    }
  })
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    if (busy) {
      event.preventDefault()
      return
    }
    void apply(event)
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
          <form id={`${id}-form`} noValidate className="flex flex-col gap-6" onSubmit={submit}>
            {general ? (
              <Alert variant="destructive" role="alert" data-table-designer-error>
                <AlertDescription>{general}</AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid(errorOf("label"))}>
                <FieldLabel htmlFor={`${id}-label`}>Título de la tabla</FieldLabel>
                <Input id={`${id}-label`} {...form.register("label")} maxLength={120} data-table-label />
                <FieldError errors={errorOf("label")} />
              </Field>
              <Field data-invalid={invalid(errorOf("item"))}>
                <FieldLabel htmlFor={`${id}-item`}>Cada fila se llama</FieldLabel>
                <Input id={`${id}-item`} {...form.register("item")} maxLength={60} data-table-item />
                <FieldDescription>En singular, por ejemplo «práctica»</FieldDescription>
                <FieldError errors={errorOf("item")} />
              </Field>
            </FieldGroup>
            <FieldGroup className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={invalid(errorOf("min"))}>
                <FieldLabel htmlFor={`${id}-min`}>Mínimo de filas</FieldLabel>
                <Input id={`${id}-min`} {...form.register("min")} inputMode="numeric" data-table-min />
                <FieldError errors={errorOf("min")} />
              </Field>
              <Field data-invalid={invalid(errorOf("max"))}>
                <FieldLabel htmlFor={`${id}-max`}>Máximo de filas</FieldLabel>
                <Input id={`${id}-max`} {...form.register("max")} inputMode="numeric" data-table-max />
                <FieldError errors={errorOf("max")} />
              </Field>
              <Field data-invalid={invalid(errorOf("initial"))}>
                <FieldLabel htmlFor={`${id}-initial`}>Filas al empezar</FieldLabel>
                <Input id={`${id}-initial`} {...form.register("initial")} inputMode="numeric" data-table-initial />
                <FieldError errors={errorOf("initial")} />
              </Field>
            </FieldGroup>

            <section className="flex flex-col gap-3" aria-label="Columnas">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Columnas</h3>
                <Button type="button" variant="outline" size="sm" disabled={columns.fields.length >= 24} data-table-add-column onClick={addColumn}>
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  Agregar columna
                </Button>
              </div>
              <FieldError errors={errorOf("columns.root")} />
              <ol className="flex flex-col gap-3">
                {columns.fields.map((row, index) => {
                  const column = watchedColumns[index] ?? row
                  return (
                  <li key={row.id} className="rounded-md p-3 ring-1 ring-border" data-table-column>
                    <div className="flex flex-wrap items-start gap-3">
                      <Field className="min-w-40 flex-1" data-invalid={invalid(columnErrors(index, "title"))}>
                        <FieldLabel htmlFor={`${id}-title-${row.id}`}>Nombre</FieldLabel>
                        <Input id={`${id}-title-${row.id}`} {...form.register(`columns.${index}.title`)} maxLength={300} data-column-title />
                        <FieldError errors={columnErrors(index, "title")} />
                      </Field>
                      <Field className="w-40">
                        <FieldLabel htmlFor={`${id}-type-${row.id}`}>Tipo de celda</FieldLabel>
                        <Controller
                          control={form.control}
                          name={`columns.${index}.type`}
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={(value) => field.onChange(value as RepeatableTableCellType)}>
                              <SelectTrigger id={`${id}-type-${row.id}`} data-column-type>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {CELL_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </Field>
                      <Field className="w-28" data-invalid={invalid(columnErrors(index, "width"))}>
                        <FieldLabel htmlFor={`${id}-width-${row.id}`}>Ancho (px)</FieldLabel>
                        <Input id={`${id}-width-${row.id}`} {...form.register(`columns.${index}.width`)} inputMode="numeric" placeholder="Auto" data-column-width />
                        <FieldError errors={columnErrors(index, "width")} />
                      </Field>
                      <div className="flex items-center gap-0.5 self-end pb-1">
                        <IconTooltip label="Subir columna">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir columna" disabled={index === 0} onClick={() => columns.move(index, index - 1)}>
                            <ArrowUp aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="Bajar columna">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Bajar columna" disabled={index === columns.fields.length - 1} onClick={() => columns.move(index, index + 1)}>
                            <ArrowDown aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="Quitar columna">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar columna" disabled={columns.fields.length === 1} data-column-remove onClick={() => columns.remove(index)}>
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-start gap-4">
                      {column.type === "text" ? (
                        <>
                          <Field className="w-36" data-invalid={invalid(columnErrors(index, "max_length"))}>
                            <FieldLabel htmlFor={`${id}-length-${row.id}`}>Máx. caracteres</FieldLabel>
                            <Input id={`${id}-length-${row.id}`} {...form.register(`columns.${index}.max_length`)} inputMode="numeric" data-column-length />
                            <FieldError errors={columnErrors(index, "max_length")} />
                          </Field>
                          <Field orientation="horizontal" className="w-fit self-end pb-2">
                            <Controller
                              control={form.control}
                              name={`columns.${index}.multiline`}
                              render={({ field }) => <Switch id={`${id}-multiline-${row.id}`} checked={field.value ?? false} onCheckedChange={field.onChange} />}
                            />
                            <FieldLabel htmlFor={`${id}-multiline-${row.id}`}>Varias líneas</FieldLabel>
                          </Field>
                        </>
                      ) : column.type === "choice" ? (
                        <Field className="min-w-56 flex-1" data-invalid={invalid(columnErrors(index, "options"))}>
                          <FieldLabel>Opciones</FieldLabel>
                          <ResponseOptionsEditor value={optionsOf(column)} onValueChange={(options) => setOptions(index, options)} />
                          <FieldError errors={columnErrors(index, "options")} />
                        </Field>
                      ) : (
                        <>
                          <Field className="w-32" data-invalid={invalid(columnErrors(index, "maximum"))}>
                            <FieldLabel htmlFor={`${id}-maximum-${row.id}`}>Número máximo</FieldLabel>
                            <Input id={`${id}-maximum-${row.id}`} {...form.register(`columns.${index}.maximum`)} inputMode="decimal" data-column-maximum />
                            <FieldError errors={columnErrors(index, "maximum")} />
                          </Field>
                          <Field className="w-28">
                            <FieldLabel htmlFor={`${id}-decimals-${row.id}`}>Decimales</FieldLabel>
                            <Controller
                              control={form.control}
                              name={`columns.${index}.decimals`}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger id={`${id}-decimals-${row.id}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {DECIMALS.map((digits) => <SelectItem key={digits} value={digits}>{digits}</SelectItem>)}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </Field>
                        </>
                      )}
                      <Field orientation="horizontal" className="ml-auto w-fit self-end pb-2">
                        <Controller
                          control={form.control}
                          name={`columns.${index}.required`}
                          render={({ field }) => <Switch id={`${id}-required-${row.id}`} checked={field.value} data-column-required onCheckedChange={field.onChange} />}
                        />
                        <FieldLabel htmlFor={`${id}-required-${row.id}`}>Obligatoria</FieldLabel>
                      </Field>
                    </div>
                  </li>
                  )
                })}
              </ol>
            </section>

            <section className="flex flex-col gap-2" aria-label="Vista previa de la tabla">
              <h3 className="text-sm font-medium">Vista previa</h3>
              <Table className="table-fixed" data-table-preview>
                <TableHeader>
                  <TableRow>
                    {columns.fields.map((row, index) => ({ row, column: watchedColumns[index] ?? row })).map(({ row, column }) => (
                      <TableHead key={row.id} className="bg-muted" style={column.width.trim() && /^\d+$/.test(column.width.trim()) ? { width: `${column.width.trim()}px` } : undefined}>
                        {column.title || "Sin nombre"}
                        {column.required ? <span className="text-destructive" aria-label="obligatoria"> *</span> : null}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: previewRows }, (_, row) => (
                    <TableRow key={row}>
                      {columns.fields.map((row, index) => ({ row, column: watchedColumns[index] ?? row })).map(({ row, column }) => (
                        <TableCell key={row.id} className="truncate text-muted-foreground">{cellHint(column)}</TableCell>
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
