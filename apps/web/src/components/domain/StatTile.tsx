import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { DISPLAY_LOCALE } from "@/lib/dateDisplay"
import { withoutEndPeriod } from "@/lib/text"

type StatTileProps = {
  label: string
  value: number
  suffix?: string
  hint?: string
  icon?: LucideIcon
}

export function StatTile({ label, value, suffix, hint, icon: Icon }: StatTileProps) {
  const formatted = new Intl.NumberFormat(DISPLAY_LOCALE, {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
          <span className="text-sm">{label}</span>
        </div>
        <span className="text-2xl leading-none font-semibold text-foreground">
          {formatted}
          {suffix ? <span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span> : null}
        </span>
        {hint ? <span className="text-xs text-muted-foreground">{withoutEndPeriod(hint)}</span> : null}
      </CardContent>
    </Card>
  )
}
