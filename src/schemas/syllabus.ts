import { z } from "zod"
import { field, is, nullableField, prohibitedField, requiredField, sometimesField } from "./fields"

type Exists = (value: unknown) => Promise<boolean>

export const SEARCH_MAX = 120

export function listingFiltersSchema(states: readonly string[]) {
  return z.object({
    q: nullableField("búsqueda", [is.string(), is.max(SEARCH_MAX)]),
    state: nullableField("estado", [is.oneOf(["all", ...states])]),
    page: nullableField("página", [is.integer(), is.min(1)]),
  })
}

export const reviewSearchSchema = z.object({ search: nullableField("búsqueda", [is.string(), is.max(SEARCH_MAX)]) })

export function reviewHistorySchema(periodExists?: Exists) {
  return z.object({
    q: nullableField("búsqueda", [is.string(), is.max(SEARCH_MAX)]),
    period: nullableField("período", [is.uuid(), ...(periodExists ? [is.existing(periodExists)] : [])]),
  })
}

export const JUSTIFICATION_MIN = 10
export const JUSTIFICATION_MAX = 10000
export const REASON_MIN = 5
export const REASON_MAX = 500

export const changeRequestSchema = z.object({ justification: requiredField("justificación", [is.string(), is.min(JUSTIFICATION_MIN), is.max(JUSTIFICATION_MAX)]) })

export const restartSchema = z.object({ reason: requiredField("motivo", [is.string(), is.min(REASON_MIN), is.max(REASON_MAX)]) })

export function convocationSchema(openProcessExists?: Exists) {
  return z.object({ process_id: requiredField("proceso", [is.uuid(), ...(openProcessExists ? [is.existing(openProcessExists)] : [])]) })
}

const lockVersion = () => requiredField("versión de edición", [is.integer(), is.min(0)])

export const lockVersionSchema = z.object({ version_bloqueo: lockVersion() })

export const draftFieldSchema = z.object({
  version_bloqueo: lockVersion(),
  value: field("valor", [is.array()], { present: true, nullable: true }),
})

export const submissionSchema = z.object({
  version_bloqueo: lockVersion(),
  idempotency_key: requiredField("identificador de la solicitud", [is.uuid()]),
  signature: nullableField("firma electrónica", [is.array()]),
})

export const idempotencySchema = z.object({ idempotency_key: requiredField("identificador de la solicitud", [is.uuid()]) })

export const redoConfirmationSchema = z.object({ confirmar_rehacer: sometimesField("confirmación para rehacer los sílabos", [is.boolean()]) })

export const PROCESS_NOTICE_MAX = 1000
export const ASK_PROCESS_NOTICE = "Escriba el mensaje para docentes, coordinación y biblioteca."

export const processDeletionSchema = z.object({
  mensaje: requiredField("mensaje para docentes, coordinación y biblioteca", [is.string(ASK_PROCESS_NOTICE), is.max(PROCESS_NOTICE_MAX, "El mensaje no puede pasar de 1000 caracteres.")], {
    requiredMessage: ASK_PROCESS_NOTICE,
  }),
})

export const deadlineExtensionSchema = z.object({
  stage: prohibitedField("etapa", "La prórroga solo modifica la fecha límite de entrega."),
  due_at: requiredField("fecha límite", [is.date()]),
  confirmar_rehacer: sometimesField("confirmación para rehacer los sílabos", [is.boolean()]),
  confirmar_cambios: sometimesField("confirmación para aplicar los cambios pendientes", [is.boolean()]),
})

export function processCreationSchema(periodExists?: Exists) {
  return z.object({
    period_id: requiredField("periodo académico", [is.uuid(), ...(periodExists ? [is.existing(periodExists)] : [])]),
    starts_at: requiredField("fecha de inicio", [is.date()]),
    due_at: requiredField("fecha límite", [is.date()]),
  })
}

export const CONVOCATION_TRANSITIONS = ["pausar", "reanudar"] as const

export const convocationTransitionSchema = z.object({ transition: requiredField<string>("acción", [is.oneOf([...CONVOCATION_TRANSITIONS])]) })
