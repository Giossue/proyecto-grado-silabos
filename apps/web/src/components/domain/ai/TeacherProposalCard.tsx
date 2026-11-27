"use client"

import { Check, CornerDownLeft, LocateFixed, Trash2 } from "lucide-react"
import type { TeacherProposal } from "@/api/teacherAssistant"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { withoutFinalPeriod } from "@/lib/utils"

export type ProposalOutcome = { applied: true; saveProblem: string | null } | { applied: false; reason: string }

export type ProposalAction = "usar" | "descartar"

const NOT_USABLE = "Esta propuesta ya no se puede usar"

const effectOf = (proposal: TeacherProposal): string =>
  proposal.target === "campo" ? "Reemplaza todo el texto del campo" : `Llena el espacio ${proposal.space} del campo; el resto queda igual`

type TeacherProposalCardProps = {
  proposal: TeacherProposal
  outcome: ProposalOutcome | null
  working: ProposalAction | null
  waiting: boolean
  fieldOnScreen: boolean
  onUse: () => void
  onDiscard: () => void
  onShowField: () => void
}

export function TeacherProposalCard({ proposal, outcome, working, waiting, fieldOnScreen, onUse, onDiscard, onShowField }: TeacherProposalCardProps) {
  if (proposal.status === "descartada") return null
  if (proposal.status === "reemplazada") {
    return (
      <p data-proposal={proposal.id} className="text-sm text-muted-foreground">
        La propuesta para «{proposal.field_label}» se reemplazó por una más nueva
      </p>
    )
  }
  const placed = outcome?.applied === true
  const used = placed || proposal.status === "aceptada"
  const pending = !placed && proposal.status === "pendiente"
  const usable = !placed && proposal.usable
  const blocked = pending && !proposal.usable ? withoutFinalPeriod(proposal.blocked_reason ?? NOT_USABLE) : null
  const refusal = outcome?.applied === false && outcome.reason !== blocked ? outcome.reason : null
  const unsaved = outcome?.applied === true ? outcome.saveProblem : null
  const canShow = used && fieldOnScreen

  return (
    <article data-proposal={proposal.id} aria-label={`Propuesta para ${proposal.field_label}`} className="flex min-w-0 flex-col gap-3 rounded-md bg-muted/50 p-3 ring-1 ring-surface-ring">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <p className="text-xs text-muted-foreground">Propuesta para el campo</p>
          <h3 className="text-sm font-semibold break-words">{proposal.field_label}</h3>
        </div>
        {used ? (
          <Badge variant="success">
            <Check aria-hidden="true" />
            Usada
          </Badge>
        ) : null}
      </div>
      <p className="rounded-md bg-card p-3 text-sm break-words whitespace-pre-wrap ring-1 ring-surface-ring">{proposal.text}</p>
      <p className="text-sm break-words text-muted-foreground">
        <span className="font-medium text-foreground">En qué se basa: </span>
        {proposal.basis}
      </p>
      {usable ? <p className="text-xs text-muted-foreground">{effectOf(proposal)}</p> : null}
      {blocked ? <p className="text-sm font-medium text-warning">{blocked}</p> : null}
      {placed && unsaved === null ? (
        <p role="status" className="text-sm font-medium">
          Colocada en el campo. Revísela y ajústela allí
        </p>
      ) : null}
      {unsaved !== null ? (
        <Alert variant="destructive">
          <AlertDescription>Se colocó en el campo, pero no se pudo guardar: {unsaved}. Cierre el asistente y pulse «Reintentar»</AlertDescription>
        </Alert>
      ) : null}
      {refusal ? (
        <Alert variant="destructive">
          <AlertDescription>{refusal}</AlertDescription>
        </Alert>
      ) : null}
      {usable || pending || canShow ? (
        <div className="flex flex-wrap gap-2">
          {usable ? (
            <Button type="button" size="sm" disabled={waiting} onClick={onUse}>
              {working === "usar" ? <Spinner data-icon="inline-start" /> : <CornerDownLeft data-icon="inline-start" aria-hidden="true" />}
              Usar
            </Button>
          ) : null}
          {pending ? (
            <Button type="button" size="sm" variant="outline" disabled={waiting} onClick={onDiscard}>
              {working === "descartar" ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Descartar
            </Button>
          ) : null}
          {canShow ? (
            <Button type="button" size="sm" variant="outline" onClick={onShowField}>
              <LocateFixed data-icon="inline-start" aria-hidden="true" />
              Ver en el campo
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
