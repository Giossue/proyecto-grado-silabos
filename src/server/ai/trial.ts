import { existsSync, readFileSync } from "node:fs"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { loadScenarios, passRate, resourcePath, runScenario, type TurnResult } from "./scenarios"
import type { AssistantOutcome, TemplateAssistant } from "./templateAssistant"

export const REQUESTS_FILE = "src/server/ai/resources/pruebas.txt"

export type TrialOptions = { pedido?: string[]; archivo?: string; escenarios?: string; solo?: string[] }

export type TrialDeps = { assistant: TemplateAssistant; template: () => Promise<SyllabusTemplate | null> }

type Write = (line: string) => void

function trim(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
}

function seconds(started: number): number {
  return Math.round((performance.now() - started) / 100) / 10
}

function table(write: Write, headers: string[], rows: (string | number)[][]): void {
  const cells = [headers, ...rows.map((row) => row.map(String))]
  const widths = headers.map((_, column) => Math.max(...cells.map((row) => [...(row[column] ?? "")].length)))
  const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`
  const line = (row: string[]) => `|${row.map((cell, column) => ` ${cell}${" ".repeat(widths[column] - [...cell].length)} `).join("|")}|`
  write(border)
  write(line(headers))
  write(border)
  for (const row of cells.slice(1)) write(line(row))
  write(border)
}

function report(write: Write, number: number, request: string, outcome: AssistantOutcome, elapsed: number): void {
  write("")
  write(`${number}. ${request}`)
  for (const entry of outcome.trace) write(`   paso ${entry.paso} · ${entry.funcion} ${entry.argumentos} → ${entry.resultado}`)
  write(`   ${outcome.status} en ${outcome.steps} pasos y ${elapsed} s (${outcome.gatewayVersion})`)
  write(`   ${outcome.message.replaceAll("\n", "\n   ")}`)
  for (const change of outcome.proposal?.changes ?? []) write(`   - ${change}`)
}

function requests(options: TrialOptions): string[] {
  const given = (options.pedido ?? []).map(trim).filter((line) => line !== "")
  if (given.length > 0) return given
  const file = resourcePath(options.archivo ?? REQUESTS_FILE)
  if (!existsSync(file)) return []
  return readFileSync(file, "utf8")
    .split(/\r\n|[\n\v\f\r\u0085\u2028\u2029]/u)
    .map(trim)
    .filter((line) => line !== "" && !line.startsWith("#"))
}

async function scenarios(options: TrialOptions, deps: TrialDeps, template: SyllabusTemplate, write: Write): Promise<number> {
  let loaded
  try {
    loaded = loadScenarios(options.escenarios)
  } catch (error) {
    write((error as Error).message)
    return 1
  }
  const only = (options.solo ?? []).map((value) => Number.parseInt(value, 10) || 0)
  const summary: (string | number)[][] = []
  const all: TurnResult[] = []
  for (const [index, scenario] of loaded.entries()) {
    const number = index + 1
    if (only.length > 0 && !only.includes(number)) continue
    write("")
    write(`Escenario ${number}: ${scenario.nombre}`)
    let started = performance.now()
    const results = await runScenario(deps.assistant, (await deps.template()) ?? template, scenario, false, (result) => {
      const elapsed = seconds(started)
      const outcome = result.outcome
      report(write, result.turno, result.mensaje, outcome, elapsed)
      if (result.aplicada) write("   → Aplicada en el editor")
      for (const failure of result.fallas) write(`   ✗ ${failure}`)
      const verdict = !result.evaluado ? "" : result.fallas.length === 0 ? "cumple" : "no cumple"
      summary.push([number, result.turno, outcome.status, outcome.errorCode ?? "", outcome.steps, elapsed, result.aplicada ? "sí" : "", verdict])
      started = performance.now()
    })
    all.push(...results)
  }
  write("")
  table(write, ["Escenario", "Turno", "Resultado", "Error", "Pasos", "Segundos", "Aplicada", "Esperado"], summary)
  const evaluated = all.filter((result) => result.evaluado)
  const passed = evaluated.filter((result) => result.fallas.length === 0)
  write(`Turnos que cumplen lo esperado: ${passed.length} de ${evaluated.length} (${passRate(all)} %)`)
  return 0
}

export async function assistantTrial(options: TrialOptions, deps: TrialDeps, write: Write): Promise<number> {
  const template = await deps.template()
  if (template === null) {
    write("No hay plantilla institucional.")
    return 1
  }
  if (options.escenarios !== undefined && options.escenarios !== "") return scenarios(options, deps, template, write)
  const pending = requests(options)
  if (pending.length === 0) {
    write("No hay pedidos para probar.")
    return 1
  }
  const summary: (string | number)[][] = []
  for (const [index, request] of pending.entries()) {
    const started = performance.now()
    const outcome = await deps.assistant.run((await deps.template()) ?? template, request)
    const elapsed = seconds(started)
    report(write, index + 1, request, outcome, elapsed)
    summary.push([index + 1, outcome.status, outcome.errorCode ?? "", outcome.steps, elapsed, outcome.usage.prompt, outcome.usage.cached, outcome.usage.completion])
  }
  write("")
  table(write, ["#", "Resultado", "Error", "Pasos", "Segundos", "Entrada", "En caché", "Salida"], summary)
  return 0
}
