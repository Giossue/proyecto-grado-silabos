import type { PhpRecord } from "../configuration/phpValues"
import type { AiConfig } from "./config"
import { isPhpFloat, phpJson, phpJsonDecode } from "./php"

export type AiToolSpec = { name: string; description: string; parameters: PhpRecord }

export type AiToolCall = { id: string; name: string; arguments: PhpRecord | null; rawArguments: string }

export type AiMessage = { role: string; content?: string | null; tool_calls?: AiToolCall[]; tool_call_id?: string }

export type AiAgentRequest = { system: string; messages: AiMessage[]; tools: AiToolSpec[]; userTag: string }

export type AiUsage = { prompt: number; completion: number; cached: number }

export type AiAgentStep = { gatewayVersion: string; content: string | null; toolCalls: AiToolCall[]; usage: AiUsage }

export interface AiAgentGateway {
  version(): string
  step(request: AiAgentRequest): Promise<AiAgentStep>
}

export class AiContractException extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiContractException"
  }
}

export class AiGatewayUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiGatewayUnavailable"
  }
}

export const NO_BALANCE = "sin_saldo"
export const INVALID_KEY = "clave_invalida"
export const BUSY = "ocupado"
export const REJECTED = "solicitud_rechazada"
export const UNAVAILABLE = "no_disponible"

export class AiProviderError extends AiGatewayUnavailable {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message)
    this.name = "AiProviderError"
  }
}

export const disabledGateway: AiAgentGateway = {
  version: () => "disabled-v1",
  step: async () => {
    throw new AiProviderError(UNAVAILABLE, "La asistencia de IA está deshabilitada en este entorno.")
  },
}

const BASELINE_ANSWER = "El simulador revisó la plantilla. Configure DeepSeek para recibir propuestas de cambios."

export const baselineGateway: AiAgentGateway = {
  version: () => "agent-simulator-v1",
  step: async (request) => {
    const consulted = request.messages.some((message) => message.role === "tool")
    const call: AiToolCall = consulted
      ? { id: "simulador-2", name: "responder", arguments: { mensaje: BASELINE_ANSWER }, rawArguments: `{"mensaje":"${BASELINE_ANSWER}"}` }
      : { id: "simulador-1", name: "ver_plantilla", arguments: {}, rawArguments: "{}" }
    return { gatewayVersion: "agent-simulator-v1", content: null, toolCalls: [call], usage: { prompt: 0, completion: 0, cached: 0 } }
  },
}

export type HttpDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  sleep: (milliseconds: number) => Promise<void>
}

export const defaultHttpDeps: HttpDeps = {
  fetch: (url, init) => fetch(url, init),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}

const RETRYABLE_STATUSES = [429, 500, 502, 503, 504]

class ConnectionFailure extends Error {}

function strictDriver(config: AiConfig): boolean {
  return config.driver.trim().toLowerCase() === "deepseek"
}

function modelOf(config: AiConfig): string {
  const model = (config.templateModel || config.model).trim()
  if (model === "" || [...model].length > 64 || /[\x00-\x1F\x7F]/.test(model)) {
    throw new AiProviderError(UNAVAILABLE, "Falta configurar un modelo de IA válido.")
  }
  return model
}

function apiKeyOf(config: AiConfig): string {
  const apiKey = config.apiKey.trim()
  if (apiKey === "" || apiKey.includes("\r") || apiKey.includes("\n")) {
    throw new AiProviderError(INVALID_KEY, "Falta configurar la clave del proveedor de IA.")
  }
  return apiKey
}

function phpRtrimSlashes(value: string): string {
  return value.replace(/\/+$/, "")
}

function endpointOf(config: AiConfig, strict: boolean): string {
  const baseUrl = phpRtrimSlashes(config.baseUrl.trim())
  const invalid = () => new AiProviderError(UNAVAILABLE, "La URL del proveedor de IA debe ser una URL HTTPS válida.")
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^#]*)(#.*)?$/.exec(baseUrl)
  if (!match || match[1] !== "https" || match[4] !== undefined) throw invalid()
  const authority = match[2]
  if (authority.includes("@")) throw invalid()
  const hostMatch = /^(\[[^\]]*\]|[^:]*)(?::(\d*))?$/.exec(authority)
  if (!hostMatch || hostMatch[1] === "") throw invalid()
  if (strict) return `https://${hostMatch[1]}${hostMatch[2] !== undefined && hostMatch[2] !== "" ? `:${Number(hostMatch[2])}` : ""}/beta/chat/completions`
  return baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`
}

function toolPayload(tool: AiToolSpec, strict: boolean): PhpRecord {
  return { type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters, ...(strict ? { strict: true } : {}) } }
}

function messagePayload(message: AiMessage): PhpRecord {
  if (message.role === "tool") return { role: "tool", tool_call_id: message.tool_call_id ?? "", content: message.content ?? "" }
  const calls = message.tool_calls ?? []
  if (message.role === "assistant" && calls.length > 0) {
    return {
      role: "assistant",
      content: message.content ?? "",
      tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.rawArguments } })),
    }
  }
  return { role: message.role, content: message.content ?? "" }
}

export function hostedPayload(config: AiConfig, request: AiAgentRequest, strict: boolean): PhpRecord {
  return {
    model: modelOf(config),
    messages: [{ role: "system", content: request.system }, ...request.messages.map(messagePayload)],
    tools: request.tools.map((tool) => toolPayload(tool, strict)),
    tool_choice: "required",
    thinking: { type: "disabled" },
    ...(config.temperature === null ? {} : { temperature: config.temperature }),
    max_tokens: config.maxOutputTokens,
    user_id: request.userTag,
  }
}

function jsonOrNull(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

function at(value: unknown, path: string[]): unknown {
  let current = value
  for (const segment of path) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)]
    else if (typeof current === "object" && current !== null && !Array.isArray(current)) current = (current as PhpRecord)[segment]
    else return undefined
  }
  return current
}

function phpInt(value: unknown): number {
  if (value === undefined || value === null) return 0
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "string") {
    const match = /^[ \t\n\r\v\f]*([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?)/.exec(value)
    return match ? Math.trunc(Number(match[1])) : 0
  }
  if (Array.isArray(value)) return value.length > 0 ? 1 : 0
  if (typeof value === "object") return Object.keys(value as object).length > 0 ? 1 : 0
  return 0
}

function phpStringOf(value: unknown): string {
  if (value === null || value === undefined || value === false) return ""
  if (value === true) return "1"
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  return "Array"
}

function isAssoc(value: unknown): value is PhpRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === 0 || !keys.every((key, index) => key === String(index))
}

function nesting(value: unknown): number {
  if (typeof value !== "object" || value === null || isPhpFloat(value)) return 0
  const children = Array.isArray(value) ? value : Object.values(value)
  return 1 + children.reduce<number>((deepest, child) => Math.max(deepest, nesting(child)), 0)
}

function decodedArguments(raw: string): PhpRecord | null {
  if (raw.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "") === "") return {}
  let decoded: unknown
  try {
    decoded = phpJsonDecode(raw)
  } catch {
    return null
  }
  if (nesting(decoded) > 32 || isPhpFloat(decoded)) return null
  if (Array.isArray(decoded)) return decoded.length === 0 ? {} : null
  return isAssoc(decoded) ? decoded : null
}

function phpTrim(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
}

function failure(status: number, body: string): AiProviderError {
  const decoded = jsonOrNull(body)
  const message = at(decoded ?? [], ["error", "message"])
  const detail = typeof message === "string" && phpTrim(message) !== "" ? `: ${[...phpTrim(message)].slice(0, 300).join("")}` : ""
  if (status === 402) return new AiProviderError(NO_BALANCE, "La cuenta del proveedor de IA no tiene saldo.")
  if (status === 401 || status === 403) return new AiProviderError(INVALID_KEY, "El proveedor de IA rechazó la clave.")
  if (status === 429) return new AiProviderError(BUSY, "El proveedor de IA recibe demasiadas solicitudes.")
  if (status >= 500) return new AiProviderError(UNAVAILABLE, "El proveedor de IA no está disponible.")
  return new AiProviderError(REJECTED, `El proveedor de IA rechazó la solicitud (${status})${detail}.`)
}

function parseStep(version: string, envelope: PhpRecord): AiAgentStep {
  const finish = at(envelope, ["choices", "0", "finish_reason"])
  if (finish === "insufficient_system_resource") throw new AiProviderError(BUSY, "El proveedor de IA no tiene capacidad en este momento.")
  if (finish === "length") throw new AiContractException("La respuesta del proveedor quedó cortada.")
  if (finish === "content_filter") throw new AiContractException("El proveedor filtró la respuesta.")
  const message = at(envelope, ["choices", "0", "message"])
  if (typeof message !== "object" || message === null) throw new AiContractException("El proveedor no devolvió un mensaje.")
  const rawCalls = (message as PhpRecord).tool_calls
  const calls: AiToolCall[] = []
  const callList = Array.isArray(rawCalls) ? rawCalls : typeof rawCalls === "object" && rawCalls !== null ? Object.values(rawCalls) : []
  for (const call of callList) {
    const name = at(call, ["function", "name"])
    const raw = at(call, ["function", "arguments"])
    if (typeof name !== "string" || name === "") throw new AiContractException("El proveedor pidió una función sin nombre.")
    const rawArguments = typeof raw === "string" ? raw : ""
    const id = at(call, ["id"])
    calls.push({ id: phpStringOf(id === undefined ? "" : id), name, arguments: decodedArguments(rawArguments), rawArguments })
  }
  const text = (message as PhpRecord).content
  const content = typeof text === "string" && phpTrim(text) !== "" ? phpTrim(text) : null
  if (calls.length === 0 && content === null) throw new AiContractException("El proveedor devolvió una respuesta en blanco.")
  return {
    gatewayVersion: version,
    content,
    toolCalls: calls,
    usage: {
      prompt: phpInt(at(envelope, ["usage", "prompt_tokens"])),
      completion: phpInt(at(envelope, ["usage", "completion_tokens"])),
      cached: phpInt(at(envelope, ["usage", "prompt_cache_hit_tokens"])),
    },
  }
}

export function hostedGateway(config: AiConfig, deps: HttpDeps = defaultHttpDeps): AiAgentGateway {
  const version = () => `deepseek:${modelOf(config)}`
  async function attempt(endpoint: string, body: string, apiKey: string): Promise<{ status: number; body: string }> {
    let response: Response
    try {
      response = await deps.fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(config.timeoutSeconds * 1000),
      })
    } catch (error) {
      throw new ConnectionFailure(error instanceof Error ? error.message : String(error))
    }
    let text: string
    try {
      text = await response.text()
    } catch (error) {
      throw new ConnectionFailure(error instanceof Error ? error.message : String(error))
    }
    return { status: response.status, body: text }
  }
  async function send(endpoint: string, body: string, apiKey: string): Promise<{ status: number; body: string }> {
    const delays = config.retryDelaysMs.length > 0 ? config.retryDelaysMs : [0]
    const tries = delays.length + 1
    for (let index = 1; ; index++) {
      try {
        const response = await attempt(endpoint, body, apiKey)
        const successful = response.status >= 200 && response.status < 300
        if (successful || !RETRYABLE_STATUSES.includes(response.status) || index >= tries) return response
      } catch (error) {
        if (!(error instanceof ConnectionFailure) || index >= tries) throw error
      }
      const delay = delays[index - 1] ?? 0
      if (delay) await deps.sleep(delay)
    }
  }
  return {
    version,
    async step(request) {
      if (!strictDriver(config)) throw new AiProviderError(UNAVAILABLE, "El asistente de la plantilla solo funciona con DeepSeek.")
      const strict = config.strictTools
      const payload = hostedPayload(config, request, strict)
      const endpoint = endpointOf(config, strict)
      const apiKey = apiKeyOf(config)
      let response: { status: number; body: string }
      try {
        response = await send(endpoint, phpJson(payload), apiKey)
      } catch (error) {
        if (error instanceof ConnectionFailure) throw new AiProviderError(UNAVAILABLE, "El proveedor de IA no respondió.")
        if (error instanceof AiProviderError) throw error
        throw new AiProviderError(UNAVAILABLE, "No fue posible contactar el proveedor de IA.")
      }
      if (response.status < 200 || response.status >= 300) throw failure(response.status, response.body)
      if (Buffer.byteLength(response.body) > config.responseBytes) throw new AiContractException("La respuesta excede el tamaño permitido.")
      const envelope = jsonOrNull(response.body)
      if (!isAssoc(envelope) || Object.keys(envelope).length === 0) throw new AiContractException("El proveedor no devolvió un objeto JSON válido.")
      return parseStep(version(), envelope)
    },
  }
}

export function gatewayFor(config: AiConfig, deps: HttpDeps = defaultHttpDeps): AiAgentGateway {
  if (config.driver === "baseline") return baselineGateway
  if (config.driver === "deepseek") return hostedGateway(config, deps)
  return disabledGateway
}
