import {
  BookOpenCheck,
  Building2,
  CalendarRange,
  CircleAlert,
  ClipboardCheck,
  FileSignature,
  FileStack,
  Library,
  MessageSquareText,
  PencilLine,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import type { DashboardMetric } from "@/api/dashboard"
import { StatTile } from "@/components/domain/StatTile"

const icons: Record<string, LucideIcon> = {
  progress: BookOpenCheck,
  days_left: CalendarRange,
  careers_without_convocation: Building2,
  not_started: PencilLine,
  in_review: ClipboardCheck,
  pending: FileStack,
  correction_requested: CircleAlert,
  teachers_pending: UsersRound,
  library_pending: Library,
  library_signed: FileSignature,
  library_commented: MessageSquareText,
}

export function MetricTiles({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <div data-tour="metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
      {metrics.slice(0, 3).map((metric) => (
        <StatTile key={metric.key} label={metric.label} value={metric.value} suffix={metric.suffix ?? undefined} hint={metric.hint} icon={icons[metric.key]} />
      ))}
    </div>
  )
}
