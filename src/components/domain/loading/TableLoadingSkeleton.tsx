import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { range } from "./range"

export type TableLoadingSkeletonProps = {
  rows?: number
  columns?: number
  search?: boolean
  filters?: number
  pagination?: boolean
  actions?: boolean
  selectable?: boolean
  tabs?: number
  heading?: boolean
  widths?: string[]
  cellLines?: number | number[]
  badges?: number[]
  filterWidth?: string
  "data-skeleton"?: string
}

export function TableLoadingSkeleton({
  rows = 5,
  columns = 6,
  search = false,
  filters = 0,
  pagination = true,
  actions = true,
  selectable = false,
  tabs = 0,
  heading = false,
  widths,
  cellLines = 1,
  badges = [],
  filterWidth = "lg:w-48",
  "data-skeleton": marker,
}: TableLoadingSkeletonProps) {
  const columnCount = Math.max(2, columns)
  const dataColumns = columnCount - (actions ? 1 : 0)
  const linesFor = (column: number): number => Math.max(1, Array.isArray(cellLines) ? (cellLines[column - 1] ?? 1) : cellLines)
  const additional = dataColumns - 1
  const gridColumns = widths?.length
    ? `${selectable ? "2.5rem " : ""}${widths.join(" ")}`
    : `${selectable ? "2.5rem " : ""}minmax(0, 2fr)${additional > 0 ? ` repeat(${additional}, minmax(0, 1fr))` : ""}${actions ? " 3rem" : ""}`
  const minimumWidth = `calc(var(--layout-skeleton-leading-column) + ${dataColumns - 1} * var(--layout-skeleton-column)${actions ? " + 3rem" : ""}${selectable ? " + 2.5rem" : ""})`
  const isBadge = (column: number): boolean => badges.includes(column)
  const hasToolbar = search || filters > 0

  return (
    <div className="flex min-w-0 flex-col gap-4" data-skeleton={marker}>
      {tabs > 0 ? (
        <div data-skeleton="table-tabs" className="flex h-11 items-center gap-2">
          {range(tabs).map((tab) => (
            <div key={tab} className="flex h-full items-center gap-2 px-4">
              <Skeleton className="size-4" />
              <Skeleton className={cn("h-4", tab === 1 ? "w-28" : "w-20")} />
            </div>
          ))}
        </div>
      ) : null}

      {heading ? (
        <div data-skeleton="table-heading" className="-mb-1 flex h-5 items-center">
          <Skeleton className="h-4 w-28" />
        </div>
      ) : null}

      {hasToolbar ? (
        <div data-skeleton="table-toolbar">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            {search ? (
              <div className="min-w-0 lg:min-w-64 lg:flex-1">
                <Skeleton className="h-9 w-full" />
              </div>
            ) : null}
            {filters > 0 ? <Skeleton className="h-9 w-full sm:hidden" /> : null}
            {filters > 0 ? (
              <div data-skeleton="table-filters" className="hidden gap-3 sm:grid sm:grid-cols-2 lg:flex lg:items-end">
                {range(filters).map((filter) => (
                  <div key={filter} className={cn("min-w-0 lg:shrink-0", filterWidth)}>
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-w-0" data-skeleton="table-content">
        <div className="hidden overflow-x-auto rounded-md bg-card shadow-surface ring-1 ring-surface-ring sm:block" data-skeleton="table-desktop">
          <div style={{ minWidth: minimumWidth }}>
            <div className="grid h-10 items-stretch border-b" style={{ gridTemplateColumns: gridColumns }}>
              {selectable ? (
                <div className="flex items-center px-2">
                  <Skeleton className="size-4" />
                </div>
              ) : null}
              {range(columnCount).map((column) => (
                <div key={column} className={cn("flex min-w-0 items-center px-2", (selectable || column > 1) && "border-l border-border")}>
                  {actions && column === columnCount ? (
                    <Skeleton className="ml-auto h-3.5 w-12" />
                  ) : isBadge(column) ? (
                    <Skeleton className="mx-auto h-3.5 w-12" />
                  ) : (
                    <Skeleton className="h-3.5 w-3/4" />
                  )}
                </div>
              ))}
            </div>
            {range(rows).map((row) => (
              <div
                key={row}
                data-skeleton="table-row"
                className="grid items-stretch border-b last:border-b-0 odd:bg-card even:bg-muted/50"
                style={{ gridTemplateColumns: gridColumns }}
              >
                {selectable ? (
                  <div className="flex items-center px-2">
                    <Skeleton className="size-4" />
                  </div>
                ) : null}
                {range(columnCount).map((column) => (
                  <div key={column} className={cn("flex min-w-0 flex-col justify-center p-2", (selectable || column > 1) && "border-l border-border")}>
                    {actions && column === columnCount ? (
                      <Skeleton className="ml-auto size-8" />
                    ) : isBadge(column) ? (
                      <Skeleton data-skeleton="table-badge" className="mx-auto h-5.5 w-20 rounded-full" />
                    ) : (
                      <>
                        <div className="flex h-5 items-center">
                          <Skeleton className={cn("h-4", row % 2 === 0 ? "w-3/4" : "w-5/6")} />
                        </div>
                        {range(linesFor(column) - 1).map((line) => (
                          <div key={line} className="flex h-5 items-center">
                            <Skeleton className="h-3 w-2/3" />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:hidden" data-skeleton="table-mobile">
          {range(rows).map((row) => (
            <div
              key={row}
              data-skeleton="table-card"
              className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-card p-4 shadow-surface ring-1 ring-surface-ring odd:bg-card even:bg-secondary"
            >
              <div className="col-span-2 flex min-w-0 flex-col gap-1">
                <div className="flex h-6 items-center">
                  <Skeleton className="h-5 w-3/4" />
                </div>
                {range(linesFor(1) - 1).map((line) => (
                  <div key={line} className="flex h-5 items-center">
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
              {range(dataColumns - 1).map((cell) => (
                <div key={cell} className="flex min-w-0 flex-col">
                  <div className="mb-1 flex h-4 items-center">
                    <Skeleton className="h-3 w-16" />
                  </div>
                  {isBadge(cell + 1) ? (
                    <Skeleton className="h-5.5 w-20 rounded-full" />
                  ) : (
                    <>
                      <div className="flex h-5 items-center">
                        <Skeleton className="h-4 w-5/6" />
                      </div>
                      {range(linesFor(cell + 1) - 1).map((line) => (
                        <div key={line} className="flex h-5 items-center">
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))}
              {actions ? (
                <div className="col-span-2 flex items-center justify-between border-t pt-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="size-8" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {pagination ? <PaginationSkeleton /> : null}
    </div>
  )
}

export function PaginationSkeleton() {
  return (
    <div data-skeleton="table-pagination" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-4 w-16" />
      <div className="flex items-center gap-1">
        <Skeleton className="size-9 sm:w-24" />
        <Skeleton className="h-5 w-32 sm:hidden" />
        {range(3).map((page) => (
          <Skeleton key={page} className="hidden size-9 sm:block" />
        ))}
        <Skeleton className="size-9 sm:w-24" />
      </div>
    </div>
  )
}
