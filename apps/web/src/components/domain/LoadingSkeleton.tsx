import { AcademicLoadingSkeleton } from "@/components/domain/loading/AcademicLoadingSkeleton"
import { DashboardLoadingSkeleton } from "@/components/domain/loading/DashboardLoadingSkeleton"
import { DocumentLoadingSkeleton } from "@/components/domain/loading/DocumentLoadingSkeleton"
import { MetricsLoadingSkeleton } from "@/components/domain/loading/MetricsLoadingSkeleton"
import { range } from "@/components/domain/loading/range"
import { SettingsLoadingSkeleton, type SettingsSection } from "@/components/domain/loading/SettingsLoadingSkeleton"
import { SetupLoadingSkeleton } from "@/components/domain/loading/SetupLoadingSkeleton"
import { PaginationSkeleton, TableLoadingSkeleton } from "@/components/domain/loading/TableLoadingSkeleton"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export type LoadingVariant =
  | "table"
  | "table-body"
  | "table-detail"
  | "detail"
  | "form"
  | "document"
  | "dashboard"
  | "setup"
  | "academic"
  | "catalog"
  | "academic-structure"
  | "notifications"
  | "cards"
  | "syllabus-cards"
  | "accordion"
  | "workspace"
  | "syllabus"
  | "review"
  | "preview"
  | "documents"
  | "source"
  | "template"
  | "comparison"
  | "settings"

export type LoadingSkeletonProps = {
  variant?: LoadingVariant
  rows?: number
  columns?: number
  mode?: "curriculum" | "schedule" | "teachers"
  filters?: number
  search?: boolean
  pagination?: boolean
  actions?: boolean
  cellLines?: number | number[]
  badges?: number[]
  filterWidth?: string
  selectable?: boolean
  chip?: boolean
  tabs?: number
  heading?: boolean
  widths?: string[]
  sidebar?: boolean
  workspaceCount?: number
  reviewStage?: "coordination" | "library"
  settingsSection?: SettingsSection
  metrics?: boolean
}

const DOCUMENT_VARIANTS = ["syllabus", "review", "preview", "template", "comparison", "documents"] as const
type DocumentVariant = (typeof DOCUMENT_VARIANTS)[number]
const isDocumentVariant = (variant: LoadingVariant): variant is DocumentVariant => (DOCUMENT_VARIANTS as readonly string[]).includes(variant)

function LoadingBody({
  variant = "table",
  rows = 5,
  columns = 6,
  mode,
  filters = 0,
  search,
  pagination = true,
  actions = true,
  cellLines = 1,
  badges,
  filterWidth,
  selectable = false,
  tabs = 0,
  heading = false,
  widths,
  sidebar = false,
  workspaceCount = 3,
  reviewStage,
  settingsSection,
}: LoadingSkeletonProps) {
  const tableProps = {
    rows,
    columns,
    search: search ?? variant !== "table-body",
    filters,
    pagination,
    actions,
    cellLines,
    badges,
    filterWidth,
    selectable,
    tabs,
    heading,
    widths,
  }

  if (variant === "table-body" || variant === "table" || variant === "catalog" || variant === "academic") return <TableLoadingSkeleton {...tableProps} />

  if (variant === "table-detail") {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <Skeleton className="h-5 w-52 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent>
          <TableLoadingSkeleton {...tableProps} />
        </CardContent>
      </Card>
    )
  }

  if (variant === "syllabus-cards") {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <div data-skeleton="table-toolbar" className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <Skeleton className="h-9 w-full lg:min-w-64 lg:flex-1" />
          <Skeleton className="h-9 w-full sm:hidden" />
          <Skeleton className="hidden h-9 sm:block lg:w-48" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {range(Math.max(1, rows)).map((card) => (
            <Card key={card} className="min-w-0" data-skeleton="syllabus-card">
              <CardHeader className="gap-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        {pagination ? <PaginationSkeleton /> : null}
      </div>
    )
  }

  if (variant === "accordion") {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <div data-skeleton="table-toolbar" className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <Skeleton className="h-9 w-full lg:min-w-64 lg:flex-1" />
          {filters > 0 ? <Skeleton className="h-9 w-full sm:hidden" /> : null}
          {filters > 0 ? (
            <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:flex lg:items-end">
              {range(filters).map((filter) => (
                <Skeleton key={filter} className="h-9 w-full lg:w-44" />
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {range(Math.max(1, rows)).map((group) => (
            <div key={group} data-skeleton="accordion-row" className="flex items-center gap-2 rounded-md bg-card px-4 py-3 ring-1 ring-surface-ring">
              <Skeleton className="h-5 w-20" />
              <span className="flex-1" />
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="size-4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === "dashboard") return <DashboardLoadingSkeleton />

  if (variant === "setup") return <SetupLoadingSkeleton steps={5} />

  if (variant === "settings") return <SettingsLoadingSkeleton section={settingsSection} rows={rows} />

  if (variant === "academic-structure") return <AcademicLoadingSkeleton mode={mode} rows={rows} />

  if (isDocumentVariant(variant)) return <DocumentLoadingSkeleton variant={variant} rows={rows} reviewStage={reviewStage} />

  if (variant === "notifications") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          {range(rows).map((notification) => (
            <div
              key={notification}
              data-skeleton="notification"
              className="flex flex-col gap-3 rounded-md bg-muted/40 p-4 ring-1 ring-surface-ring sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-5 w-56 max-w-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="mt-1 h-3 w-48 max-w-full" />
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (variant === "workspace") {
    return (
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-5 w-112 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {range(Math.max(1, workspaceCount)).map((card) => (
            <Card key={card} className="h-full min-w-0">
              <CardHeader className="gap-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardHeader>
              <CardFooter className="mt-auto">
                <Skeleton className="h-9 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (variant === "form") {
    return (
      <div className={sidebar ? "flex flex-col gap-6 md:min-h-96 md:flex-row md:items-start" : "contents"}>
        {sidebar ? (
          <div data-skeleton="form-sections" className="flex w-full shrink-0 flex-col gap-1 md:w-72">
            {range(4).map((section) => (
              <div key={section} className="flex items-center border-l-2 px-3 py-2">
                <Skeleton className="h-5 w-3/4" />
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-7">
          {range(rows).map((row) => (
            <div key={row} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-32" />
                {sidebar ? <Skeleton className="h-5.5 w-20 rounded-full" /> : null}
              </div>
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === "cards") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {range(rows).map((card) => (
          <Card key={card} className="min-w-0">
            <CardHeader className="gap-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {range(rows).map((row) => (
          <div key={row} className="flex flex-col gap-3">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function LoadingSkeleton(props: LoadingSkeletonProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando contenido…</span>
      <div aria-hidden="true" className="contents">
        {props.chip ? <Skeleton data-skeleton="table-chip" className="h-5 w-28 rounded-full" /> : null}
        {props.metrics ? <MetricsLoadingSkeleton /> : null}
        <LoadingBody {...props} />
      </div>
    </div>
  )
}
