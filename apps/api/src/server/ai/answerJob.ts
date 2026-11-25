import { list, phpString, record, type PhpRecord } from "../configuration/phpValues"
import { responsibleOf } from "../configuration/templateDraft"
import type { AssistantField, AssistantSection } from "./assistantDraft"
import { isOpen, messageRole, messageText, APPLIED, DISCARDED, PENDING } from "./assistantRoutes"
import type { AssistantStore, StoredMessage } from "./assistantStore"
import { OUTCOME_FAILED, userTag, type HistoryMessage, type LastProposal, type TemplateAssistant } from "./templateAssistant"

export const HISTORY = 12
export const ASSISTANT_FAILED = "El asistente no está disponible por ahora. Puede seguir editando la plantilla."

export type AnswerDeps = {
  store: AssistantStore
  assistant: () => TemplateAssistant
  appKey: () => string
  now: () => number
  newProposalId: () => string
}

export function iso8601(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}+00:00`
}

function isPhpInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
}

export function messageDraft(message: StoredMessage): AssistantSection[] | null {
  const raw = record(message.content.entrada).borrador
  if (!Array.isArray(raw) && (typeof raw !== "object" || raw === null)) return null
  const sections: AssistantSection[] = []
  for (const item of list(raw)) {
    if (typeof item !== "object" || item === null) continue
    const section = record(item)
    const fields: AssistantField[] = []
    const rawFields = section.fields
    for (const entry of typeof rawFields === "object" && rawFields !== null ? list(rawFields) : []) {
      if (typeof entry !== "object" || entry === null) continue
      const field = record(entry)
      const content = field.content
      if (typeof content !== "object" || content === null) continue
      const keyed = Array.isArray(content) ? {} : Object.fromEntries(Object.entries(content).filter(([name]) => !/^(0|-?[1-9]\d*)$/.test(name)))
      const showIf = field.show_if
      fields.push({
        key: phpString(field.key ?? ""),
        label: phpString(field.label ?? ""),
        quien_llena: phpString(responsibleOf(field.quien_llena ?? "")),
        content: keyed,
        ...(typeof showIf === "object" && showIf !== null ? { show_if: showIf as PhpRecord } : {}),
        ...(isPhpInt(field.max_length) ? { max_length: field.max_length } : {}),
      })
    }
    sections.push({ key: phpString(section.key ?? ""), title: phpString(section.title ?? ""), orientation: phpString(section.orientation ?? "portrait"), fields })
  }
  return sections
}

async function history(store: AssistantStore, message: StoredMessage, questionId: string): Promise<HistoryMessage[]> {
  const previous = (await store.history(message, questionId, HISTORY)).reverse()
  const found: HistoryMessage[] = []
  for (const item of previous) {
    const text = messageText(item).replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
    if (text !== "") found.push({ role: messageRole(item) === "usuario" ? "user" : "assistant", content: text })
  }
  return found
}

async function lastProposal(store: AssistantStore, message: StoredMessage): Promise<LastProposal | null> {
  const proposal = await store.lastProposal(message.templateId, message.userId)
  if (proposal === null) return null
  const version = phpString(record(message.content.entrada).version_borrador ?? "")
  const state =
    proposal.state === APPLIED
      ? "aplicada"
      : proposal.state === DISCARDED
        ? "descartada"
        : proposal.state === PENDING && proposal.draftVersion === version
          ? "pendiente"
          : "cambiada"
  return {
    estado: state,
    cambios: list(proposal.changes.lista).map(phpString),
    secciones: proposal.structure.sections ?? null,
    bloques: proposal.structure.block_changes ?? [],
  }
}

class MissingModel extends Error {}

export async function answerTemplateAssistant(messageId: string, deps: AnswerDeps): Promise<void> {
  const message = await deps.store.transaction(async (tx) => {
    const locked = await tx.lockMessage(messageId)
    if (locked === null || !isOpen(locked)) return null
    const content: PhpRecord = { ...locked.content, estado: "en_ejecucion" }
    await tx.updateMessage(locked.id, content)
    return { ...locked, content }
  })
  if (message === null) return
  const template = await deps.store.template()
  if (template === null || template.id !== message.templateId) throw new MissingModel(`No query results for model [SyllabusTemplate] ${message.templateId}`)
  const questionId = phpString(record(message.content.entrada).respuesta_a_id ?? "")
  const question = await deps.store.message(questionId)
  if (question === null) throw new MissingModel(`No query results for model [TemplateAssistantMessage] ${questionId}`)
  const outcome = await deps
    .assistant()
    .run(template, messageText(question), await history(deps.store, message, questionId), userTag(message.userId, deps.appKey()), messageDraft(message), await lastProposal(deps.store, message))

  await deps.store.transaction(async (tx) => {
    const locked = await tx.lockMessage(message.id)
    if (locked === null) throw new MissingModel(`No query results for model [TemplateAssistantMessage] ${message.id}`)
    if (!isOpen(locked)) return
    const failed = outcome.status === OUTCOME_FAILED
    await tx.updateMessage(locked.id, {
      ...locked.content,
      estado: failed ? "fallido" : "completado",
      resultado: outcome.status,
      contenido: failed ? "" : outcome.message,
      mensaje_error: failed ? outcome.message : null,
      codigo_error: outcome.errorCode,
      traza: outcome.trace,
      uso: outcome.usage,
      pasos: outcome.steps,
      version_pasarela_ejecutada: outcome.gatewayVersion,
      completado_en: iso8601(deps.now()),
    })
    if (outcome.proposal === null) return
    await tx.replacePendingProposals(template.id, locked.userId)
    await tx.insertProposal({
      id: deps.newProposalId(),
      templateId: template.id,
      messageId: locked.id,
      requestedBy: locked.userId,
      structure: outcome.proposal.payload as unknown as PhpRecord,
      changes: { lista: outcome.proposal.changes, secciones: outcome.proposal.changed.secciones, campos: outcome.proposal.changed.campos },
      fingerprint: outcome.proposal.fingerprint,
      draftVersion: phpString(record(locked.content.entrada).version_borrador ?? ""),
    })
  })
}

export async function failTemplateAssistant(messageId: string, deps: Pick<AnswerDeps, "store" | "now">): Promise<void> {
  await deps.store.transaction(async (tx) => {
    const message = await tx.lockMessage(messageId)
    if (message === null || !isOpen(message)) return
    await tx.updateMessage(message.id, {
      ...message.content,
      estado: "fallido",
      resultado: OUTCOME_FAILED,
      codigo_error: "asistente_fallido",
      mensaje_error: ASSISTANT_FAILED,
      completado_en: iso8601(deps.now()),
    })
  })
}
