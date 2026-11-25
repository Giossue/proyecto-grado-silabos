import { StatusBadge, type StatusTone } from "@/components/domain/StatusBadge"
import { syllabusStateLabel } from "@silabos/shared/lib/syllabusStates"

const tones: Record<string, StatusTone> = {
  sin_iniciar: "neutral",
  borrador: "info",
  en_revision: "warning",
  correccion_solicitada: "danger",
  aprobado: "success",
}

export function SyllabusStateBadge({ state }: { state: string }) {
  return <StatusBadge label={syllabusStateLabel(state)} tone={tones[state] ?? "neutral"} />
}
