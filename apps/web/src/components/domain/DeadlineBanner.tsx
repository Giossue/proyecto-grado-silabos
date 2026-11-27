import { CalendarClock } from "lucide-react"
import type { DashboardDeadline } from "@/api/dashboard"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { cn } from "@/lib/utils"

export type Audience = "docente" | "coordinador" | "bibliotecario" | "administrador"

type Notice = { headline: string; detail: string | null }

const tasks: Record<Audience, { task: string; upcoming: string; until: (due: string) => string }> = {
  docente: { task: "enviar sus sílabos a revisión", upcoming: "La elaboración de sus sílabos inicia", until: (due) => `Podrá enviarlos a revisión hasta el ${due}` },
  coordinador: { task: "recibir y revisar los sílabos de su carrera", upcoming: "La elaboración de los sílabos inicia", until: (due) => `Los docentes podrán enviarlos hasta el ${due}` },
  bibliotecario: { task: "revisar y firmar los sílabos", upcoming: "La elaboración de los sílabos inicia", until: (due) => `Deben quedar revisados y firmados hasta el ${due}` },
  administrador: { task: "que los docentes envíen sus sílabos", upcoming: "La elaboración de los sílabos inicia", until: (due) => `Los docentes podrán enviarlos hasta el ${due}` },
}

const formatDate = (value: string): string => formatDateDisplay(value, { dateStyle: "long", timeZone: "UTC" })

const overdueNotice: Record<Audience, (due: string) => { headline: string; detail: string }> = {
  docente: (due) => ({ headline: "Venció el plazo para enviar sus sílabos a revisión", detail: `Era hasta el ${due}. Pida una prórroga a Administración` }),
  coordinador: (due) => ({ headline: "Venció el plazo de entrega de los sílabos", detail: `Era hasta el ${due}. Solo puede revisar lo ya enviado` }),
  bibliotecario: (due) => ({ headline: "Venció el plazo de entrega de los sílabos", detail: `Era hasta el ${due}. Solo puede revisar lo ya enviado` }),
  administrador: (due) => ({ headline: "Venció el plazo de entrega de los sílabos", detail: `Era hasta el ${due}` }),
}

const pausedNotice = (audience: Audience, pausedBy: DashboardDeadline["paused_by"]): Notice => {
  if (audience === "docente") return { headline: "El proceso de sílabos está en pausa", detail: "Le avisaremos cuando se reanude para que siga con sus sílabos" }
  if (audience === "administrador") return { headline: "El proceso de sílabos está en pausa", detail: "Puede reanudarlo desde Periodos académicos" }
  if (audience === "coordinador" && pausedBy === "coordinacion") return { headline: "El proceso de sílabos de su carrera está en pausa", detail: "Los docentes no editan y no se revisa. Puede cambiar la malla y el proyecto de carrera, y luego reanudarlo desde Revisión" }

  return { headline: "El proceso de sílabos está en pausa", detail: "Administración pausó el proceso de sílabos. Las revisiones se retoman cuando lo reanude; le avisaremos" }
}

const closedNotice: Record<Audience, string> = {
  docente: "Sus sílabos quedan solo para consulta",
  coordinador: "Los sílabos de la carrera quedan solo para consulta",
  bibliotecario: "Los sílabos quedan solo para consulta",
  administrador: "Puede reabrirlo con una prórroga o abrir uno nuevo",
}

export const noticeFor = (deadline: DashboardDeadline, audience: Audience): Notice => {
  const { state, days_until_start: toStart, days_until_due: toDue } = deadline
  const { task, upcoming, until } = tasks[audience]
  const due = formatDate(deadline.due_at)
  if (state === "paused") return pausedNotice(audience, deadline.paused_by)
  if (state === "closed") return { headline: "El proceso de sílabos finalizó", detail: audience === "administrador" && deadline.classes_ended ? "Puede abrir uno nuevo" : closedNotice[audience] }
  if (audience === "coordinador" && deadline.career_pending) return { headline: "Aún no abre el proceso de sílabos de su carrera", detail: until(due) }
  if (state === "overdue") return overdueNotice[audience](due)
  if (state === "upcoming") {
    const when = toStart === 0 ? "hoy" : toStart === 1 ? "mañana" : `en ${toStart} días`
    return { headline: `${upcoming} ${when}`, detail: until(due) }
  }
  if (toDue === 0) return { headline: `Hoy es el último día para ${task}`, detail: null }
  return { headline: `${toDue === 1 ? "Queda 1 día" : `Quedan ${toDue} días`} para ${task}`, detail: `Hasta el ${due}` }
}

export function DeadlineBanner({ deadline, audience, ...props }: { deadline: DashboardDeadline; audience: Audience; "data-tour"?: string }) {
  const overdue = deadline.state === "overdue"
  const notice = noticeFor(deadline, audience)

  return (
    <div {...props} role="status" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-y px-4 py-2.5 text-sm sm:px-6", overdue ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-notice-border bg-notice text-notice-foreground")}>
      <CalendarClock className={cn("size-4 shrink-0", overdue ? "text-destructive" : "text-warning")} aria-hidden="true" />
      <span className="font-medium">{notice.headline}</span>
      {notice.detail ? <span className={overdue ? "" : "text-notice-foreground/80"}>{notice.detail}</span> : null}
    </div>
  )
}
