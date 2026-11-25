import { MetricsLoadingSkeleton } from "./MetricsLoadingSkeleton"
import { SetupLoadingSkeleton } from "./SetupLoadingSkeleton"

export function DashboardLoadingSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <MetricsLoadingSkeleton />
      <SetupLoadingSkeleton steps={6} />
    </div>
  )
}
