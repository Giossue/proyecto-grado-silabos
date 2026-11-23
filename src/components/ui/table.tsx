"use client"

import * as React from "react"
import { cn } from "cn"
import { InboxIcon } from "lucide-react"

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { withoutFinalPeriodText } from "@/components/ui/plain-text"
import { useHorizontalOverflow } from "@/components/ui/use-horizontal-overflow"

type TableSection = "header" | "body" | "footer"

const TableSectionContext = React.createContext<TableSection>("header")

function Table({
  className,
  label,
  cards = true,
  ...props
}: React.ComponentProps<"table"> & { label?: string; cards?: boolean }) {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null)
  const { canScrollLeft, canScrollRight, overflows } =
    useHorizontalOverflow(container)

  return (
    <div className="relative w-full min-w-0">
      <div
        ref={setContainer}
        data-slot="table-container"
        className="w-full overflow-x-auto overflow-y-hidden rounded-md bg-card shadow-surface ring-1 ring-surface-ring [&:has(>table[data-cards=true])]:max-sm:shadow-none [&:has(>table[data-cards=true])]:max-sm:ring-0 [&:has(>table[data-cards=true])]:max-sm:overflow-visible [&:has(>table[data-cards=true])]:max-sm:bg-transparent"
        tabIndex={overflows ? 0 : undefined}
        role={overflows ? "region" : undefined}
        aria-label={
          overflows ? (label ?? "Tabla con desplazamiento horizontal") : undefined
        }
      >
        <table
          data-slot="table"
          role="table"
          aria-label={label}
          data-overflows={overflows ? "true" : "false"}
          data-cards={cards ? "true" : "false"}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
      <div
        data-table-edge="left"
        className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent"
        style={canScrollLeft ? undefined : { display: "none" }}
        aria-hidden="true"
      />
      <div
        data-table-edge="right"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
        style={canScrollRight ? undefined : { display: "none" }}
        aria-hidden="true"
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      role="rowgroup"
      className={cn("bg-field dark:bg-muted [&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <TableSectionContext.Provider value="body">
      <tbody
        data-slot="table-body"
        role="rowgroup"
        className={cn("[&_tr:last-child]:border-0", className)}
        {...props}
      />
    </TableSectionContext.Provider>
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

const annotateCardRow = (node: HTMLTableRowElement): void => {
  const table = node.closest("table")
  if (table?.dataset.cards !== "true") return
  const names = Array.from(
    table.querySelectorAll(":scope > thead > tr:last-child > th")
  ).map((head) => head.textContent?.trim() ?? "")
  const cells = Array.from(node.children).filter(
    (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
  )
  node.dataset.cardEmpty = String(cells.length === 1 && cells[0].colSpan > 1)
  let titled = false
  let selectable = false
  let column = 0
  for (const cell of cells) {
    const name = names[column] ?? ""
    const text = cell.textContent?.trim() ?? ""
    const isActions = cell.querySelector("[data-table-actions]") !== null
    const isSelect: boolean =
      !isActions &&
      !selectable &&
      name === "" &&
      cell.querySelector('[role="checkbox"], input[type="checkbox"]') !== null
    let role = "data"
    if (isActions) role = "actions"
    else if (isSelect) role = "select"
    else if (
      !titled &&
      text !== "" &&
      !["Fila", "#"].includes(name) &&
      cell.colSpan === 1
    ) {
      role = "title"
      titled = true
    }
    cell.dataset.label =
      role === "data" && cell.dataset.cardNoLabel !== "true" ? name : ""
    cell.dataset.cardRole = role
    selectable ||= isSelect
    const wide =
      text.length > 22 ||
      cell.querySelector('input, select, textarea, [role="combobox"], table') !==
        null ||
      cell.dataset.cardSpan === "full"
    cell.dataset.cardWide = String(role === "data" && wide)
    column += cell.colSpan
  }
}

function TableRow({
  className,
  ref,
  ...props
}: React.ComponentProps<"tr">) {
  const section = React.useContext(TableSectionContext)
  const row = React.useRef<HTMLTableRowElement | null>(null)
  const composedRef = React.useCallback(
    (node: HTMLTableRowElement | null) => {
      row.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  React.useLayoutEffect(() => {
    if (row.current && section === "body") annotateCardRow(row.current)
  })

  return (
    <tr
      ref={composedRef}
      data-slot="table-row"
      role="row"
      className={cn(
        "border-b transition-colors",
        section === "body"
          ? "odd:bg-card even:bg-muted/50 hover:bg-muted data-[state=selected]:bg-muted"
          : "data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, scope, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      role={scope === "row" ? "rowheader" : "columnheader"}
      scope={scope}
      className={cn(
        "text-foreground h-10 border-l border-border px-2 text-left first:border-l-0 align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      role="cell"
      className={cn(
        "border-l border-border p-2 align-middle whitespace-normal break-words first:border-l-0 [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

function TableEmpty({
  className,
  colSpan = 1,
  children,
  ...props
}: React.ComponentProps<"td">) {
  return (
    <TableRow>
      <TableCell
        className={cn("h-40 p-0 whitespace-normal align-middle", className)}
        colSpan={colSpan}
        {...props}
      >
        <Empty className="gap-3 rounded-none border-0 p-6 md:p-10">
          <EmptyHeader className="gap-3">
            <EmptyMedia className="text-muted-foreground [&_svg]:size-6">
              <InboxIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-normal text-muted-foreground">
              {withoutFinalPeriodText(children)}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      </TableCell>
    </TableRow>
  )
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
}
