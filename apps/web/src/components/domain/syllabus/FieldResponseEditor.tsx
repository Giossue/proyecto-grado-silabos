"use client"

import dynamic from "next/dynamic"
import { Plus, Trash2 } from "lucide-react"
import { Fragment, type ReactNode } from "react"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { BlockForm } from "@/components/domain/syllabus/BlockForm"
import { ResponseAnswer } from "@/components/domain/syllabus/ResponseAnswer"
import { renderFreeText } from "@/components/domain/syllabus/freeTextRender"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { templateRuntime } from "@/lib/blocks/runtime"
import { fieldCharacters, fitCharacters, textCharacters } from "@/lib/fieldLimits"
import { blankResponse, cloneResponse, emptiedRows, replaceResponse, responseAt, responseDocument, responseListTable, responseText, templateRows } from "@/lib/fieldResponses"
import { onlyHiddenResponses, responseShown } from "@/lib/responseConditions"
import {
  RESPONSE_NODE,
  responseAnswered,
  responseAttrs,
  responseLines,
  withinResponse,
} from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { Skeleton } from "@/components/ui/skeleton"

const FreeTextEditor = dynamic(() => import("@/components/domain/syllabus/FreeTextEditor").then((module) => module.FreeTextEditor), {
  loading: () => <Skeleton className="h-24 w-full" />,
})

type FieldResponseEditorProps = {
  id: string
  label: string
  template?: DocumentNode | null
  value?: DocumentNode | null
  disabled?: boolean
  required?: boolean
  career?: boolean
  rewrite?: boolean
  rowTables?: boolean[]
  askFor?: string
  answers?: Record<string, unknown> | null
  limit?: number | null
  onValueChange?: (value: DocumentNode) => void
}

const isHeaderRow = (row: DocumentNode): boolean => Boolean(row.content?.length) && row.content!.every((cell) => cell.type === "tableHeader")

const headerColumns = (headers: DocumentNode[]): string[] => {
  const grid: string[][] = headers.map(() => [])
  headers.forEach((row, rowIndex) => {
    let column = 0
    for (const cell of row.content ?? []) {
      while (grid[rowIndex]![column] !== undefined) column++
      const text = responseText(cell).trim()
      for (let down = 0; down < Number(cell.attrs?.rowspan ?? 1) && rowIndex + down < headers.length; down++) {
        for (let across = 0; across < Number(cell.attrs?.colspan ?? 1); across++) grid[rowIndex + down]![column + across] = text
      }
      column += Number(cell.attrs?.colspan ?? 1)
    }
  })
  return grid[grid.length - 1] ?? []
}

const onlyBlocks = (document: DocumentNode): boolean =>
  (document.content ?? []).some((node) => node.type === "documentBlock") && (document.content ?? []).every((node) => node.type === "documentBlock" || blankResponse(node))

const hasResponse = (node: DocumentNode): boolean => blankResponse(node) || node.type === "documentBlock" || node.type === RESPONSE_NODE || (node.content ?? []).some(hasResponse)

const lineText = (node: DocumentNode): string => (node.content ?? []).map((part) => (part.type === "hardBreak" ? "\n" : (part.text ?? ""))).join("")

const inline = (text: string): DocumentNode[] =>
  text.split("\n").flatMap((line, index) => [...(index > 0 ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])])

const variable = (id: string): string => templateRuntime().variables[id] ?? ""

export function FieldResponseEditor({
  id,
  label,
  template = null,
  value = null,
  disabled = false,
  required = false,
  career = false,
  rewrite = false,
  rowTables,
  askFor = "al coordinador",
  answers = null,
  limit = null,
  onValueChange,
}: FieldResponseEditorProps) {
  if (career) {
    return (
      <FreeTextEditor
        id={id}
        label={label}
        value={value ?? template}
        disabled={disabled}
        allowTables={false}
        spaces
        rowTables={template ? templateRows(template) : undefined}
        onValueChange={(next) => onValueChange?.(next)}
      />
    )
  }
  if (rewrite) {
    return (
      <FreeTextEditor
        id={id}
        label={label}
        value={value}
        disabled={disabled}
        allowTables={false}
        lockTables
        rowTables={rowTables && value ? emptiedRows(value, rowTables) : undefined}
        onValueChange={(next) => onValueChange?.(next)}
      />
    )
  }
  const document = template ? responseDocument(template, value) : value
  const used = limit === null ? 0 : fieldCharacters(template, document, answers ?? {})
  const budget = (): number | null => (limit === null ? null : limit - used)
  const keyOf = (path: number[]): string => `${id}-${path.join("-")}`

  const update = (path: number[], next: DocumentNode): void => {
    if (!disabled && document) onValueChange?.(replaceResponse(document, path, next))
  }
  const response = (source: DocumentNode, path: number[], name: string): ReactNode => {
    if (answers && !responseShown(source, answers)) return null
    const current = responseAt(document!, path)
    if (responseAnswered(responseAttrs(source))) {
      return (
        <span key={keyOf(path)} className="py-1 text-muted-foreground">
          {responseLines(responseAttrs(source)).join(", ")}
        </span>
      )
    }
    return (
      <ResponseAnswer
        key={keyOf(path)}
        attrs={responseAttrs(current)}
        label={name}
        disabled={disabled}
        askFor={askFor}
        budget={budget()}
        onValueChange={(next) => update(path, { ...current, attrs: { ...current.attrs, value: next as never } })}
      />
    )
  }
  const hiddenLine = (node: DocumentNode): boolean => Boolean(answers) && onlyHiddenResponses(node, answers!)
  const line = (source: DocumentNode, path: number[], name: string): ReactNode =>
    hiddenLine(source) ? null : (
      <div className="flex flex-wrap items-start gap-2 text-sm">
        {(source.content ?? []).map((child, index) =>
          child.type === RESPONSE_NODE ? (
            <Fragment key={index}>{response(child, [...path, index], name)}</Fragment>
          ) : (
            <span key={index} className="py-1 text-muted-foreground">
              {renderFreeText(child, { variable })}
            </span>
          ),
        )}
      </div>
    )

  const slot = (source: DocumentNode, path: number[], name: string, visibleLabel: boolean): ReactNode => {
    const slotId = keyOf(path)
    const current = responseAt(document!, path)
    const paragraph = source.type === "paragraph"
    const text = paragraph ? lineText(current) : (current.content ?? []).map(lineText).join("\n")
    const room = budget()
    const own = textCharacters(current)
    const write = (raw: string): void => {
      const next = room === null ? raw : fitCharacters(raw, Math.max(own, own + room), false)
      update(
        path,
        paragraph
          ? { ...source, content: inline(next) }
          : { ...source, content: next.split("\n").map((part) => ({ ...(source.content?.[0] ?? { type: "paragraph" }), content: part ? [{ type: "text", text: part }] : [] })) },
      )
    }
    return (
      <Field key={slotId}>
        {visibleLabel ? <FieldLabel htmlFor={slotId}>{name}</FieldLabel> : null}
        <Textarea
          id={slotId}
          value={text}
          disabled={disabled}
          maxLength={room === null ? undefined : text.length + Math.max(0, room)}
          className={visibleLabel ? "min-h-9" : "min-h-9 border-transparent bg-transparent shadow-none"}
          aria-label={visibleLabel ? undefined : name}
          onChange={(event) => write(event.target.value)}
        />
      </Field>
    )
  }

  const table = (source: DocumentNode, path: number[]): ReactNode => {
    const current = responseAt(document!, path)
    const rows = source.content ?? []
    const values = current.content ?? []
    const headers = rows.filter(isHeaderRow)
    const columns = headerColumns(headers)
    const list = responseListTable(source)
    let position = 0
    const body = values.map((_, index) => {
      const rowTemplate = rows[index] ?? rows[rows.length - 1]!
      if (isHeaderRow(rowTemplate)) return null
      position++
      const number = position
      let column = 0
      const cells = (rowTemplate.content ?? []).map((cell, cellIndex) => {
        const name = columns[column] || `Columna ${column + 1}`
        const colSpan = Number(cell.attrs?.colspan ?? 1)
        const rowSpan = Number(cell.attrs?.rowspan ?? 1)
        column += colSpan
        const cellPath = [...path, index, cellIndex]
        if (hiddenLine(blankResponse(cell) ? responseAt(document!, cellPath) : cell)) return <TableCell key={cellIndex} colSpan={colSpan} rowSpan={rowSpan} className="align-top" />
        if (blankResponse(cell)) {
          return (
            <TableCell key={cellIndex} colSpan={colSpan} rowSpan={rowSpan} className="min-w-40 align-top">
              {blankSlot(cell, cellPath, `${name}, fila ${number}`)}
            </TableCell>
          )
        }
        if (hasResponse(cell)) {
          return (
            <TableCell key={cellIndex} colSpan={colSpan} rowSpan={rowSpan} className="min-w-40 align-top">
              {nodes(cell, cellPath, `${name}, fila ${number}`)}
            </TableCell>
          )
        }
        return (
          <TableCell key={cellIndex} colSpan={colSpan} rowSpan={rowSpan} className="align-top text-sm">
            {responseText(cell).trim()}
          </TableCell>
        )
      })
      return (
        <TableRow key={index}>
          {cells}
          {list ? (
            <TableCell className="w-10 align-top" data-sticky-end="">
              <IconTooltip label={`Quitar fila ${number}`}>
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled || values.length <= rows.length}
                    aria-label={`Quitar fila ${number}`}
                    onClick={() => update(path, { ...current, content: values.filter((__, other) => other !== index) })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </span>
              </IconTooltip>
            </TableCell>
          ) : null}
        </TableRow>
      )
    })
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <Table label={label} cards={false}>
          {headers.length > 0 ? (
            <TableHeader>
              {headers.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {(row.content ?? []).map((cell, cellIndex) => (
                    <TableHead key={cellIndex} colSpan={Number(cell.attrs?.colspan ?? 1)} rowSpan={Number(cell.attrs?.rowspan ?? 1)} className="h-auto py-2 whitespace-normal">
                      {responseText(cell).trim()}
                    </TableHead>
                  ))}
                  {list && rowIndex === 0 ? (
                    <TableHead rowSpan={headers.length} className="w-10" data-sticky-end="">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              ))}
            </TableHeader>
          ) : null}
          <TableBody>{body}</TableBody>
        </Table>
        {list ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={disabled || values.length >= 100}
            onClick={() => update(path, { ...current, content: [...values, cloneResponse(rows[rows.length - 1]!)] })}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            Agregar fila
          </Button>
        ) : null}
      </div>
    )
  }

  const blankSlot = (source: DocumentNode, path: number[], name: string): ReactNode => {
    const current = responseAt(document!, path)
    if (withinResponse(current)) return current.type === "paragraph" ? line(current, path, name) : <div className="flex flex-col gap-2">{nodes(current, path, name)}</div>
    return slot(source, path, name, false)
  }

  const renderNode = (source: DocumentNode, path: number[], name: string = label): ReactNode => {
    const current = responseAt(document!, path)
    if (source.type === "documentBlock") {
      return (
        <BlockForm
          id={keyOf(path)}
          kind={String(current.attrs?.kind ?? "")}
          blockProps={(current.attrs?.props ?? {}) as Record<string, unknown>}
          value={(current.attrs?.value ?? {}) as Record<string, unknown>}
          disabled={disabled}
          required={required}
          onValueChange={(next) => update(path, { ...responseAt(document!, path), attrs: { ...current.attrs, value: next } })}
        />
      )
    }
    if (source.type === RESPONSE_NODE) return response(source, path, name)
    if (blankResponse(source)) return blankSlot(source, path, name)
    if (source.type === "paragraph" && hasResponse(source)) return line(source, path, name)
    if (source.type === "table" && hasResponse(source)) return table(source, path)
    if (hasResponse(source)) return <div className="flex flex-col gap-4">{nodes(source, path, name)}</div>
    return <div className="text-sm text-muted-foreground">{renderFreeText(current, { variable })}</div>
  }

  function nodes(source: DocumentNode, path: number[], name: string = label): ReactNode[] {
    return (source.content ?? []).map((child, index) => (
      <Fragment key={index}>{renderNode(child, [...path, index], name)}</Fragment>
    ))
  }

  if ((!template || blankResponse(template)) && value && onlyBlocks(value)) {
    return (
      <div id={id} className="flex min-w-0 flex-col gap-4" role="group" aria-label={label}>
        {(value.content ?? []).map((node, index) =>
          node.type === "documentBlock" ? (
            <Fragment key={index}>{renderNode(node, [index])}</Fragment>
          ) : null,
        )}
      </div>
    )
  }
  if (!template || blankResponse(template)) {
    return (
      <FreeTextEditor
        id={id}
        label={label}
        value={value ?? template}
        disabled={disabled}
        allowTables={false}
        limit={limit}
        onValueChange={(next) => onValueChange?.(next)}
      />
    )
  }

  return (
    <div id={id} className="flex min-w-0 flex-col gap-4" role="group" aria-label={label}>
      {nodes(template, [])}
    </div>
  )
}
