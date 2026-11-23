"use client"

import { Minus, Plus } from "lucide-react"
import { createElement, type ReactNode } from "react"
import type { CatalogBook } from "@/api/libraryCatalog"
import { ChoiceGroup } from "@/components/domain/ChoiceGroup"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { GuardedNumberInput } from "@/components/domain/syllabus/BlockForm"
import { LibraryCatalogSearch } from "@/components/domain/syllabus/LibraryCatalogSearch"
import { renderFreeText, type RenderOptions } from "@/components/domain/syllabus/freeTextRender"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { addCatalogBook, canAddCatalogBook } from "@/lib/blocks/catalog"
import { holds } from "@/lib/blocks/condition"
import { ruleFailures, ruleResults } from "@/lib/blocks/rules"
import { blockDefinition, templateRuntime } from "@/lib/blocks/runtime"
import { Scope, type Path } from "@/lib/blocks/scope"
import { isChoice, isText, numberDigits, numberText, optionTitle, type BlockDefinition, type ListSchema, type ValueSchema } from "@/lib/blocks/types"
import { emptyValue, getAt, setAt, settle } from "@/lib/blocks/values"
import { resolveBlock, toDocument, type ResolvedNode } from "@/lib/blocks/walk"
import type { DocumentNode } from "@/lib/templateDocument"

export type BlockMode = "read" | "fill" | "configure"

type DocumentBlockContentProps = {
  kind: string
  blockProps: Record<string, unknown>
  value: Record<string, unknown>
  mode?: BlockMode
  labels?: Record<string, string>
  onValueChange?: (value: Record<string, unknown>) => void
  onPropsChange?: (props: Record<string, unknown>) => void
}

const describePath = (definition: BlockDefinition, path: Path): { label: string; where: string } => {
  const parts: string[] = []
  let label = ""
  let schema: ValueSchema | undefined = { type: "object", properties: definition.value }
  for (const segment of path) {
    if (!schema) break
    if (typeof segment === "number") {
      if (schema.type === "array") {
        parts.push(`${schema.title ?? "fila"} ${segment + 1}`)
        schema = schema.items
      }
      continue
    }
    schema = schema.type === "object" ? schema.properties[segment] : undefined
    label = schema?.title ?? label
  }

  return { label, where: parts.join(", ") }
}

const EMPTY_LABELS: Record<string, string> = {}

export function DocumentBlockContent({ kind, blockProps, value, mode = "read", labels = EMPTY_LABELS, onValueChange, onPropsChange }: DocumentBlockContentProps) {
  const definition = blockDefinition(kind)
  const variables = templateRuntime().variables

  const variable = (id: string): ReactNode => {
    const label = labels[id]
    return label ? (
      <span className="document-variable" data-variable={id} contentEditable={false}>
        {label}
      </span>
    ) : (variables[id] ?? "")
  }

  const change = (next: Record<string, unknown>): void => {
    if (definition) onValueChange?.(settle(definition.value, next, blockProps))
  }
  const write = (path: Path, next: unknown): void => change(setAt(value, path, next) as Record<string, unknown>)
  const parentAllows = (path: Path, schema: ValueSchema | null): boolean => {
    if (!schema?.keep_if) return true
    const parent = getAt(value, path.slice(0, -1))
    return holds(schema.keep_if, new Scope(typeof parent === "object" && parent !== null && !Array.isArray(parent) ? (parent as Record<string, unknown>) : {}, blockProps, variables))
  }

  const control = (node: ResolvedNode): ReactNode => {
    const slot = node.slot!
    const schema = slot.schema
    const current = getAt(value, slot.path)
    const described = definition ? describePath(definition, slot.path) : { label: "", where: "" }
    const label = [described.label || "Dato", described.where].filter(Boolean).join(", ")
    const disabled = !parentAllows(slot.path, schema)
    if (isChoice(schema) && slot.option !== undefined) {
      return (
        <Checkbox
          checked={current === slot.option}
          disabled={disabled}
          aria-label={`${label}: ${optionTitle(schema, slot.option) || slot.option}`}
          onCheckedChange={(checked) => write(slot.path, checked === true ? slot.option : null)}
        />
      )
    }
    if (isChoice(schema)) {
      return (
        <ChoiceGroup
          value={typeof current === "string" ? current : undefined}
          label={label}
          disabled={disabled}
          options={schema.oneOf.map((option) => ({ value: option.const, label: option.title }))}
          onValueChange={(next) => write(slot.path, next)}
        />
      )
    }
    const text = typeof current === "string" || typeof current === "number" ? String(current) : ""
    if (schema?.type === "number") {
      const { digits, decimals } = numberDigits(schema)
      return (
        <GuardedNumberInput
          schema={schema}
          value={text}
          disabled={disabled}
          maxLength={digits + (decimals > 0 ? decimals + 1 : 0)}
          className="h-7 w-full max-w-16 min-w-10 px-1 py-0 text-center"
          aria-label={label}
          onChange={(event) => write(slot.path, numberText(event.target.value, schema))}
        />
      )
    }
    if (isText(schema) && schema.multiline) {
      return (
        <Textarea
          value={text}
          disabled={disabled}
          maxLength={schema.maxLength}
          className="min-h-14 w-full min-w-0 px-2 py-1"
          aria-label={label}
          onChange={(event) => write(slot.path, event.target.value)}
        />
      )
    }
    return (
      <Input
        value={text}
        disabled={disabled}
        maxLength={isText(schema) ? schema.maxLength : 1000}
        className="h-7 w-full min-w-0 px-2 py-0"
        aria-label={label}
        onChange={(event) => write(slot.path, event.target.value)}
      />
    )
  }

  const listOf = (path: Path): unknown[] => {
    const list = getAt(value, path)
    return Array.isArray(list) ? list : []
  }
  const resizable = (schema: ListSchema): boolean => schema.minItems < schema.maxItems
  const canAdd = (path: Path, schema: ListSchema): boolean => {
    const list = listOf(path)
    if (list.length >= schema.maxItems || !definition) return false
    const next = setAt(value, path, [...list, emptyValue(schema.items, blockProps)]) as Record<string, unknown>
    return ruleFailures(definition.rules, next, variables, "save").length === 0
  }

  const table = (node: ResolvedNode, options: RenderOptions): ReactNode => {
    const rows = (node.content ?? []) as ResolvedNode[]
    const lists = new Map<string, { path: Path; schema: ListSchema }>()
    for (const row of rows) {
      if (mode === "fill" && row.row && resizable(row.row.schema)) lists.set(JSON.stringify(row.row.listPath), { path: row.row.listPath, schema: row.row.schema })
    }
    const slots = (item: ResolvedNode): number => (item.type === "slot" ? 1 : 0) + (item.content ?? []).reduce((sum, child) => sum + slots(child as ResolvedNode), 0)
    const dense = rows.some((row) => slots(row) >= 4)
    if (lists.size === 0 && !dense) return undefined
    const extra = (row: ResolvedNode): ReactNode => {
      if (!row.row || !resizable(row.row.schema) || row.row.index < 0) return <td className="w-10 border-0" />
      const { listPath, index, schema } = row.row
      const where = definition ? describePath(definition, [...listPath, index]).where : ""
      return (
        <td className="w-10 border-0 align-middle">
          <IconTooltip label={`Quitar ${where}`}>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={listOf(listPath).length <= schema.minItems}
                aria-label={`Quitar ${where}`}
                onClick={() => {
                  const list = [...listOf(listPath)]
                  list.splice(index, 1)
                  write(listPath, list)
                }}
              >
                <Minus aria-hidden="true" />
              </Button>
            </span>
          </IconTooltip>
        </td>
      )
    }
    const body = rows
      .filter((row) => !row.row?.placeholder)
      .map((row) => createElement("tr", null, ...(row.content ?? []).map((cell) => renderFreeText(cell, options)), ...(lists.size > 0 ? [extra(row)] : [])))

    return (
      <div className="flex flex-col gap-1">
        <div className="-m-1 overflow-x-auto p-1">{createElement("table", { className: dense ? "free-text-table min-w-208" : "free-text-table" }, createElement("tbody", null, ...body))}</div>
        {[...lists.values()].map(({ path, schema }) => {
          const where = definition ? describePath(definition, path).where : ""
          return (
            <Button
              key={JSON.stringify(path)}
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={!canAdd(path, schema)}
              aria-label={`Agregar ${schema.title ?? "fila"}${where ? ` (${where})` : ""}`}
              onClick={() => write(path, [...listOf(path), emptyValue(schema.items, blockProps)])}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              {`Agregar ${schema.title ?? "fila"}`}
            </Button>
          )
        })}
      </div>
    )
  }

  const fillOptions: RenderOptions = {
    node: (node, options) => {
      const resolved = node as ResolvedNode
      if (resolved.type === "slot" && resolved.slot) return control(resolved)
      if (resolved.type === "table") return table(resolved, options)
      return undefined
    },
  }

  const summary = (): ReactNode => {
    if (!definition) return null
    const results = definition.rules.filter((rule) => rule.on === "submit").flatMap((rule) => ruleResults(rule, value, variables).filter((result) => result.label !== null))
    if (results.length === 0) return null
    const hint = definition.rules.find((rule) => rule.on === "submit" && rule.hint)?.hint
    return (
      <div data-block-summary="" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {results.map((result, index) => (
          <span key={index} className={result.ok ? undefined : "font-medium text-foreground"}>{`${result.label} ${result.actual} de ${result.expected}`}</span>
        ))}
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </div>
    )
  }

  if (!definition) return <p className="text-muted-foreground">Bloque sin definición en la plantilla</p>
  if (mode === "configure" && Object.keys(definition.props).length > 0) {
    return (
      <div className="flex flex-col gap-2 rounded-md border p-2">
        <span className="text-xs font-medium text-muted-foreground">{definition.label}</span>
        {Object.entries(definition.props).map(([key, schema]) => {
          const label = schema.title ?? key
          return (
            <Input
              key={key}
              value={typeof blockProps[key] === "string" ? (blockProps[key] as string) : ""}
              maxLength={schema.maxLength}
              placeholder={label}
              aria-label={label}
              onChange={(event) => onPropsChange?.({ ...blockProps, [key]: event.target.value })}
            />
          )
        })}
      </div>
    )
  }
  const resolved = resolveBlock(definition, blockProps, value, variables)
  if (mode !== "fill") return createElement("div", { className: "document-block" }, ...toDocument(resolved).map((child) => renderFreeText(child, { variable })))
  const search = definition.catalog ? (
    <LibraryCatalogSearch
      disabled={!canAddCatalogBook(definition, value)}
      onPick={(book: CatalogBook) => {
        const next = addCatalogBook(definition, value, book, blockProps)
        if (next) change(next)
      }}
    />
  ) : null

  return createElement(
    "div",
    { className: "document-block flex flex-col gap-2" },
    search,
    summary(),
    ...resolved.map((child) => renderFreeText(child as DocumentNode, { ...fillOptions, variable })),
  )
}
