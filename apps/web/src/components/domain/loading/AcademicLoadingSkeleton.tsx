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

  // Same shape as the canvas: sizes follow curriculumCanvasLayout (not imported, so this does not load the canvas library).
  return (
    <div data-skeleton="curriculum-canvas" className="curriculum-canvas relative h-(--curriculum-canvas-height) min-h-136 overflow-hidden bg-background">
      <div className="absolute inset-y-0 right-0 left-14 overflow-hidden">
        <div data-skeleton="curriculum-board" className="mx-auto w-full max-w-304 px-12 pt-3">
          <Skeleton data-skeleton="curriculum-selector" className="h-9 w-full max-w-72" />
          <div className="flex flex-col gap-4 pt-12">
            {range(3).map((level) => (
              <div key={level} data-skeleton="curriculum-level" className="flex h-55.5 shrink-0 overflow-hidden rounded-md bg-(--curriculum-lane) ring-1 ring-surface-ring">
                <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-r bg-(--curriculum-cycle-chrome) p-3">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-5 w-6" />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-8.5 overflow-hidden pl-7.25">
                  {range(2).map((subject) => (
                    <Skeleton key={subject} data-skeleton="curriculum-subject" className="h-39.5 w-68.5 min-w-0" />
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
        </div>
      </div>
      <div data-skeleton="curriculum-controls" className="absolute bottom-1 left-3 flex flex-col gap-1">
        {range(5).map((control) => (
          <Skeleton key={control} className="size-8" />
        ))}
      </div>
    </div>
  )
}
