import { Badge } from "@/components/ui/badge"

import type { StatusTone } from "@silabos/shared/lib/statusTone"

export type { StatusTone }

const variants = { neutral: "neutral", info: "secondary", warning: "warning", danger: "danger", success: "success" } as const

export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return <Badge variant={variants[tone]}>{label}</Badge>
}
