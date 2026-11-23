import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { range } from "./range"

export function SetupLoadingSkeleton({ steps }: { steps: number }) {
  return (
    <Card data-skeleton="setup">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex items-center gap-3 pt-1">
          <Skeleton className="h-2 min-w-0 flex-1 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {range(steps).map((step) => (
          <div key={step} className={cn("flex items-start gap-3 rounded-md p-2", step === 1 && "bg-muted/60 ring-1 ring-surface-ring")}>
            <Skeleton className="mt-0.5 size-7 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
            {step === 1 ? <Skeleton className="h-8 w-12 shrink-0 sm:w-16" /> : <Skeleton className="mt-1 size-3 shrink-0 rounded-full" />}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
