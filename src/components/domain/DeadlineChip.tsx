"use client"

import { CalendarClock } from "lucide-react"
import type { DashboardDeadline } from "@/api/dashboard"
import { noticeFor, type Audience } from "@/components/domain/DeadlineBanner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Tone = "notice" | "urgent" | "muted"

const URGENT_DAYS = 3

const chipFor = (deadline: DashboardDeadline, audience: Audience): { label: string; tone: Tone } => {
  const { state, days_until_start: toStart, days_until_due: toDue } = deadline
  if (state === "paused") return { label: "En pausa", tone: "muted" }
  if (state === "closed") return { label: "Finalizada", tone: "muted" }
  if (audience === "coordinador" && deadline.career_pending) return { label: "Sin abrir", tone: "notice" }
  if (state === "overdue") return { label: "Plazo vencido", tone: "urgent" }
  if (state === "upcoming") return { label: toStart === 0 ? "Inicia hoy" : toStart === 1 ? "Inicia mañana" : `Inicia en ${toStart} días`, tone: "notice" }
  const label = toDue === 0 ? "Último día" : toDue === 1 ? "1 día" : `${toDue} días`

  return { label, tone: toDue <= URGENT_DAYS ? "urgent" : "notice" }
}

const toneClass: Record<Tone, string> = {
  notice: "border-notice-border bg-notice text-notice-foreground hover:bg-notice/80",
  urgent: "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
  muted: "border-border bg-muted text-muted-foreground hover:bg-muted/80",
}

export function DeadlineChip({ deadline, audience, className }: { deadline: DashboardDeadline; audience: Audience; className?: string }) {
  const { label, tone } = chipFor(deadline, audience)
  const notice = noticeFor(deadline, audience)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tour="deadline"
          data-tone={tone}
          aria-label={`Plazo: ${label}`}
          className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap outline-hidden transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", toneClass[tone], className)}
        >
          <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <p className="font-medium">{notice.headline}</p>
        {notice.detail ? <p className="mt-1 text-muted-foreground">{notice.detail}</p> : null}
      </PopoverContent>
    </Popover>
  )
}
