import type { Query } from "@tanstack/react-query"
import { getTemplateAssistant, type TemplateAssistantChat } from "@/api/templateAssistant"

export const ASSISTANT_POLL_MS = 2500

export const templateAssistantKeys = {
  all: ["template-assistant"] as const,
  chat: (refresh: number) => ["template-assistant", "chat", refresh] as const,
}

export const isAssistantPending = (chat: TemplateAssistantChat | null | undefined): boolean =>
  (chat?.messages ?? []).some((item) => item.status === "pendiente" || item.status === "en_ejecucion")

export const templateAssistantQuery = (refresh: number) => ({
  queryKey: templateAssistantKeys.chat(refresh),
  queryFn: getTemplateAssistant,
  refetchInterval: (query: Query<TemplateAssistantChat>) => (isAssistantPending(query.state.data) ? ASSISTANT_POLL_MS : false),
})
