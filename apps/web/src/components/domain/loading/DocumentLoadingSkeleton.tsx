import { WorkspaceLayout } from "@/components/domain/WorkspaceLayout"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { range } from "./range"

export type DocumentLoadingVariant = "syllabus" | "review" | "preview" | "template" | "comparison" | "documents"

type DocumentLoadingSkeletonProps = {
  variant: DocumentLoadingVariant
  rows?: number
  reviewStage?: "coordination" | "library"
}

const SYLLABUS_TABS = ["w-40", "w-32", "w-36", "w-28", "w-32"]

export function DocumentLoadingSkeleton({ variant, rows = 3, reviewStage = "coordination" }: DocumentLoadingSkeletonProps) {
  const sectionCount = Math.max(1, Math.min(rows, 3))
  const reviewSections = reviewStage === "library" ? 1 : sectionCount
  const reviewPanels = reviewStage === "library" ? ["approval", "correction", "history"] : ["correction", "approval", "history"]

  if (variant === "syllabus") {
    return (
      <div className="mx-auto flex w-full max-w-screen-2xl min-w-0 flex-col gap-8 pb-16">
        <div data-skeleton="syllabus-tabs" className="flex flex-wrap gap-2">
          {SYLLABUS_TABS.map((width, tab) => (
            <Skeleton key={tab} className={cn("h-10 max-w-full", width)} />
          ))}
        </div>

        <section data-skeleton="syllabus-section" className="flex min-w-0 flex-col gap-6 rounded-md bg-card px-6 py-6 text-card-foreground shadow-surface ring-1 ring-surface-ring">
          <header className="flex min-w-0 flex-col gap-1">
            <Skeleton className="h-7 w-56 max-w-full" />
            <Skeleton className="h-5 w-80 max-w-full" />
          </header>
          <div className="-mx-1 flex min-w-0 flex-col">
            {range(2).map((field) => (
              <div key={field} data-skeleton="syllabus-field" className="flex min-w-0 flex-col border-b last:border-b-0">
                <div className="flex items-center justify-between gap-4 px-1 py-4">
                  <div className="flex h-6 items-center">
                    <Skeleton className="h-5 w-56 max-w-full" />
                  </div>
                  <Skeleton className="size-4 shrink-0" />
                </div>
                <div className="mx-1 mt-1 mb-4 flex min-w-0 flex-col rounded-md ring-1 ring-surface-ring">
                  <div className="flex items-center gap-1 border-b p-1.5">
                    {range(5).map((tool) => (
                      <Skeleton key={tool} className="size-8" />
                    ))}
                  </div>
                  <div className="flex min-h-32 flex-col gap-2 px-3 py-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div data-skeleton="syllabus-nav" className="-mt-4 flex items-center justify-end">
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    )
  }

  if (variant === "preview") {
    return (
      <div data-skeleton="preview-sheet" className="min-w-0 overflow-x-auto">
        <div className="template-sheet relative">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-12 w-56 max-w-full" />
              <Skeleton className="h-12 w-16" />
            </div>
            <Skeleton className="mx-auto h-6 w-80 max-w-full" />
            <Skeleton className="h-5 w-56 max-w-full" />
            <div className="grid grid-cols-4 gap-1">
              {range(16).map((cell) => (
                <Skeleton key={cell} className="h-8" />
              ))}
            </div>
            <Skeleton className="h-5 w-48 max-w-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (variant === "review" && reviewStage === "library") {
    return (
      <article data-skeleton="library-bibliography" className="flex min-w-0 flex-col gap-6 rounded-md bg-card px-6 py-6 shadow-surface ring-1 ring-surface-ring">
        {range(2).map((section) => (
          <section key={section} data-skeleton="review-section" className="flex min-w-0 flex-col gap-2">
            <div className="flex h-6 items-center">
              <Skeleton className="h-4 w-40 max-w-full" />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton className="h-4 w-2/3" />
            </div>
          </section>
        ))}
      </article>
    )
  }

  if (variant === "review") {
    return (
      <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-6">
        <header className="flex min-w-0 flex-col gap-2" data-skeleton="review-heading">
          <Skeleton className="-mt-1 h-5 w-36 max-w-full" />
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Skeleton className="h-8 w-72 max-w-full" />
              <Skeleton className="h-6 w-112 max-w-full" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-5 w-64 max-w-full" />
          </div>
        </header>

        <WorkspaceLayout variant="review">
          <div className="flex min-w-0 flex-col gap-6">
            {range(reviewSections).map((section) => (
              <Card key={section} data-skeleton="review-section">
                <CardHeader className="min-w-0 grid-cols-1">
                  <Skeleton className="h-5 w-52 max-w-full" />
                  <Skeleton className="h-4 w-80 max-w-full" />
                </CardHeader>
                <CardContent className="flex min-w-0 flex-col gap-6">
                  {range(2).map((field) => (
                    <div key={field} className="flex min-w-0 flex-col gap-2 rounded-md bg-muted/30 p-4 ring-1 ring-surface-ring">
                      <div className="flex flex-wrap items-center gap-2">
                        <Skeleton className="h-5 w-44 max-w-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <aside className="flex min-w-0 flex-col gap-6" data-review-stage={reviewStage}>
            {reviewPanels.map((panel) => (
              <Card key={panel} data-skeleton={`review-${panel}`}>
                <CardHeader className="min-w-0 grid-cols-1">
                  <Skeleton className="h-5 w-48 max-w-full" />
                  <Skeleton className="h-4 w-full" />
                  {panel !== "history" ? <Skeleton className="h-4 w-3/4" /> : null}
                  {panel === "approval" ? <Skeleton className="h-4 w-1/2" /> : null}
                </CardHeader>
                <CardContent className="flex min-w-0 flex-col gap-4">
                  {panel === "correction" ? (
                    <>
                      <Skeleton className="h-4 w-40 max-w-full" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </>
                  ) : panel === "approval" ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    range(2).map((item) => (
                      <div key={item} className="flex min-w-0 flex-col gap-2 rounded-md p-3 ring-1 ring-surface-ring">
                        <div className="flex items-center justify-between gap-3">
                          <Skeleton className="h-5 w-28" />
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="mt-1 h-8 w-40 max-w-full" />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </aside>
        </WorkspaceLayout>
      </div>
    )
  }

  if (variant === "template") {
    return (
      <div className="mx-auto flex w-full min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-4" data-skeleton="template-pages">
          <div className="min-w-0 overflow-x-auto">
            <article className="template-sheet shadow-none" data-skeleton="template-page" data-orientation="portrait">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-12 w-32 max-w-2/5" />
                <Skeleton className="h-12 w-32 max-w-2/5" />
              </div>
              <Skeleton className="mx-auto h-7 w-3/4" />
              {range(3).map((section) => (
                <div key={section} className="flex min-w-0 flex-col gap-3">
                  <Skeleton className="h-5 w-1/2 max-w-full" />
                  {section === 1 ? (
                    <div className="overflow-hidden rounded-sm ring-1 ring-surface-ring">
                      {range(4).map((row) => (
                        <div key={row} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 border-b p-2 last:border-b-0">
                          <Skeleton className="h-3.5 w-3/4" />
                          <Skeleton className="h-3.5 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    range(2).map((field) => (
                      <div key={field} className="flex min-w-0 flex-col gap-1 px-2 py-1">
                        <Skeleton className="h-4 w-40 max-w-full" />
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-5/6" />
                      </div>
                    ))
                  )}
                </div>
              ))}
            </article>
          </div>

          <div className="min-w-0 overflow-x-auto">
            <article className="template-sheet template-sheet--landscape shadow-none" data-skeleton="template-page" data-orientation="landscape">
              <Skeleton className="h-5 w-1/2 max-w-full" />
              <div className="overflow-hidden rounded-sm ring-1 ring-surface-ring">
                <div className="grid grid-cols-9 gap-2 border-b bg-muted/40 p-2">
                  {range(9).map((column) => (
                    <Skeleton key={column} className="h-3.5 w-3/4" />
                  ))}
                </div>
                {range(16).map((row) => (
                  <div key={row} className="grid grid-cols-9 gap-2 border-b p-2 last:border-b-0">
                    {range(9).map((column) => (
                      <Skeleton key={column} className="h-3.5 w-full" />
                    ))}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </div>
    )
  }

  if (variant === "comparison") {
    return (
      <>
        <Card data-skeleton="comparison-summary">
          <CardHeader className="min-w-0 grid-cols-1">
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="h-4 w-112 max-w-full" />
          </CardHeader>
        </Card>
        {range(sectionCount).map((change) => (
          <Card key={change} data-skeleton="comparison-change">
            <CardHeader className="min-w-0 grid-cols-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-5 w-56 max-w-full" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-4 lg:grid-cols-2">
              {range(2).map((side) => (
                <div key={side} className={cn("min-w-0 rounded-md border p-4", side === 1 ? "border-destructive/30" : "border-success/40")}>
                  <Skeleton className="h-5 w-28 max-w-full" />
                  <div className="mt-3 flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </>
    )
  }

  return (
    <div data-skeleton="document-status" className="flex h-5 items-center">
      <Skeleton className="h-4 w-44 max-w-full" />
    </div>
  )
}
