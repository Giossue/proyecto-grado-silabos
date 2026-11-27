import { isRecord, list, record, type PhpRecord } from "../configuration/phpValues"
import type { AiConfig } from "./config"
import { gatewayFor, type AiAgentGateway, type AiAgentStep, type HttpDeps, type AiMessage } from "./gateway"

const VERSION = "teacher-simulator-v1"
const WITH_PROPOSALS = /^- (\S+) \| .* \| propuestas: sí$/mu

export const SIMULATED_ANSWER = "Respuesta simulada: revisé los datos de la asignatura. Configure DeepSeek para recibir recomendaciones reales."
export const SIMULATED_TEXT = "Texto de ejemplo del simulador para revisar la propuesta."
export const SIMULATED_BASIS = "Datos de la asignatura y el contenido actual del campo (respuesta simulada)."

function simulated(index: number, name: string, args: PhpRecord): AiAgentStep {
  return {
    gatewayVersion: VERSION,
    content: null,
    toolCalls: [{ id: `simulador-${index}`, name, arguments: args, rawArguments: JSON.stringify(args) }],
    usage: { prompt: 0, completion: 0, cached: 0 },
  }
}

function firstTarget(result: AiMessage): PhpRecord | null {
  const first = (found: unknown) => (typeof found === "object" && found !== null ? list(found)[0] : undefined)
  const target = first(record(first(record(JSON.parse(result.content ?? "{}")).campos)).destinos)
  return isRecord(target) ? target : null
}

export const teacherBaselineGateway: AiAgentGateway = {
  version: () => VERSION,
  step: async (request) => {
    const results = request.messages.filter((message) => message.role === "tool")
    const opening = request.messages.filter((message) => message.role === "user").at(-1)?.content ?? ""
    const key = WITH_PROPOSALS.exec(opening)?.[1]
    if (results.length === 0 && key !== undefined) return simulated(1, "leer_campos", { claves: [key] })
    const target = results.length === 1 ? firstTarget(results[0]) : null
    const propuestas =
      target === null
        ? []
        : [{ destino: target.destino, texto: SIMULATED_TEXT.slice(0, Number(target.maximo_caracteres ?? SIMULATED_TEXT.length)).trimEnd(), fundamento: SIMULATED_BASIS }]
    return simulated(results.length + 1, "responder", { mensaje: SIMULATED_ANSWER, propuestas })
  },
}

export function teacherGatewayFor(config: AiConfig, deps?: HttpDeps): AiAgentGateway {
  return config.driver === "baseline" ? teacherBaselineGateway : gatewayFor(config, deps)
}
