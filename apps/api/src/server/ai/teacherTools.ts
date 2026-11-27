import { isPhpArray, list, record, type PhpRecord } from "../configuration/phpValues"
import type { AiToolCall, AiToolSpec } from "./gateway"
import { strLimit } from "./php"
import { applyToTarget, proposalText, sendable, type AssistantSnapshot, type AssistantTarget, type ReadableField, type RowAnchor, type TargetKind } from "./teacherContext"
import { toolError, toolFinish, toolOk, ANSWER, type ToolResult } from "./templateTools"

const FIELD_CHARACTERS = 20000
const CUT = "\n[texto recortado]"
const MAX_KEYS = 20
const MAX_PROPOSALS = 6
const MESSAGE_CHARACTERS = 4000
const BASIS_CHARACTERS = 600

export type ProposalTarget = { kind: TargetKind; space: number | null; path: number[]; mold: string; row?: RowAnchor | null; fieldKey: string; fieldLabel: string }
export type OfferedProposal = { fieldId: string; target: ProposalTarget; baseHash: string; text: string; basis: string }

export type TeacherToolSession = { snapshot: AssistantSnapshot; read: Set<string>; delivered: ReadonlySet<string>; proposals: OfferedProposal[] }

export type TeacherTool = { spec: AiToolSpec; run(args: PhpRecord, session: TeacherToolSession): ToolResult }

const object = (properties: PhpRecord) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false })
const items = (value: unknown): unknown[] | null => (isPhpArray(value) && Object.keys(value).every((key, index) => key === String(index)) ? list(value) : null)
const cut = (text: string, limit: number): string => [...text].slice(0, limit).join("")
const tooLong = (readable: ReadableField): boolean => [...readable.text].length > FIELD_CHARACTERS

export function offeredTargets(readable: ReadableField): AssistantTarget[] {
  return tooLong(readable) ? readable.targets.filter((target) => target.kind !== "campo") : readable.targets
}

function fieldView(readable: ReadableField): PhpRecord {
  return {
    clave: readable.field.key,
    seccion: readable.sectionTitle,
    nombre: readable.label,
    contenido: tooLong(readable) ? cut(readable.text, FIELD_CHARACTERS) + CUT : readable.text,
    limite_de_caracteres: readable.limit,
    destinos: offeredTargets(readable).map((target) => ({
      destino: target.name,
      tipo: target.kind === "campo" ? "campo completo" : "espacio",
      ...(target.kind === "campo" ? {} : { texto_actual: cut(target.text, FIELD_CHARACTERS) }),
      maximo_caracteres: target.maxCharacters,
    })),
  }
}

const readFields: TeacherTool = {
  spec: {
    name: "leer_campos",
    description: "Muestra el contenido actual y los destinos de propuesta de uno o varios campos del sílabo.",
    parameters: object({ claves: { type: "array", items: { type: "string" }, description: "Claves tal como aparecen en la lista del pedido." } }),
  },
  run(args, session) {
    const asked = items(args.claves)
    if (asked === null || asked.length === 0 || asked.length > MAX_KEYS) return toolError(`«claves» debe ser una lista de 1 a ${MAX_KEYS} claves.`)
    const wanted = [...new Set(asked)]
    const found = wanted.flatMap((key) => session.snapshot.fields.filter((readable) => readable.field.key === key))
    if (found.length === 0) return toolError("Ninguna de esas claves está disponible. Use las claves de la lista del pedido.")
    for (const readable of found) session.read.add(readable.field.id)
    return toolOk({ campos: found.map(fieldView), ...(wanted.length > found.length ? { claves_no_disponibles: wanted.length - found.length } : {}) })
  },
}

function proposalOf(raw: unknown, position: number, session: TeacherToolSession, taken: OfferedProposal[]): OfferedProposal | string {
  const given = record(raw)
  const refuse = (reason: string) => `Propuesta ${position}: ${reason}`
  const read = session.snapshot.fields.filter((readable) => session.delivered.has(readable.field.id))
  const match = read.flatMap((readable) => offeredTargets(readable).map((target) => ({ readable, target }))).find(({ target }) => target.name === given.destino)
  if (match === undefined) return refuse("ese destino no está disponible. Lea el campo con leer_campos y use uno de sus destinos.")
  const { readable, target } = match
  if (taken.some((other) => other.fieldId === readable.field.id && other.target.space === target.space)) return refuse("ese destino ya tiene otra propuesta.")
  const text = typeof given.texto === "string" ? proposalText(given.texto) : ""
  const basis = typeof given.fundamento === "string" ? proposalText(given.fundamento) : ""
  if (text === "" || basis === "") return refuse("escriba el texto y en qué se basa.")
  const outcome = applyToTarget(session.snapshot, readable, target, text)
  if ("problem" in outcome) return refuse(sendable(outcome.problem, session.snapshot.template.definition))
  return {
    fieldId: readable.field.id,
    target: { kind: target.kind, space: target.space, path: target.path, mold: target.mold, row: target.row, fieldKey: readable.field.key, fieldLabel: readable.label },
    baseHash: target.baseHash,
    text,
    basis: strLimit(basis, BASIS_CHARACTERS),
  }
}

const respond: TeacherTool = {
  spec: {
    name: ANSWER,
    description: "Termina el turno con un mensaje para el docente y, si corresponde, sus propuestas.",
    parameters: object({
      mensaje: { type: "string", description: "Respuesta para el docente: qué revisó y qué recomienda, o su pregunta." },
      propuestas: {
        type: "array",
        description: `De 0 a ${MAX_PROPOSALS} propuestas.`,
        items: object({
          destino: { type: "string", description: "Destino tal como lo devolvió leer_campos." },
          texto: { type: "string", description: "Texto plano propuesto." },
          fundamento: { type: "string", description: "En qué datos y campos se basa." },
        }),
      },
    }),
  },
  run(args, session) {
    const message = typeof args.mensaje === "string" ? proposalText(args.mensaje) : ""
    if (message === "") return toolError("El parámetro «mensaje» no puede quedar vacío.")
    const given = items(args.propuestas)
    if (given === null || given.length > MAX_PROPOSALS) return toolError(`«propuestas» debe ser una lista de hasta ${MAX_PROPOSALS} propuestas.`)
    const accepted: OfferedProposal[] = []
    for (const [index, raw] of given.entries()) {
      const outcome = proposalOf(raw, index + 1, session, accepted)
      if (typeof outcome === "string") return toolError(outcome)
      accepted.push(outcome)
    }
    session.proposals = accepted
    return toolFinish(ANSWER, cut(message, MESSAGE_CHARACTERS))
  },
}

export const TEACHER_TOOLS: readonly TeacherTool[] = [readFields, respond]

export function runTeacherTool(call: AiToolCall, session: TeacherToolSession): ToolResult {
  const tool = TEACHER_TOOLS.find((candidate) => candidate.spec.name === call.name)
  if (tool === undefined) return toolError("Esa función no existe.")
  return call.arguments === null ? toolError("Los argumentos no son un objeto JSON válido.") : tool.run(call.arguments, session)
}
