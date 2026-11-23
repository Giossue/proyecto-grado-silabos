import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { range } from "./range"

export function MetricsLoadingSkeleton() {
  return (
    <div data-skeleton="metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
      {range(3).map((metric) => (
        <Card key={metric} className="min-w-0 py-4">
          <CardContent className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="h-4 w-28 max-w-full" />
            </div>
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
