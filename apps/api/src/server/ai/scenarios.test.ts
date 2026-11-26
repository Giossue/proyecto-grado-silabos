// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import { portedRoutes } from "../../modules/ported-routes"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { AssistantDraft } from "./assistantDraft"
import { baselineGateway, type AiAgentGateway } from "./gateway"
import { templateSystemPrompt } from "./knowledge"
import { loadScenarios, passRate, runScenario, SCENARIOS_FILE, type Scenario } from "./scenarios"
import { TemplateAssistant } from "./templateAssistant"
import { calls, call, officialTemplate, resetCallSequence, scriptedGateway, testConfig } from "./testing"
import { assistantTrial } from "./trial"

const CAPABILITIES = [
  "listar_variables",
  "duplicar_campo",
  "duplicar_seccion",
  "mover_campo",
  "crear_tabla_repetible",
  "ver_tabla",
  "escribir_tabla",
  "mostrar_solo_si",
  "limite_caracteres",
  "cambiar_responsable_campo",
  "usar_preset",
  "renumerar",
  "preguntar",
]

let template: SyllabusTemplate

beforeEach(() => {
  template = officialTemplate()
  resetCallSequence()
})

function assistant(gateway: AiAgentGateway): TemplateAssistant {
  return new TemplateAssistant({ gateway, config: testConfig(), system: templateSystemPrompt, processState: async () => "ninguna" })
}

describe("template assistant scenarios", () => {
  it("passes every scenario through the real tools with its script", async () => {
    const scenarios = loadScenarios()
    const before = AssistantDraft.fingerprint(template)
    expect(scenarios.length).toBeGreaterThanOrEqual(30)
    const called = new Set<string>()
    for (const [number, scenario] of scenarios.entries()) {
      const steps = []
      for (const turn of scenario.turnos) {
        expect(turn.guion, `Escenario ${scenario.nombre}: cada turno necesita su guion.`).toBeTypeOf("object")
        expect(turn.espera, `Escenario ${scenario.nombre}: cada turno necesita lo que se espera.`).toBeTypeOf("object")
        for (const step of turn.guion?.pasos ?? []) steps.push(calls(...step.map((item): [string, Record<string, unknown>] => [item.funcion, item.argumentos ?? {}])))
      }

      const results = await runScenario(assistant(scriptedGateway(steps)), template, scenario, true)

      for (const result of results) {
        expect(result.fallas, `Escenario ${number + 1} «${scenario.nombre}», turno ${result.turno}.`).toEqual([])
        for (const entry of result.outcome.trace) called.add(entry.funcion)
      }
    }
    expect(CAPABILITIES.filter((capability) => !called.has(capability))).toEqual([])
    expect(AssistantDraft.fingerprint(template)).toBe(before)
  }, 120_000)

  it("reports a turn that misses its expectations", async () => {
    const gateway = scriptedGateway([call("ver_campo", { clave: "no_existe" }), call("responder", { mensaje: "Listo." })])
    const scenario: Scenario = {
      nombre: "Falla",
      turnos: [
        {
          mensaje: "Duplica la descripción",
          espera: { resultado: "propuesta", funciones: ["duplicar_campo"], cambios: ["(copia)"], mensaje: ["copia|duplicado"] },
          guion: { pasos: [], errores: ["No existe la sección"] },
        },
      ],
    }

    const results = await runScenario(assistant(gateway), template, scenario, true)

    expect(results[0].fallas).toEqual([
      "Se esperaba «propuesta» y fue «respuesta».",
      "No usó con éxito: duplicar_campo.",
      "Ningún cambio contiene «(copia)».",
      "El mensaje no menciona «copia|duplicado».",
      "Ninguna función devolvió el error «No existe la sección».",
    ])
    expect(passRate(results)).toBe(0)
  })

  it("evaluates the scenarios in the trial and prints the pass rate", async () => {
    const lines: string[] = []
    const before = AssistantDraft.fingerprint(template)

    const code = await assistantTrial({ escenarios: SCENARIOS_FILE, solo: ["1"] }, { assistant: assistant(baselineGateway), template: async () => template }, (line) => lines.push(line))

    expect(code).toBe(0)
    expect(lines.join("\n")).toContain("Turnos que cumplen lo esperado:")
    expect(AssistantDraft.fingerprint(template)).toBe(before)
  })

  it("runs the trial with the simulator", async () => {
    const lines: string[] = []
    const before = AssistantDraft.fingerprint(template)

    const code = await assistantTrial({ pedido: ["¿Qué campos llena Coordinación?"] }, { assistant: assistant(baselineGateway), template: async () => template }, (line) => lines.push(line))

    expect(code).toBe(0)
    expect(lines.join("\n")).toContain("respuesta en 2 pasos")
    expect(AssistantDraft.fingerprint(template)).toBe(before)
  })
})

describe("routes that must not exist", () => {
  const routes = portedRoutes().map((route) => route.segments.join("/"))

  it("does not let Coordination override the AI setting of a field", () => {
    expect(routes.filter((route) => route.startsWith("api/v1/coordination/ai-configuration"))).toEqual([])
  })

  it("has no teacher AI chat and keeps the template assistant", () => {
    expect(routes.filter((route) => route.endsWith("/ai-chat"))).toEqual([])
    expect(routes).toContain("api/v1/admin/template/assistant")
  })
})
