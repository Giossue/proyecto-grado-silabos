import type { Query } from "@tanstack/react-query"
import { ApiError } from "@/api/client"
import { getTeacherAssistant, type TeacherAssistantChat } from "@/api/teacherAssistant"

export const TEACHER_ASSISTANT_POLL_MS = 2500

export const teacherAssistantKeys = {
  chat: (syllabusId: string) => ["teacher-assistant", syllabusId] as const,
}

export const PROPOSAL_GONE = "Esa propuesta ya no existe. Pida una nueva"

export const assistantFailure = (reason: unknown, { fallback, missing }: { fallback: string; missing: string }): string => {
  if (!(reason instanceof ApiError)) return fallback
  if (reason.status === 404) return missing
  const detail = Object.values(reason.errors).flat()[0]
  if (detail) return detail

  return reason.status >= 500 && reason.status !== 503 ? fallback : reason.message
}

export const assistantRefused = (error: unknown): boolean => error instanceof ApiError && (error.status === 403 || error.status === 404)

export const teacherAssistantQuery = (syllabusId: string) => ({
  queryKey: teacherAssistantKeys.chat(syllabusId),
  queryFn: () => getTeacherAssistant(syllabusId),
  refetchInterval: (query: Query<TeacherAssistantChat>) =>
    !assistantRefused(query.state.error) && query.state.data?.available && query.state.data.busy ? TEACHER_ASSISTANT_POLL_MS : false,
})
