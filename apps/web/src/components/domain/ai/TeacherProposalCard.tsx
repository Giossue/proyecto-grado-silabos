"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { TeacherProposal } from "@/api/teacherAssistant"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

const COPIED_MS = 2000
const COPY_FAILED = "No se pudo copiar. Seleccione el texto y cópielo a mano"

const captionOf = (proposal: TeacherProposal): string =>
  proposal.target === "campo" ? "Propuesta para el campo" : `Propuesta para el espacio ${proposal.space} del campo`

export function TeacherProposalCard({ proposal }: { proposal: TeacherProposal }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  if (proposal.status === "reemplazada") {
    return (
      <p data-proposal={proposal.id} className="text-sm text-muted-foreground">
        La propuesta para «{proposal.field_label}» se reemplazó por una más nueva
      </p>
    )
  }

  const copy = async (): Promise<void> => {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(proposal.text)
    } catch {
      setResult("failed")
      return
    }
    setResult("copied")
    timer.current = setTimeout(() => setResult(null), COPIED_MS)
  }
  const copied = result === "copied"

  return (
    <article data-proposal={proposal.id} aria-label={`Propuesta para ${proposal.field_label}`} className="flex min-w-0 flex-col gap-3 rounded-md bg-muted/50 p-3 ring-1 ring-surface-ring">
      <div className="flex min-w-0 flex-col">
        <p className="text-xs text-muted-foreground">{captionOf(proposal)}</p>
        <h3 className="text-sm font-semibold break-words">{proposal.field_label}</h3>
      </div>
      <p className="rounded-md bg-card p-3 text-sm break-words whitespace-pre-wrap ring-1 ring-surface-ring">{proposal.text}</p>
      {result === "failed" ? (
        <Alert variant="destructive">
          <AlertDescription>{COPY_FAILED}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => void copy()}>
        {copied ? <Check data-icon="inline-start" aria-hidden="true" /> : <Copy data-icon="inline-start" aria-hidden="true" />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
      <span role="status" className="sr-only">{copied ? "Texto copiado" : ""}</span>
    </article>
  )
}
