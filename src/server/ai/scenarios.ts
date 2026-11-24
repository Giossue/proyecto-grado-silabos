import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { AssistantDraft, type AssistantSection } from "./assistantDraft"
import type { AssistantOutcome, HistoryMessage, LastProposal, TemplateAssistant } from "./templateAssistant"

export const SCENARIOS_FILE = "src/server/ai/resources/escenarios.json"

export type ScenarioCall = { funcion: string; argumentos?: Record<string, unknown> }

export type ScenarioTurn = {
  mensaje: string
  aplicar?: boolean
  espera?: { resultado?: string; funciones?: string[]; cambios?: string[]; mensaje?: string[] }
  guion?: { pasos: ScenarioCall[][]; errores?: string[] }
}

export type Scenario = { nombre: string; convocatoria?: string; turnos: ScenarioTurn[] }

export type TurnResult = { turno: number; mensaje: string; outcome: AssistantOutcome; evaluado: boolean; aplicada: boolean; fallas: string[] }

export function resourcePath(file: string): string {
  return isAbsolute(file) ? file : join(process.cwd(), file)
}

export function loadScenarios(file: string = SCENARIOS_FILE): Scenario[] {
  const path = resourcePath(file)
  let scenarios: unknown = null
  if (existsSync(path)) {
    try {
      scenarios = JSON.parse(readFileSync(path, "utf8"))
    } catch {
      scenarios = null
    }
  }
  if (!Array.isArray(scenarios)) throw new Error(`No se pudo leer ${path}.`)
  scenarios.forEach((scenario, index) => {
    const item = scenario as Partial<Scenario> | null
    if (typeof item !== "object" || item === null || typeof item.nombre !== "string" || typeof item.turnos !== "object" || item.turnos === null || Object.keys(item.turnos).length === 0) {
      throw new Error(`El escenario ${index + 1} necesita «nombre» y «turnos».`)
    }
  })
  return scenarios as Scenario[]
}

function plain(text: string): string {
  const map: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u" }
  return text.replace(/[áéíóúÁÉÍÓÚ]/g, (letter) => map[letter]).toLowerCase()
}

function mentions(texts: string[], alternatives: string): boolean {
  return alternatives.split("|").some((alternative) => texts.some((text) => plain(text).includes(plain(alternative))))
}

function failures(turn: ScenarioTurn, outcome: AssistantOutcome, scripted: boolean): string[] {
  const expected = turn.espera ?? {}
  const found: string[] = []
  if (expected.resultado !== undefined && !expected.resultado.split("|").includes(outcome.status)) {
    found.push(`Se esperaba «${expected.resultado}» y fue «${outcome.status}».`)
  }
  const succeeded = outcome.trace.filter((entry) => entry.resultado === "ok").map((entry) => entry.funcion)
  const missing = (expected.funciones ?? []).filter((name) => !succeeded.includes(name))
  if (missing.length > 0) found.push(`No usó con éxito: ${missing.join(", ")}.`)
  for (const change of expected.cambios ?? []) {
    if (!mentions(outcome.proposal?.changes ?? [], change)) found.push(`Ningún cambio contiene «${change}».`)
  }
  for (const words of expected.mensaje ?? []) {
    if (!mentions([outcome.message], words)) found.push(`El mensaje no menciona «${words}».`)
  }
  if (scripted) {
    const errors = outcome.trace.filter((entry) => entry.resultado.startsWith("error: ")).map((entry) => entry.resultado)
    for (const error of turn.guion?.errores ?? []) {
      if (!mentions(errors, error)) found.push(`Ninguna función devolvió el error «${error}».`)
    }
  }
  return found
}

export async function runScenario(
  base: TemplateAssistant,
  template: SyllabusTemplate,
  scenario: Scenario,
  scripted: boolean,
  after: ((result: TurnResult) => void) | null = null,
): Promise<TurnResult[]> {
  const assistant = scenario.convocatoria !== undefined ? base.assumingProcess(scenario.convocatoria) : base
  let draft: AssistantSection[] = AssistantDraft.fromTemplate(template).payload().sections
  const history: HistoryMessage[] = []
  let last: LastProposal | null = null
  const results: TurnResult[] = []
  for (const [index, turn] of scenario.turnos.entries()) {
    const message = turn.mensaje
    const outcome = await assistant.run(template, message, [...history], "escenarios", draft, last)
    const applied = outcome.proposal !== null && turn.aplicar === true
    if (outcome.proposal !== null) {
      last = {
        estado: applied ? "aplicada" : "pendiente",
        cambios: outcome.proposal.changes,
        secciones: outcome.proposal.payload.sections,
        bloques: outcome.proposal.payload.block_changes ?? [],
      }
    }
    if (applied && outcome.proposal !== null) draft = outcome.proposal.payload.sections
    history.push({ role: "user", content: message }, { role: "assistant", content: outcome.message })
    const result: TurnResult = {
      turno: index + 1,
      mensaje: message,
      outcome,
      evaluado: turn.espera !== undefined || (scripted && turn.guion?.errores !== undefined),
      aplicada: applied,
      fallas: failures(turn, outcome, scripted),
    }
    results.push(result)
    after?.(result)
  }
  return results
}

export function passRate(results: TurnResult[]): number {
  const evaluated = results.filter((result) => result.evaluado)
  if (evaluated.length === 0) return 0
  return Math.round((1000 * evaluated.filter((result) => result.fallas.length === 0).length) / evaluated.length) / 10
}
