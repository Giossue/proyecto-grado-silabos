import type { AiConfig } from "./config"
import {
  AiContractException,
  AiGatewayUnavailable,
  AiProviderError,
  BUSY,
  INVALID_KEY,
  NO_BALANCE,
  REJECTED,
  UNAVAILABLE,
  type AiAgentGateway,
  type AiAgentStep,
  type AiMessage,
  type AiToolCall,
  type AiUsage,
} from "./gateway"
import { phpJson, strLimit, strRandom } from "./php"
import { sendable, type AssistantSnapshot } from "./teacherContext"
import { teacherSystemPrompt } from "./teacherPrompt"
import { offeredTargets, runTeacherTool, TEACHER_TOOLS, type OfferedProposal, type TeacherToolSession } from "./teacherTools"
import { STEP_LIMIT, TIME_LIMIT, TOO_MANY_ERRORS } from "./templateAssistant"
import { ANSWER } from "./templateTools"

export type { OfferedProposal, ProposalTarget } from "./teacherTools"

export const NOT_ALLOWED = "no_permitido"
export const TEACHER_UNAVAILABLE = "El asistente no está disponible por ahora. Puede seguir editando su sílabo."
export const TEACHER_NOT_ALLOWED = "El pedido no se atendió: el asistente se desactivó o el sílabo ya no se puede editar."

const RETRY = "No pude completar el pedido. Intente explicarlo de otra forma."
const HISTORY_TEXT = 4000
const HISTORY_PROPOSAL = 1500

const MESSAGES: Record<string, string> = {
  [NO_BALANCE]: TEACHER_UNAVAILABLE,
  [INVALID_KEY]: TEACHER_UNAVAILABLE,
  [UNAVAILABLE]: TEACHER_UNAVAILABLE,
  [BUSY]: "El asistente está ocupado. Inténtelo en unos minutos.",
  [REJECTED]: "El asistente no pudo procesar el pedido. Inténtelo de nuevo.",
  [STEP_LIMIT]: RETRY,
  [TIME_LIMIT]: RETRY,
  [TOO_MANY_ERRORS]: RETRY,
  [NOT_ALLOWED]: TEACHER_NOT_ALLOWED,
}

export type HistoryTurn = { question: string; answer: string; proposals: { label: string; state: string; text: string }[]; sentFields: string[] }

export type TeacherOutcome = {
  status: "completado" | "fallido"
  message: string
  proposals: OfferedProposal[]
  errorCode: string | null
  sentFields: string[]
  trace: { paso: number; funcion: string; resultado: string }[]
  usage: AiUsage
  steps: number
  gatewayVersion: string
}

export type TeacherAssistantDeps = { gateway: AiAgentGateway; config: AiConfig; permitted?: () => Promise<boolean>; now?: () => number; randomId?: () => string }

export function teacherHistory(turns: HistoryTurn[], snapshot: AssistantSnapshot): HistoryTurn[] {
  const readable = new Set(snapshot.fields.map((item) => item.field.id))
  return turns.filter((turn) => turn.sentFields.every((id) => readable.has(id)))
}

function historyMessages(turns: HistoryTurn[], snapshot: AssistantSnapshot): AiMessage[] {
  const safe = (text: string, limit: number) => sendable(strLimit(text, limit), snapshot.template.definition)
  return turns.flatMap((turn) => {
    const offered = turn.proposals.map((item) => `- ${safe(item.label, 200)} (${item.state}): ${safe(item.text, HISTORY_PROPOSAL)}`)
    return [
      { role: "user", content: safe(turn.question, HISTORY_TEXT) },
      { role: "assistant", content: [safe(turn.answer, HISTORY_TEXT), ...(offered.length === 0 ? [] : [`Propuestas de esa respuesta:\n${offered.join("\n")}`])].join("\n\n") },
    ]
  })
}

const inline = (text: string) => text.replace(/\s+/gu, " ").trim()

function opening(snapshot: AssistantSnapshot, request: string): string {
  const fields = snapshot.fields.map(
    (item) => `- ${item.field.key} | ${inline(item.sectionTitle)} | ${inline(item.label)} | propuestas: ${offeredTargets(item).length > 0 ? "sí" : "no"}`,
  )
  const catalog =
    fields.length === 0
      ? "No hay campos del sílabo que pueda leer."
      : `Campos del sílabo que puede leer con leer_campos (clave | sección | nombre | si admite propuestas):\n${fields.join("\n")}`
  return `Datos de la asignatura:\n${JSON.stringify(snapshot.subject)}\n\n${catalog}\n\nPedido del docente:\n${sendable(request.trim(), snapshot.template.definition)}`
}

export async function runTeacherAssistant(
  deps: TeacherAssistantDeps,
  snapshot: AssistantSnapshot,
  request: string,
  history: HistoryTurn[],
  tag: string,
): Promise<TeacherOutcome> {
  const now = () => (deps.now ?? Date.now)()
  const turns = teacherHistory(history, snapshot)
  const session: TeacherToolSession = { snapshot, read: new Set(), delivered: new Set(), proposals: [] }
  const messages: AiMessage[] = [...historyMessages(turns, snapshot), { role: "user", content: opening(snapshot, request) }]
  const tools = TEACHER_TOOLS.map((tool) => tool.spec)
  const trace: TeacherOutcome["trace"] = []
  let usage: AiUsage = { prompt: 0, completion: 0, cached: 0 }
  let gatewayVersion = ""
  let errors = 0

  const outcome = (status: TeacherOutcome["status"], message: string, errorCode: string | null, steps: number): TeacherOutcome => ({
    status,
    message,
    proposals: status === "completado" ? session.proposals : [],
    errorCode,
    sentFields: [...new Set([...turns.flatMap((turn) => turn.sentFields), ...session.read])],
    trace,
    usage,
    steps,
    gatewayVersion,
  })
  const failed = (code: string, steps: number) => outcome("fallido", MESSAGES[code] ?? TEACHER_UNAVAILABLE, code, steps)
  const record = (paso: number, funcion: string, ok: boolean) => trace.push({ paso, funcion: strLimit(funcion, 60), resultado: ok ? "ok" : "error" })

  const deadline = now() + deps.config.maxSeconds * 1000
  const implicit = (answer: AiAgentStep): AiToolCall => {
    const args = { mensaje: answer.content ?? "", propuestas: [] }
    return { id: `implicita-${(deps.randomId ?? (() => strRandom(8)))()}`, name: ANSWER, arguments: args, rawArguments: phpJson(args, { unicode: true }) }
  }

  for (let step = 1; step <= deps.config.maxSteps; step++) {
    if (now() > deadline) return failed(TIME_LIMIT, step - 1)
    if (deps.permitted !== undefined && !(await deps.permitted())) return failed(NOT_ALLOWED, step - 1)
    let answer: AiAgentStep
    try {
      answer = await deps.gateway.step({ system: teacherSystemPrompt(), messages: [...messages], tools, userTag: tag })
    } catch (error) {
      if (error instanceof AiContractException) {
        record(step, "(respuesta inválida)", false)
        if (++errors > deps.config.maxConsecutiveErrors) return failed(TOO_MANY_ERRORS, step)
        continue
      }
      if (error instanceof AiProviderError) return failed(error.reason, step)
      if (error instanceof AiGatewayUnavailable) return failed(UNAVAILABLE, step)
      throw error
    }
    gatewayVersion = answer.gatewayVersion
    usage = { prompt: usage.prompt + answer.usage.prompt, completion: usage.completion + answer.usage.completion, cached: usage.cached + answer.usage.cached }
    const calls = answer.toolCalls.length > 0 ? answer.toolCalls : [implicit(answer)]
    session.delivered = new Set(session.read)
    messages.push({ role: "assistant", content: answer.content, tool_calls: calls })
    let reply: string | null = null
    let wrong = false
    for (const call of calls) {
      const result = runTeacherTool(call, session)
      record(step, call.name, !result.failed)
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content })
      wrong = wrong || result.failed
      reply ??= result.terminal === null ? null : result.message
    }
    if (reply !== null) return outcome("completado", reply, null, step)
    errors = wrong ? errors + 1 : 0
    if (errors > deps.config.maxConsecutiveErrors) return failed(TOO_MANY_ERRORS, step)
  }
  return failed(STEP_LIMIT, deps.config.maxSteps)
}
