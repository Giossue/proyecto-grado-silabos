import { Skeleton } from "@/components/ui/skeleton"
import { range } from "./range"
import { TableLoadingSkeleton } from "./TableLoadingSkeleton"

type AcademicLoadingSkeletonProps = {
  mode?: "curriculum" | "schedule" | "teachers"
  rows?: number
}

export function AcademicLoadingSkeleton({ mode = "schedule", rows = 5 }: AcademicLoadingSkeletonProps) {
  if (mode !== "curriculum") {
    return (
      <TableLoadingSkeleton
        data-skeleton={mode === "schedule" ? "scheduled-subjects" : "teachers"}
        rows={rows}
        columns={mode === "schedule" ? 5 : 3}
        filters={mode === "schedule" ? 3 : 1}
        actions={false}
        selectable={mode === "schedule"}
        badges={mode === "teachers" ? [3] : []}
        filterWidth="lg:w-44"
        search
      />
    )
  }

  return (
    <div
      data-skeleton="curriculum-canvas"
      className="curriculum-canvas relative h-(--curriculum-canvas-height) min-h-136 overflow-hidden bg-(--curriculum-canvas-background)"
    >
      <div className="absolute inset-0 flex flex-col gap-4 overflow-hidden p-4">
        {range(4).map((level) => (
          <div key={level} data-skeleton="curriculum-level" className="flex h-40 shrink-0 overflow-hidden rounded-md bg-(--curriculum-lane) ring-1 ring-surface-ring">
            <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-r bg-(--curriculum-cycle-chrome) p-3">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-5 w-6" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-8 overflow-hidden p-4">
              {range(4).map((subject) => (
                <Skeleton key={subject} data-skeleton="curriculum-subject" className="h-full w-68 shrink-0" />
              ))}
            </div>
            {range(2).map((total) => (
              <div key={total} className="hidden w-20 shrink-0 flex-col items-center justify-center gap-1 border-l bg-(--curriculum-cycle-chrome) p-3 sm:flex">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-6" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="absolute top-3 right-3 hidden w-64 flex-col gap-3 rounded-md bg-card/90 p-3 shadow-surface ring-1 ring-surface-ring sm:flex">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="size-5" />
        </div>
        <div className="flex flex-col gap-2">
          {range(2).map((relation) => (
            <div key={relation} className="flex items-center gap-2">
              <Skeleton className="h-0.5 w-5" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t pt-3">
          {range(3).map((unit) => (
            <div key={unit} className="flex items-center gap-2">
              <Skeleton className="size-3" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t pt-3">
          {range(3).map((total) => (
            <div key={total} className="flex items-center justify-between gap-3">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2.5 w-6" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="absolute top-3 right-3 size-9 sm:hidden" />
      <div className="absolute bottom-3 left-3 flex flex-col gap-1">
        {range(2).map((control) => (
          <Skeleton key={control} className="size-8" />
        ))}
      </div>
    </div>
  )
}
