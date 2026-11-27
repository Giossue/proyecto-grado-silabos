import { api } from "@/api/client"

export type TeacherProposalStatus = "pendiente" | "aceptada" | "descartada" | "reemplazada"

export type TeacherProposal = {
  id: string
  status: TeacherProposalStatus
  field_id: string
  field_key: string
  field_label: string
  target: "campo" | "espacio"
  space: number | null
  text: string
  basis: string
}

export type TeacherAssistantMessage = {
  id: string
  role: "usuario" | "asistente"
  status: "pendiente" | "en_ejecucion" | "completado" | "fallido"
  content: string
  error: string | null
  created_at: string
  proposals: TeacherProposal[]
}

export type TeacherAssistantChat =
  | { available: false }
  | { available: true; limit: number; remaining: number; busy: boolean; messages: TeacherAssistantMessage[] }

const base = (syllabusId: string): string => `/teacher/syllabi/${syllabusId}/assistant`

const post = <T>(path: string, body: Record<string, unknown>) => api<T>(path, { method: "POST", body: JSON.stringify(body) })

export const getTeacherAssistant = (syllabusId: string) => api<TeacherAssistantChat>(base(syllabusId))

export const sendTeacherAssistantMessage = (syllabusId: string, message: string, idempotencyKey: string) =>
  post<{ message: string; assistant_message_id: string }>(`${base(syllabusId)}/messages`, { message, idempotency_key: idempotencyKey })
