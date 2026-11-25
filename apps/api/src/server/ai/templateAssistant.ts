import { createHmac, randomUUID } from "node:crypto"
import { draftProblems } from "../configuration/templateDraft"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { AssistantDraft, type AssistantPayload, type AssistantSection } from "./assistantDraft"
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
import { canonical, phpJson, strLimit, strRandom } from "./php"
import { ANSWER, QUESTION, TemplateTools, toolError, type DraftValidator, type ProcessNotice, type ToolResult } from "./templateTools"

export const STEP_LIMIT = "limite_pasos"
export const TIME_LIMIT = "limite_tiempo"
export const TOO_MANY_ERRORS = "demasiados_errores"
export const PROCESS_STATES = ["abierta", "pausada", "ninguna"]
export const SAME_AS_PENDING = "Esa propuesta ya está lista en el mensaje anterior: pulse «Aplicar» en ella para pasar los cambios al editor."

export const OUTCOME_PROPOSAL = "propuesta"
export const OUTCOME_ANSWER = "respuesta"
export const OUTCOME_QUESTION = "pregunta"
export const OUTCOME_FAILED = "fallido"

const UNAVAILABLE_MESSAGE = "El asistente no está disponible por ahora. Puede seguir editando la plantilla."
const RETRY = "No pude completar el pedido. Intente explicarlo de otra forma."

const MESSAGES: Record<string, string> = {
  [NO_BALANCE]: UNAVAILABLE_MESSAGE,
  [INVALID_KEY]: UNAVAILABLE_MESSAGE,
  [UNAVAILABLE]: UNAVAILABLE_MESSAGE,
  [BUSY]: "El asistente está ocupado. Inténtelo en unos minutos.",
  [REJECTED]: "El asistente no pudo procesar el pedido. Inténtelo de nuevo.",
  [STEP_LIMIT]: RETRY,
  [TIME_LIMIT]: RETRY,
  [TOO_MANY_ERRORS]: RETRY,
}

export type TraceEntry = { paso: number; funcion: string; argumentos: string; resultado: string }

export type AssistantProposal = {
  payload: AssistantPayload
  changes: string[]
  changed: { secciones: string[]; campos: string[] }
  fingerprint: string
}

export type AssistantOutcome = {
  status: string
  message: string
  proposal: AssistantProposal | null
  errorCode: string | null
  trace: TraceEntry[]
  usage: AiUsage
  steps: number
  gatewayVersion: string
}

export type LastProposal = { estado: string; cambios: string[]; secciones?: unknown; bloques?: unknown }

export type HistoryMessage = { role: "user" | "assistant"; content: string }

export function userTag(userId: string, appKey: string): string {
  return `adm-${createHmac("sha256", appKey).update(userId).digest("hex").slice(0, 32)}`
}

export const draftValidator: DraftValidator = {
  async errors(draft) {
    const errors: string[] = []
    for (const problem of await draftProblems(draft.payload() as unknown as Record<string, unknown>, draft.baseDefinition())) {
      errors.push(problem.blocking ? `${describe(problem.path, draft)}: ${problem.message}` : problem.message)
    }
    return [...new Set(errors)]
  },
}

function describe(path: string, draft: AssistantDraft): string {
  const match = /^sections\.(\d+)(?:\.fields\.(\d+))?/.exec(path)
  if (match === null) return path
  const section = draft.payload().sections[Number(match[1])]
  if (section === undefined) return path
  if (match[2] === undefined) return `Sección «${section.key}»`
  const field = section.fields[Number(match[2])]
  return field === undefined ? `Sección «${section.key}»` : `Campo «${field.key}»`
}

export type AssistantDeps = {
  gateway: AiAgentGateway
  config: AiConfig
  system: () => string
  processState: () => Promise<string>
  validator?: DraftValidator
  now?: () => number
  randomId?: () => string
}

export function processNotice(state: string): ProcessNotice {
  if (state === "abierta") return { estado: "abierta", aviso: "Hay una convocatoria abierta: la plantilla no se puede cambiar hasta pausarla." }
  if (state === "pausada") {
    return {
      estado: "pausada",
      aviso:
        "La convocatoria está en pausa: si se aplican cambios, al reanudarla los sílabos en curso vuelven a borrador y conservan lo escrito en los campos que siguen encajando; los campos que cambien su estructura quedan vacíos.",
    }
  }
  return { estado: "ninguna", aviso: "No hay convocatoria abierta ni en pausa: los cambios se aplican a los próximos sílabos." }
}

export class TemplateAssistant {
  private trace: TraceEntry[] = []
  private usage: AiUsage = { prompt: 0, completion: 0, cached: 0 }
  private gatewayVersion = ""
  private preexisting: string[] = []
  private assumedProcess: string | null = null

  constructor(private readonly deps: AssistantDeps) {}

  assumingProcess(state: string): TemplateAssistant {
    if (!PROCESS_STATES.includes(state)) throw new Error(`Estado de convocatoria desconocido: ${state}.`)
    const assistant = new TemplateAssistant(this.deps)
    assistant.assumedProcess = state
    return assistant
  }

  private validator(): DraftValidator {
    return this.deps.validator ?? draftValidator
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  async run(
    template: SyllabusTemplate,
    request: string,
    history: HistoryMessage[] = [],
    tag = "consola",
    editorDraft: AssistantSection[] | null = null,
    lastProposal: LastProposal | null = null,
  ): Promise<AssistantOutcome> {
    this.trace = []
    this.usage = { prompt: 0, completion: 0, cached: 0 }
    this.gatewayVersion = ""
    const draft = editorDraft === null ? AssistantDraft.fromTemplate(template) : AssistantDraft.fromDraft(template, editorDraft)
    this.preexisting = await this.validator().errors(draft)
    const tools = new TemplateTools(draft, this.validator(), processNotice(this.assumedProcess ?? (await this.deps.processState())), this.preexisting)
    const system = this.deps.system()
    const messages: AiMessage[] = [...history, { role: "user", content: this.opening(tools, request, editorDraft !== null, history.length > 0, lastProposal) }]
    const deadline = this.now() + this.deps.config.maxSeconds * 1000
    const maxSteps = this.deps.config.maxSteps
    const maxErrors = this.deps.config.maxConsecutiveErrors
    let errors = 0

    for (let step = 1; step <= maxSteps; step++) {
      if (this.now() > deadline) return this.failed(TIME_LIMIT, step - 1)
      let answer: AiAgentStep
      try {
        answer = await this.deps.gateway.step({ system, messages: [...messages], tools: tools.specs(), userTag: tag })
      } catch (error) {
        if (error instanceof AiContractException) {
          this.record(step, "(respuesta inválida)", "", `error: ${error.message}`)
          if (++errors > maxErrors) return this.failed(TOO_MANY_ERRORS, step)
          continue
        }
        if (error instanceof AiProviderError) return this.failed(error.reason, step)
        if (error instanceof AiGatewayUnavailable) return this.failed(UNAVAILABLE, step)
        throw error
      }
      this.account(answer)
      const calls = answer.toolCalls.length > 0 ? answer.toolCalls : [this.implicitAnswer(answer)]
      messages.push({ role: "assistant", content: answer.content, tool_calls: calls })
      let finish: ToolResult | null = null
      let failed = false
      for (const call of calls) {
        const result = await this.execute(tools, draft, call)
        this.record(step, call.name, call.rawArguments, result.failed ? `error: ${errorOf(result)}` : "ok")
        messages.push({ role: "tool", tool_call_id: call.id, content: result.content })
        failed = failed || result.failed
        finish ??= result.terminal !== null ? result : null
      }
      if (finish !== null && finish.message !== null) return this.finished(finish, draft, step, lastProposal)
      errors = failed ? errors + 1 : 0
      if (errors > maxErrors) return this.failed(TOO_MANY_ERRORS, step)
    }
    return this.failed(STEP_LIMIT, maxSteps)
  }

  private async execute(tools: TemplateTools, draft: AssistantDraft, call: AiToolCall): Promise<ToolResult> {
    const result = await tools.execute(call)
    if (result.terminal !== ANSWER || !draft.changed()) return result
    const errors = (await this.validator().errors(draft)).filter((error) => !this.preexisting.includes(error))
    return errors.length === 0 ? result : toolError(`El borrador tiene errores; corríjalos antes de responder: ${errors.join(" | ")}`)
  }

  private finished(finish: ToolResult, draft: AssistantDraft, steps: number, lastProposal: LastProposal | null): AssistantOutcome {
    const message = finish.message ?? ""
    if (finish.terminal === QUESTION) return this.outcome(OUTCOME_QUESTION, message, null, null, steps)
    if (!draft.changed()) return this.outcome(OUTCOME_ANSWER, message, null, null, steps)
    const payload = draft.payload()
    if (
      lastProposal?.estado === "pendiente" &&
      phpJson(canonical(lastProposal.secciones ?? null)) === phpJson(canonical(payload.sections)) &&
      phpJson(canonical(lastProposal.bloques ?? [])) === phpJson(canonical(payload.block_changes ?? []))
    ) {
      return this.outcome(OUTCOME_ANSWER, SAME_AS_PENDING, null, null, steps)
    }
    return this.outcome(
      OUTCOME_PROPOSAL,
      message,
      { payload: draft.payload(), changes: draft.changes(), changed: draft.changedKeys(), fingerprint: draft.baseFingerprint() },
      null,
      steps,
    )
  }

  private failed(code: string, steps: number): AssistantOutcome {
    return this.outcome(OUTCOME_FAILED, MESSAGES[code] ?? UNAVAILABLE_MESSAGE, null, code, steps)
  }

  private outcome(status: string, message: string, proposal: AssistantProposal | null, code: string | null, steps: number): AssistantOutcome {
    return { status, message, proposal, errorCode: code, trace: this.trace, usage: this.usage, steps, gatewayVersion: this.gatewayVersion }
  }

  private implicitAnswer(answer: AiAgentStep): AiToolCall {
    const args = { mensaje: answer.content ?? "" }
    return { id: `implicita-${(this.deps.randomId ?? (() => strRandom(8)))()}`, name: "responder", arguments: args, rawArguments: phpJson(args, { unicode: true }) }
  }

  private account(answer: AiAgentStep): void {
    this.gatewayVersion = answer.gatewayVersion
    this.usage = {
      prompt: this.usage.prompt + answer.usage.prompt,
      completion: this.usage.completion + answer.usage.completion,
      cached: this.usage.cached + answer.usage.cached,
    }
  }

  private record(step: number, tool: string, args: string, result: string): void {
    this.trace.push({ paso: step, funcion: tool, argumentos: strLimit(args, 300), resultado: strLimit(result, 300) })
  }

  private opening(tools: TemplateTools, request: string, fromEditor: boolean, continues: boolean, lastProposal: LastProposal | null): string {
    let state = tools.locked()
      ? "La convocatoria está abierta: solo puede consultar y explicar; no proponga cambios."
      : "Puede proponer cambios en el borrador. Nada se guarda hasta que el administrador los aplique."
    if (fromEditor) {
      state +=
        " El borrador es lo que el administrador tiene ahora en el editor, con sus cambios sin guardar. Las propuestas anteriores que no aplicó no están en el borrador."
    }
    if (lastProposal !== null) state += `\n\n${lastProposalNote(lastProposal)}`
    if (this.preexisting.length > 0) state += `\n\nEl borrador ya tenía estos problemas; no los corrija salvo que se lo pidan:\n- ${this.preexisting.join("\n- ")}`
    const label = continues
      ? "Nuevo mensaje del administrador (puede ser la respuesta a su última pregunta; léalo con la conversación anterior)"
      : "Pedido del administrador"
    return `${state}\n\n${label}:\n${request.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")}`
  }
}

function lastProposalNote(proposal: LastProposal): string {
  const changes = proposal.cambios.length === 0 ? "" : `\n- ${proposal.cambios.join("\n- ")}`
  if (proposal.estado === "aplicada") return "Su última propuesta ya está aplicada: sus cambios están en el borrador."
  if (proposal.estado === "pendiente") {
    return (
      "Su última propuesta sigue pendiente: el administrador aún no la aplica y sus cambios NO están en el borrador. Si ahora solo la aprueba («dale», «sí», «perfecto»), pídale que pulse «Aplicar» en esa propuesta y no cambie nada. Si pide algo más, vuelva a incluir esos cambios en la nueva propuesta, porque la nueva reemplaza a la anterior. Cambios de esa propuesta:" +
      changes
    )
  }
  if (proposal.estado === "descartada") return "Su última propuesta fue descartada: el administrador no la quiso. No la repita salvo que se la pida."
  return "Su última propuesta ya no coincide con el borrador, porque el administrador siguió editando. Sus cambios no están en el borrador."
}

function errorOf(result: ToolResult): string {
  try {
    const decoded = JSON.parse(result.content) as unknown
    if (typeof decoded === "object" && decoded !== null && !Array.isArray(decoded) && typeof (decoded as Record<string, unknown>).error === "string") {
      return (decoded as Record<string, string>).error
    }
  } catch {
    return "error"
  }
  return "error"
}

export function newAnswerId(): string {
  return randomUUID()
}
