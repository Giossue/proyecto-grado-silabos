"use client"

import { CircleCheck, Eraser, Plus, Trash2, TriangleAlert } from "lucide-react"
import { Fragment, useEffect, useRef, type ComponentProps, type ReactNode } from "react"
import type { CatalogBook } from "@/api/libraryCatalog"
import { ChoiceGroup } from "@/components/domain/ChoiceGroup"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LibraryCatalogSearch } from "@/components/domain/syllabus/LibraryCatalogSearch"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { addCatalogBook, canAddCatalogBook } from "@/lib/blocks/catalog"
import { holds } from "@silabos/shared/lib/blocks/condition"
import { valueInLayoutOrder } from "@silabos/shared/lib/blocks/order"
import { ruleFailures, sumBudgets, sumOf, type SumBudget } from "@silabos/shared/lib/blocks/rules"
import { blockDefinition, templateRuntime } from "@/lib/blocks/runtime"
import { formatTotal, Scope, type Path } from "@silabos/shared/lib/blocks/scope"
import {
  guardNumber,
  isChoice,
  isText,
  numberDigits,
  numberText,
  plural,
  type ChoiceSchema,
  type ListSchema,
  type NumberSchema,
  type ObjectSchema,
  type TextSchema,
  type ValueSchema,
} from "@silabos/shared/lib/blocks/types"
import { emptyValue, getAt, setAt, settle } from "@silabos/shared/lib/blocks/values"
import { cn } from "@/lib/utils"

type Scalar = TextSchema | NumberSchema | ChoiceSchema

type BlockFormProps = {
  id: string
  kind: string
  blockProps: Record<string, unknown>
  value: Record<string, unknown>
  disabled?: boolean
  required?: boolean
  onValueChange?: (value: Record<string, unknown>) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

function BudgetLine({ budget: { label, used, limit } }: { budget: SumBudget }) {
  if (limit === null) {
    const total = formatTotal(used)
    return <li>{`${label} ${total} ${total === "1" ? "usada" : "usadas"}`}</li>
  }
  const left = limit - used
  const done = Math.abs(left) <= 0.001
  const over = !done && left < 0
  const amount = formatTotal(Math.abs(left))
  const verb = over ? "sobra" : "falta"
  const state = done ? "completo" : `${amount === "1" ? verb : `${verb}n`} ${amount}`
  return (
    <li className={cn("flex items-center gap-1.5", over && "font-medium text-destructive")}>
      {done ? <CircleCheck className="size-4" aria-hidden="true" /> : null}
      {over ? <TriangleAlert className="size-4" aria-hidden="true" /> : null}
      {`${label} ${formatTotal(used)} de ${formatTotal(limit)} · ${state}`}
    </li>
  )
}

export function GuardedNumberInput({ schema, ...props }: Omit<ComponentProps<typeof Input>, "ref"> & { schema: NumberSchema }) {
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const input = ref.current
    if (!input) return
    const guard = (event: Event): void => guardNumber(event as InputEvent, schema)
    input.addEventListener("beforeinput", guard)
    return () => input.removeEventListener("beforeinput", guard)
  }, [schema])

  return <Input ref={ref} inputMode="decimal" {...props} />
}

export function BlockForm({ id, kind, blockProps, value, disabled = false, required = false, onValueChange }: BlockFormProps) {
  const definition = blockDefinition(kind)
  const variables = templateRuntime().variables
  const budgets = definition ? sumBudgets(definition.rules, value, variables) : []
  const summedPaths = new Set(budgets.map((budget) => budget.path))

  const change = (next: Record<string, unknown>): void => {
    if (definition) onValueChange?.(settle(definition.value, next, blockProps))
  }
  const write = (path: Path, next: unknown): void => change(setAt(value, path, next) as Record<string, unknown>)
  const listOf = (path: Path): unknown[] => {
    const list = getAt(value, path)
    return Array.isArray(list) ? list : []
  }
  const fieldId = (path: Path): string => `${id}-${path.join("-")}`

  const applies = (schema: ValueSchema, path: Path): boolean => {
    if (!schema.keep_if) return true
    const parent = getAt(value, path.slice(0, -1))
    return holds(schema.keep_if, new Scope(isRecord(parent) ? parent : {}, blockProps, variables))
  }

  const input = (schema: Scalar, path: Path, label: string, inCell = false): ReactNode => {
    const inputId = fieldId(path)
    const current = getAt(value, path)
    const text = typeof current === "string" || typeof current === "number" ? String(current) : ""
    const ariaLabel = inCell ? label : undefined
    const flat = inCell ? "border-transparent bg-transparent shadow-none" : undefined
    if (isChoice(schema)) {
      return (
        <ChoiceGroup
          value={typeof current === "string" ? current : undefined}
          label={label}
          disabled={disabled}
          options={schema.oneOf.map((option) => ({ value: option.const, label: option.title }))}
          onValueChange={(next) => write(path, next)}
        />
      )
    }
    if (schema.type === "number") {
      const { digits, decimals } = numberDigits(schema)
      return (
        <GuardedNumberInput
          schema={schema}
          id={inputId}
          value={text}
          disabled={disabled}
          aria-label={ariaLabel}
          maxLength={digits + (decimals > 0 ? decimals + 1 : 0)}
          className={inCell ? `w-20 text-center ${flat}` : undefined}
          onChange={(event) => write(path, numberText(event.target.value, schema))}
        />
      )
    }
    if (schema.multiline) {
      return (
        <Textarea
          id={inputId}
          value={text}
          disabled={disabled}
          maxLength={schema.maxLength}
          aria-label={ariaLabel}
          className={cn("min-h-9", flat)}
          onChange={(event) => write(path, event.target.value)}
        />
      )
    }
    return (
      <Input
        id={inputId}
        value={text}
        disabled={disabled}
        maxLength={schema.maxLength}
        aria-label={ariaLabel}
        className={flat}
        onChange={(event) => write(path, event.target.value)}
      />
    )
  }

  const control = (schema: Scalar, path: Path, label: string): ReactNode => (
    <Field key={fieldId(path)}>
      <FieldLabel htmlFor={isChoice(schema) ? undefined : fieldId(path)} required={required}>
        {label}
      </FieldLabel>
      {input(schema, path, label)}
    </Field>
  )

  const fields = (entries: Array<[string, ValueSchema]>, path: Path, depth: number): ReactNode[] => {
    const nodes: ReactNode[] = []
    let numbers: ReactNode[] = []
    const flushNumbers = (): void => {
      if (numbers.length > 0) {
        nodes.push(
          <div key={`numbers-${nodes.length}`} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {numbers}
          </div>,
        )
      }
      numbers = []
    }
    for (const [key, schema] of entries) {
      const childPath = [...path, key]
      if (!applies(schema, childPath)) continue
      if (schema.type === "number") {
        numbers.push(control(schema, childPath, schema.title ?? key))
        continue
      }
      flushNumbers()
      nodes.push(<Fragment key={fieldId(childPath)}>{node(schema, childPath, schema.title ?? key, depth)}</Fragment>)
    }
    flushNumbers()
    return nodes
  }

  const offset = (path: Path): number => {
    let parent = path.length - 1
    while (parent >= 0 && typeof path[parent] !== "number") parent--
    if (parent < 0) return 0
    const index = Number(path[parent])
    const before = path.slice(0, parent)
    const after = path.slice(parent + 1)
    let total = 0
    for (let sibling = 0; sibling < index; sibling++) total += listOf([...before, sibling, ...after]).length
    return total
  }

  const canAdd = (path: Path, schema: ListSchema): boolean => {
    const list = listOf(path)
    if (disabled || list.length >= schema.maxItems || !definition) return false
    const next = setAt(value, path, [...list, emptyValue(schema.items, blockProps)]) as Record<string, unknown>
    return ruleFailures(definition.rules, next, variables, "save").length === 0
  }

  const removeButton = (schema: ListSchema, path: Path, index: number, name: string, tip = name): ReactNode => (
    <IconTooltip label={`Quitar ${tip}`}>
      <span className="inline-flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled || listOf(path).length <= schema.minItems}
          aria-label={`Quitar ${name}`}
          onClick={() => write(path, listOf(path).filter((_, position) => position !== index))}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </span>
    </IconTooltip>
  )

  const isBlank = (row: unknown): boolean => isRecord(row) && Object.values(row).every((cell) => String(cell ?? "").trim() === "")

  const clearButton = (schema: ListSchema, path: Path, index: number, name: string, tip = name): ReactNode => (
    <IconTooltip label={`Limpiar ${tip}`}>
      <span className="inline-flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled || isBlank(listOf(path)[index])}
          aria-label={`Limpiar ${name}`}
          onClick={() => write([...path, index], emptyValue(schema.items, blockProps))}
        >
          <Eraser aria-hidden="true" />
        </Button>
      </span>
    </IconTooltip>
  )

  const addButton = (schema: ListSchema, path: Path, name: string): ReactNode => (
    <Button type="button" variant="outline" size="sm" className="w-fit" disabled={!canAdd(path, schema)} onClick={() => write(path, [...listOf(path), emptyValue(schema.items, blockProps)])}>
      <Plus data-icon="inline-start" aria-hidden="true" />
      {`Agregar ${name}`}
    </Button>
  )

  const table = (schema: ListSchema, rows: ObjectSchema, path: Path): ReactNode => {
    const items = listOf(path)
    const name = schema.title ?? "elemento"
    const first = offset(path)
    const resizable = schema.minItems < schema.maxItems
    const clearable = path.length === 1 && definition?.catalog?.list === path[0]
    const columns = Object.entries(rows.properties) as Array<[string, Scalar]>
    const rowPath = [...path.map((segment) => (typeof segment === "number" ? "*" : segment)), "*"].join(".")
    const totalled = columns.map(([key]) => summedPaths.has(`${rowPath}.${key}`))
    const narrowText = columns.filter(([, column]) => column.type !== "number").length > 5

    return (
      <div className="flex min-w-0 flex-col gap-3">
        <Table label={capitalize(name)} cards={false}>
          <TableHeader>
            <TableRow>
              {columns.map(([key, column]) => (
                <TableHead key={key} className={column.type === "number" ? "w-20 text-center" : cn(narrowText ? "min-w-28" : "min-w-48", "whitespace-normal")}>
                  {column.title ?? key}
                </TableHead>
              ))}
              {resizable ? (
                <TableHead className={clearable ? "w-20" : "w-10"} data-sticky-end="">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((_, index) => {
              const itemPath = [...path, index]
              const rowName = `${name} ${first + index + 1}`
              return (
                <TableRow key={index}>
                  {columns.map(([key, column]) => (
                    <TableCell key={key} className="align-top">
                      {applies(column, [...itemPath, key]) ? input(column, [...itemPath, key], `${column.title ?? key}, ${rowName}`, true) : null}
                    </TableCell>
                  ))}
                  {resizable ? (
                    <TableCell className="align-top" data-sticky-end="">
                      {clearable ? (
                        <div className="flex">
                          {clearButton(schema, path, index, rowName, name)}
                          {removeButton(schema, path, index, rowName, name)}
                        </div>
                      ) : (
                        removeButton(schema, path, index, rowName, name)
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              )
            })}
          </TableBody>
          {totalled.includes(true) ? (
            <TableFooter>
              <TableRow>
                {columns.map(([key], position) => (
                  <TableCell key={key}>
                    {totalled[position] ? (
                      <span className="block w-20 text-center tabular-nums">{formatTotal(sumOf(items.map((item) => (isRecord(item) ? item[key] : undefined))))}</span>
                    ) : position === 0 ? (
                      "Total de horas"
                    ) : null}
                  </TableCell>
                ))}
                {resizable ? <TableCell data-sticky-end="" /> : null}
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
        {resizable ? addButton(schema, path, name) : null}
      </div>
    )
  }

  const list = (schema: ListSchema, path: Path, depth: number): ReactNode => {
    if (schema.items.type === "object" && Object.values(schema.items.properties).every((column) => column.type === "string" || column.type === "number")) {
      return table(schema, schema.items, path)
    }
    const items = listOf(path)
    const name = schema.title ?? "elemento"
    const first = offset(path)
    const resizable = schema.minItems < schema.maxItems
    const missing = (itemPath: Path): string[] => {
      if (schema.items.type !== "object") return []
      return Object.entries(schema.items.properties).flatMap(([key, child]) => {
        const childPath = [...itemPath, key]
        if (!applies(child, childPath)) return []
        const current = getAt(value, childPath)
        if (child.type === "array") return Array.isArray(current) && current.length > 0 ? [] : [plural(child.title ?? key)]
        if (isText(child)) return typeof current === "string" && current.trim() !== "" ? [] : [(child.title ?? key).toLowerCase()]
        return []
      })
    }
    const subtitle = (itemPath: Path): string => {
      if (schema.items.type !== "object") return ""
      const key = Object.entries(schema.items.properties).find(([, child]) => isText(child))?.[0]
      const current = key === undefined ? "" : getAt(value, [...itemPath, key])
      return typeof current === "string" ? current.trim() : ""
    }

    return (
      <div className="flex flex-col gap-4">
        <Accordion type="multiple" defaultValue={items.length > 0 ? ["0"] : []} className="rounded-lg px-3 ring-1 ring-surface-ring">
          {items.map((_, index) => {
            const itemPath = [...path, index]
            const title = `${capitalize(name)} ${first + index + 1}`
            const detail = subtitle(itemPath)
            const pending = missing(itemPath)
            const content = schema.items.type === "object" ? fields(Object.entries(schema.items.properties), itemPath, depth + 1) : node(schema.items, itemPath, title, depth + 1)
            return (
              <AccordionItem key={index} value={String(index)} aria-label={title}>
                <AccordionTrigger className="px-1 hover:no-underline">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold">{title}</span>
                    {detail ? <span className="line-clamp-1 font-normal text-muted-foreground">{detail}</span> : null}
                    {pending.length > 0 ? <span className="line-clamp-1 font-normal text-muted-foreground">{`Falta: ${pending.join(", ")}`}</span> : null}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-4 px-1 pt-1">
                  {content}
                  {resizable ? <div className="flex justify-end">{removeButton(schema, path, index, `${name} ${first + index + 1}`)}</div> : null}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
        {resizable ? addButton(schema, path, name) : null}
      </div>
    )
  }

  function node(schema: ValueSchema, path: Path, label: string, depth: number): ReactNode {
    if (schema.type === "object") return <div className="flex flex-col gap-4">{fields(Object.entries(schema.properties), path, depth)}</div>
    if (schema.type === "array") return list(schema, path, depth)
    return control(schema, path, label)
  }

  if (!definition) return <p className="text-muted-foreground">Bloque sin definición en la plantilla</p>
  const search = definition.catalog ? (
    <LibraryCatalogSearch
      disabled={disabled || !canAddCatalogBook(definition, value)}
      onPick={(book: CatalogBook) => {
        const next = addCatalogBook(definition, value, book, blockProps)
        if (next) change(next)
      }}
    />
  ) : null

  const shownBudgets = budgets.filter((budget) => budget.used !== 0 || (budget.limit !== null && budget.limit !== 0))

  return (
    <div id={id} className={cn("flex flex-col gap-4", shownBudgets.length > 0 && "[&_:is(input,textarea,button)]:scroll-mt-24 max-sm:[&_:is(input,textarea,button)]:scroll-mt-48")}>
      {shownBudgets.length > 0 ? (
        <div data-hours-budget="" className="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-card px-4 py-3 text-sm shadow-surface ring-1 ring-surface-ring max-sm:top-(--app-banner-height,0px)">
          <span className="font-semibold">Horas de la asignatura</span>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums" aria-live="polite">
            {shownBudgets.map((budget) => (
              <BudgetLine key={budget.path} budget={budget} />
            ))}
          </ul>
        </div>
      ) : null}
      {search}
      {fields(Object.entries(valueInLayoutOrder(definition)), [], 0)}
    </div>
  )
}
