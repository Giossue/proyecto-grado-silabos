import { Badge } from "@/components/ui/badge"

export type StatusTone = "neutral" | "info" | "warning" | "danger" | "success"

const variants = { neutral: "neutral", info: "secondary", warning: "warning", danger: "danger", success: "success" } as const

export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return <Badge variant={variants[tone]}>{label}</Badge>
}
