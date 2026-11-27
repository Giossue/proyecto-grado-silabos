// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import { list, record, type PhpRecord } from "../configuration/phpValues"
import { contentForField, draftProblems, toRuntime } from "../configuration/templateDraft"
import { withBlocks } from "../configuration/templateDefinition"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { normalizeFieldDocument } from "../configuration/templateRuntime"
import { AssistantDraft, type AssistantSection } from "./assistantDraft"
import { AiContractException, AiProviderError, NO_BALANCE, type AiAgentGateway } from "./gateway"
import { templateSystemPrompt } from "./knowledge"
import {
  draftValidator,
  OUTCOME_ANSWER,
  OUTCOME_FAILED,
  OUTCOME_PROPOSAL,
  OUTCOME_QUESTION,
  STEP_LIMIT,
  TemplateAssistant,
  TIME_LIMIT,
  TOO_MANY_ERRORS,
  userTag,
  type AssistantOutcome,
} from "./templateAssistant"
import { TemplateTools } from "./templateTools"
import { call, calls, officialTemplate, resetCallSequence, scriptedGateway, testConfig, type ScriptedGateway } from "./testing"
import type { AiConfig } from "./config"

let template: SyllabusTemplate
let processes: string[]
let config: AiConfig
let clock: number

beforeEach(() => {
  template = officialTemplate()
  processes = []
  config = testConfig()
  clock = Date.UTC(2026, 10, 24, 10, 0, 0)
  resetCallSequence()
})

function assistant(gateway: AiAgentGateway): TemplateAssistant {
  return new TemplateAssistant({
    gateway,
    config,
    system: templateSystemPrompt,
    processState: async () => (processes.includes("abierto") ? "abierta" : processes.includes("pausado") ? "pausada" : "ninguna"),
    now: () => clock,
  })
}

let gateway: ScriptedGateway

function script(steps: Parameters<typeof scriptedGateway>[0]): ScriptedGateway {
  gateway = scriptedGateway(steps)
  return gateway
}

function run(request: string): Promise<AssistantOutcome> {
  return assistant(gateway).run(template, request, [], "adm-prueba")
}

function sectionsOf(outcome: AssistantOutcome): AssistantSection[] {
  return outcome.proposal?.payload.sections ?? []
}

function imported(outcome: AssistantOutcome, key: string): PhpRecord {
  const definition = withBlocks(template.definition as NonNullable<SyllabusTemplate["definition"]>, outcome.proposal?.payload.block_changes ?? {})
  const field = sectionsOf(outcome)
    .flatMap((section) => section.fields)
    .find((item) => item.key === key)
  if (field === undefined) throw new Error(`Missing field ${key}`)
  return contentForField(field.quien_llena, normalizeFieldDocument(field.content, definition))
}

function node(document: PhpRecord, ...path: (string | number)[]): PhpRecord {
  let current: unknown = document
  for (const segment of path) current = typeof segment === "number" ? list(record(current).content)[segment] : record(current)[segment]
  return record(current)
}

const laboratory =
  '<p>¿Usa laboratorio? <span data-response=\'{"kind":"una","options":[{"const":"o1","title":"Sí"},{"const":"o2","title":"No"}],"id":"usa_laboratorio"}\'></span></p>' +
  '<p>¿Cuál? <span data-response=\'{"kind":"texto","showIf":{"response":"usa_laboratorio","options":["o1"]}}\'></span></p>'

describe("template assistant", () => {
  it("checks the draft with the same rules as the live check of the editor", async () => {
    const sections: AssistantSection[] = JSON.parse(JSON.stringify(AssistantDraft.fromTemplate(template).payload().sections))
    sections[1].fields[0].key = sections[0].fields[0].key
    sections[2].title = ""
    sections.push({ key: "vacia", title: "Vacía", orientation: "portrait", fields: [] })
    const draft = AssistantDraft.fromDraft(template, sections)

    const live = await draftProblems(toRuntime(JSON.parse(JSON.stringify(draft.payload()))) as PhpRecord, template.definition as NonNullable<SyllabusTemplate["definition"]>)
    const errors = await draftValidator.errors(draft)

    expect(live.length).toBeGreaterThan(0)
    expect(errors).toHaveLength(new Set(live.map((problem) => problem.message)).size)
    for (const problem of live) expect(errors.some((error) => error.endsWith(problem.message))).toBe(true)
  })

  it("proposes a teacher field that the import accepts without touching the template", async () => {
    script([
      call("ver_plantilla"),
      call("agregar_campo", { seccion: "resultados", nombre: "Competencias", quien_llena: "docente", contenido_html: "<p>Describa las competencias:</p><p></p>", despues_de: "(final)" }),
      call("validar_borrador"),
      call("responder", { mensaje: "Propongo el campo Competencias." }),
    ])
    const before = AssistantDraft.fingerprint(template)

    const outcome = await run("Agrega Competencias")

    expect(outcome.status).toBe(OUTCOME_PROPOSAL)
    expect(outcome.message).toBe("Propongo el campo Competencias.")
    expect(outcome.proposal?.changes).toEqual(["Nuevo campo «Competencias» en «4. Resultados de aprendizaje»."])
    expect(outcome.proposal?.fingerprint).toBe(before)
    expect(AssistantDraft.fingerprint(template)).toBe(before)
    expect(gateway.toolResults(3)[2]).toContain('"valido":true')
    expect(outcome.usage).toEqual({ prompt: 400, completion: 40, cached: 320 })
    expect((await draftProblems(toRuntime(JSON.parse(JSON.stringify(outcome.proposal?.payload))) as PhpRecord, template.definition as never)).filter((problem) => problem.blocking)).toEqual([])
    const field = AssistantDraft.fromTemplate(template, sectionsOf(outcome)).overview().find((section) => section.clave === "resultados")?.campos as PhpRecord[]
    expect(field[1]).toEqual({ posicion: 2, clave: "competencias", nombre: "Competencias", quien_llena: "carrera", resumen: "Describa las competencias:" })
  })

  it("refuses to remove required sections and sends the reason back to the model", async () => {
    script([call("quitar_seccion", { clave: "habilidades" }), call("responder", { mensaje: "Esa sección es obligatoria." })])

    const outcome = await run("Quita las habilidades blandas")

    expect(outcome.status).toBe(OUTCOME_ANSWER)
    expect(outcome.proposal).toBeNull()
    expect(gateway.toolResults(1)[0]).toContain("es obligatoria y no se puede quitar")
  })

  it("reports unknown variables and invalid responsibles to the model", async () => {
    script([
      calls(
        ["agregar_campo", { seccion: "descripcion", nombre: "Dato", quien_llena: "institucional", contenido_html: '<p><span data-variable="inventada"></span></p>', despues_de: "(final)" }],
        ["cambiar_responsable_campo", { clave: "descripcion", quien_llena: "decano" }],
        ["ver_campo", { clave: "no_existe" }],
      ),
      call("responder", { mensaje: "No pude." }),
    ])

    await run("Pedido")

    const [variable, responsible, missing] = gateway.toolResults(1)
    expect(variable).toContain("El contenido no es válido")
    expect(responsible).toContain("quien_llena debe ser")
    expect(missing).toContain("No existe el campo «no_existe»")
  })

  it("places responses with their settings", async () => {
    const response =
      '<p>Modalidad: <span data-response=\'{"kind":"una","options":[{"const":"o1","title":"Presencial"},{"const":"o2","title":"En línea"}],"display":"desplegable","help":"Elija la modalidad principal."}\'></span></p>' +
      '<p>Observaciones: <span data-response=\'{"kind":"texto","required":false,"maxLength":300}\'></span></p>'
    script([
      calls(
        ["agregar_campo", { seccion: "descripcion", nombre: "Mal", quien_llena: "carrera", contenido_html: '<p><span data-response=\'{"kind":"texto","maxLength":5000}\'></span></p>', despues_de: "(final)" }],
        ["agregar_campo", { seccion: "descripcion", nombre: "Modalidad", quien_llena: "carrera", contenido_html: response, despues_de: "(final)" }],
      ),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Pedido")

    const [invalid, valid] = gateway.toolResults(1)
    expect(invalid).toContain("El límite de caracteres va de 1 a 3000.")
    expect(valid).toContain('"ok":true')
    const content = imported(outcome, "modalidad")
    expect(node(content, 0, 1).attrs).toEqual({
      kind: "una",
      options: [
        { const: "o1", title: "Presencial" },
        { const: "o2", title: "En línea" },
      ],
      value: null,
      help: "Elija la modalidad principal.",
      display: "desplegable",
    })
    expect(node(content, 1, 1).attrs).toEqual({ kind: "texto", options: [], value: "", required: false, maxLength: 300 })
  })

  it("shows a field or a response only if an earlier answer was chosen", async () => {
    script([
      call("agregar_campo", { seccion: "descripcion", nombre: "Laboratorio", quien_llena: "carrera", contenido_html: laboratory, despues_de: "(final)" }),
      calls(
        ["mostrar_solo_si", { clave: "descripcion", respuesta: "usa_laboratorio", opciones: ["Sí"] }],
        ["mostrar_solo_si", { clave: "objetivo_general", respuesta: "usa_laboratorio", opciones: ["Tal vez"] }],
        ["mostrar_solo_si", { clave: "objetivo_general", respuesta: "no_existe", opciones: ["Sí"] }],
        ["mostrar_solo_si", { clave: "objetivo_general", respuesta: "usa_laboratorio", opciones: ["Sí"] }],
      ),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Muestra el objetivo general solo si usa laboratorio")

    const [earlier, missingOption, missingResponse, valid] = gateway.toolResults(2).slice(1)
    expect(earlier).toContain("usa una respuesta que ya no está antes de esta parte")
    expect(missingOption).toContain("no tiene la opción «Tal vez»")
    expect(missingResponse).toContain("No hay ninguna respuesta con el identificador «no_existe»")
    expect(valid).toContain('"ok":true')
    expect(outcome.proposal?.changes).toContain("«Objetivo general» se mostrará solo si la respuesta «usa_laboratorio» tiene: o1.")
    const conditions = Object.fromEntries(sectionsOf(outcome).flatMap((section) => section.fields.filter((field) => field.show_if !== undefined).map((field) => [field.key, field.show_if])))
    expect(conditions).toEqual({ objetivo_general: { response: "usa_laboratorio", options: ["o1"] } })
    expect(record(node(imported(outcome, "laboratorio"), 1, 1).attrs).showIf).toEqual({ response: "usa_laboratorio", options: ["o1"] })
  })

  it("sets and removes a character limit only on editable fields", async () => {
    script([
      calls(
        ["limite_caracteres", { clave: "firmas", limite: 500 }],
        ["limite_caracteres", { clave: "descripcion", limite: 50001 }],
        ["limite_caracteres", { clave: "descripcion", limite: 500 }],
        ["limite_caracteres", { clave: "objetivo_general", limite: 800 }],
        ["limite_caracteres", { clave: "objetivo_general", limite: 0 }],
      ),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Que en la descripción el docente escriba hasta 500 caracteres")

    const [institutional, outOfRange, valid] = gateway.toolResults(1)
    expect(institutional).toContain("Un campo «Nadie (texto fijo)» no puede tener límite de caracteres.")
    expect(outOfRange).toContain("El límite de caracteres debe ser un número entero entre 1 y 50 000.")
    expect(valid).toContain('"ok":true')
    expect(outcome.proposal?.changes).toContain("«Descripción» admitirá hasta 500 caracteres del docente.")
    const limits = Object.fromEntries(sectionsOf(outcome).flatMap((section) => section.fields.filter((field) => field.max_length !== undefined).map((field) => [field.key, field.max_length])))
    expect(limits).toEqual({ descripcion: 500 })
  })

  it("duplicates a field and a section with new keys and response ids", async () => {
    script([
      call("agregar_campo", { seccion: "descripcion", nombre: "Laboratorio", quien_llena: "carrera", contenido_html: laboratory, despues_de: "(final)" }),
      calls(["duplicar_campo", { clave: "laboratorio" }], ["duplicar_seccion", { clave: "objetivos" }], ["duplicar_campo", { clave: "no_existe" }]),
      call("validar_borrador"),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Duplica el campo de laboratorio y la sección de objetivos")

    const [field, section, missing] = gateway.toolResults(2).slice(1)
    expect(field).toContain('"clave":"laboratorio_2"')
    expect(section).toContain('"clave":"objetivos_2"')
    expect(missing).toContain("No existe el campo «no_existe»")
    expect(gateway.toolResults(3)[4]).toContain('"valido":true')
    expect(outcome.proposal?.changes).toEqual([
      "Nueva sección «3. Objetivo(s) de la asignatura (copia)».",
      "Nuevo campo «Laboratorio» en «2. Descripción de la asignatura».",
      "Nuevo campo «Laboratorio (copia)» en «2. Descripción de la asignatura».",
      "Nuevo campo «Objetivo general» en «3. Objetivo(s) de la asignatura (copia)».",
      "Nuevo campo «Objetivos específicos» en «3. Objetivo(s) de la asignatura (copia)».",
    ])
    const sections = sectionsOf(outcome)
    expect(sections[1].fields.map((item) => item.key)).toEqual(["descripcion", "laboratorio", "laboratorio_2"])
    expect([sections[2].key, sections[3].key]).toEqual(["objetivos", "objetivos_2"])
    expect(sections[3].fields.map((item) => item.key)).toEqual(["objetivo_general_2", "objetivos_especificos_2"])
    expect(sections[3].fields.map((item) => item.label)).toEqual(["Objetivo general", "Objetivos específicos"])
    const copy = imported(outcome, "laboratorio_2")
    expect(record(node(copy, 0, 1).attrs).id).toBe("usa_laboratorio_2")
    expect(record(node(copy, 1, 1).attrs).showIf).toEqual({ response: "usa_laboratorio", options: ["o1"] })
  })

  it("creates a simple repeatable table and places it in a field", async () => {
    const column = (nombre: string, tipo: string, obligatoria = false, opciones: string[] = []) => ({ nombre, tipo, obligatoria, opciones })
    const table = { titulo: "Prácticas de laboratorio", fila: "práctica", minimo: 1, maximo: 10, al_empezar: 2 }
    script([
      calls(
        ["crear_tabla_repetible", { ...table, columnas: [column("Modalidad", "opcion")] }],
        ["crear_tabla_repetible", { ...table, maximo: 0, columnas: [column("Tema", "texto")] }],
        ["crear_tabla_repetible", { ...table, columnas: [column("Tema", "texto", true), column("Modalidad", "opcion", false, ["Presencial", "Virtual"]), column("Horas", "numero")] }],
      ),
      call("agregar_campo", { seccion: "descripcion", nombre: "Prácticas", quien_llena: "carrera", contenido_html: '<div data-block="tabla_practicas_de_laboratorio"></div>', despues_de: "(final)" }),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Agrega una tabla de prácticas")

    const [noOptions, badLimits, created] = gateway.toolResults(1)
    expect(noOptions).toContain("La columna «Modalidad» es de tipo opcion: escriba sus opciones sin repetir.")
    expect(badLimits).toContain("La tabla no es válida")
    expect(created).toContain('"clave":"tabla_practicas_de_laboratorio"')
    expect(gateway.toolResults(2)[3]).toContain('"ok":true')
    expect(outcome.proposal?.changes).toContain("Nueva tabla repetible «Prácticas de laboratorio».")
    const definition = withBlocks(template.definition as never, outcome.proposal?.payload.block_changes ?? {})
    const block = record(definition.blocks.tabla_practicas_de_laboratorio)
    expect(Object.keys(record(record(record(record(block.value).filas).items).properties))).toEqual(["tema", "modalidad", "horas"])
    expect(list(block.rules).map((rule) => record(rule).code)).toEqual(["tema_obligatoria"])
    expect(record(node(imported(outcome, "practicas"), 0).attrs).kind).toBe("tabla_practicas_de_laboratorio")
  })

  it("accepts only the palette colors", async () => {
    script([
      calls(
        ["agregar_campo", { seccion: "descripcion", nombre: "Verde", quien_llena: "docente", contenido_html: '<table><tr><th style="background:#00FF00">A</th></tr><tr><td></td></tr></table>', despues_de: "(final)" }],
        ["agregar_campo", { seccion: "descripcion", nombre: "Rojo", quien_llena: "docente", contenido_html: '<p><span style="color:#C00000">Atención</span></p>', despues_de: "(final)" }],
        [
          "agregar_campo",
          {
            seccion: "descripcion",
            nombre: "Oficial",
            quien_llena: "docente",
            contenido_html: '<table><tr><th style="background:#4f81bd;color:#FFFFFF;font-weight:bold"><span style="color:#365F91">T</span></th></tr><tr><td></td></tr></table>',
            despues_de: "(final)",
          },
        ],
      ),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Pedido")

    const [green, red, official] = gateway.toolResults(1)
    expect(green).toContain("Colores no permitidos: #00FF00")
    expect(red).toContain("Colores no permitidos: #C00000")
    expect(official).toContain('"ok":true')
    expect(outcome.proposal?.changes).toEqual(["Nuevo campo «Oficial» en «2. Descripción de la asignatura»."])
  })

  it("sends an answer over an invalid draft back for correction", async () => {
    script([
      call("agregar_seccion", { titulo: "Prácticas", orientacion: "vertical", despues_de: "metodologia" }),
      call("responder", { mensaje: "Listo." }),
      call("agregar_campo", { seccion: "practicas", nombre: "", quien_llena: "docente", contenido_html: "", despues_de: "(final)" }),
      call("responder", { mensaje: "Agregué la sección Prácticas." }),
    ])

    const outcome = await run("Agrega prácticas")

    expect(gateway.toolResults(2)[1]).toContain("no tiene campos")
    expect(outcome.status).toBe(OUTCOME_PROPOSAL)
    expect(outcome.proposal?.changes).toEqual(["Nueva sección «Prácticas».", "Nuevo campo «campo» en «Prácticas»."])
    expect(sectionsOf(outcome)[7]?.key).toBe("practicas")
  })

  it("keeps the keys on moves and renames and lists the changes", async () => {
    script([
      calls(
        ["mover_seccion", { clave: "bibliografia", despues_de: "planificacion" }],
        ["renombrar_campo", { clave: "metodologia", nombre: "7.1 Métodos de enseñanza y aprendizaje" }],
        ["cambiar_orientacion_seccion", { clave: "planificacion", orientacion: "vertical" }],
      ),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Pedido")

    expect(outcome.proposal?.changes).toEqual([
      "La sección «6. Distribución y planificación de las unidades curriculares» pasa a vertical.",
      "Cambia el orden de las secciones.",
      "El campo «7.1 Métodos de enseñanza – aprendizaje» se llamará «7.1 Métodos de enseñanza y aprendizaje».",
    ])
    const keys = sectionsOf(outcome).map((section) => section.key)
    expect(keys[6]).toBe("bibliografia")
    expect(template.sections.map((section) => section.key)).toEqual([...keys.slice(0, 6), ...keys.slice(7, 11), "bibliografia", ...keys.slice(11)])
  })

  it("places sections after a key and renumbers them with their fields", async () => {
    script([
      calls(
        ["mover_seccion", { clave: "habilidades", despues_de: "perfil_egreso" }],
        ["agregar_seccion", { titulo: "1. Proyecto integrador", orientacion: "vertical", despues_de: "planificacion" }],
        ["mover_seccion", { clave: "etica", despues_de: "nada" }],
      ),
      calls(["agregar_campo", { seccion: "proyecto_integrador", nombre: "Proyecto", quien_llena: "docente", contenido_html: "", despues_de: "(inicio)" }], ["renumerar"]),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Pedido")

    expect(gateway.toolResults(1)[2]).toContain("«nada»")
    expect(gateway.toolResults(2)[4] ?? "").toContain("«1. Proyecto integrador» → «6. Proyecto integrador»")
    expect(sectionsOf(outcome).map((section) => section.title)).toEqual([
      "1. Identificación institucional",
      "2. Descripción de la asignatura",
      "3. Objetivo(s) de la asignatura",
      "4. Resultados de aprendizaje",
      "5. Distribución y planificación de las unidades curriculares",
      "6. Proyecto integrador",
      "7. Metodología y ambientes de aprendizaje",
      "8. Evaluación de los aprendizajes",
      "9. Relación de la asignatura con los resultados de aprendizaje del perfil de egreso de la carrera",
      "10. Habilidades blandas de la asignatura",
      "11. Conducta y comportamiento ético",
      "12. Bibliografía",
      "Revisión y aprobación",
    ])
    expect(sectionsOf(outcome)[6].fields.map((field) => field.label.split(" ")[0])).toEqual(["7.1", "7.2", "7.3", "7.4", "7.5"])
  })

  it("never reuses the key of a removed field for a new field", async () => {
    script([
      calls(
        ["quitar_campo", { clave: "herramientas_tic" }],
        ["agregar_campo", { seccion: "metodologia", nombre: "Herramientas TIC", quien_llena: "docente", contenido_html: "<p></p>", despues_de: "recursos_medios" }],
      ),
      call("responder", { mensaje: "Listo." }),
    ])

    const outcome = await run("Pedido")

    expect(sectionsOf(outcome)[6].fields.map((field) => field.key)).toEqual(["metodologia", "tecnicas_ensenanza", "recursos_medios", "herramientas_tic_2", "ambientes_aprendizaje"])
  })

  it("sets the content and who fills it with a preset", async () => {
    script([call("usar_preset", { clave: "descripcion", preset: "bibliografia_basica" }), call("responder", { mensaje: "Listo." })])

    const outcome = await run("Pedido")

    const field = sectionsOf(outcome)[1].fields[0]
    expect(field.quien_llena).toBe("carrera")
    expect([node(field.content, 0).type, record(node(field.content, 0).attrs).kind]).toEqual(["documentBlock", "bibliografia"])
  })

  it("stops at the step limit", async () => {
    config = testConfig({ maxSteps: 3 })
    script([call("ver_plantilla"), call("ver_plantilla"), call("ver_plantilla")])

    const outcome = await run("Pedido")

    expect(outcome.status).toBe(OUTCOME_FAILED)
    expect(outcome.errorCode).toBe(STEP_LIMIT)
    expect(outcome.message).toBe("No pude completar el pedido. Intente explicarlo de otra forma.")
  })

  it("stops after too many errors in a row", async () => {
    config = testConfig({ maxConsecutiveErrors: 2 })
    script([call("ver_campo", { clave: "nada" }), call("ver_campo", { clave: "nada" }), call("ver_campo", { clave: "nada" })])

    const outcome = await run("Pedido")

    expect(outcome.errorCode).toBe(TOO_MANY_ERRORS)
    expect(outcome.steps).toBe(3)
  })

  it("stops when the time runs out", async () => {
    const slow: AiAgentGateway = {
      version: () => "lento",
      step: async () => {
        clock += 3 * 60 * 1000
        return call("ver_plantilla")
      },
    }

    const outcome = await assistant(slow).run(template, "Pedido", [], "adm-prueba")

    expect(outcome.errorCode).toBe(TIME_LIMIT)
    expect(outcome.steps).toBe(1)
  })

  it("counts blank answers as retries", async () => {
    script([new AiContractException("El proveedor devolvió una respuesta en blanco."), call("responder", { mensaje: "Hola." })])

    const outcome = await run("Hola")

    expect(outcome.status).toBe(OUTCOME_ANSWER)
    expect(outcome.trace[0].funcion).toBe("(respuesta inválida)")
  })

  it("ends provider errors with a simple message", async () => {
    script([new AiProviderError(NO_BALANCE, "Sin saldo.")])

    const outcome = await run("Pedido")

    expect(outcome.errorCode).toBe(NO_BALANCE)
    expect(outcome.message).toBe("El asistente no está disponible por ahora. Puede seguir editando la plantilla.")
  })

  it("only allows reading while a convocation is open", async () => {
    processes = ["abierto"]
    script([
      call("agregar_campo", { seccion: "descripcion", nombre: "X", quien_llena: "docente", contenido_html: "", despues_de: "(final)" }),
      call("ver_estado"),
      call("responder", { mensaje: "El periodo académico está abierto." }),
    ])

    const outcome = await run("Agrega un campo")

    const names = gateway.requests[0].tools.map((tool) => tool.name)
    expect(names).not.toContain("agregar_campo")
    expect(names).toContain("ver_plantilla")
    expect(gateway.requests[0].messages[0].content).toContain("El periodo académico está abierto")
    expect(gateway.toolResults(1)[0]).toContain("no se pueden proponer cambios")
    expect(gateway.toolResults(2)[1]).toContain('"estado":"abierta"')
    expect(outcome.status).toBe(OUTCOME_ANSWER)
  })

  it("presents a short reply as the answer to the previous question", async () => {
    script([call("responder", { mensaje: "Listo." }), call("responder", { mensaje: "Hola." })])
    const history = [
      { role: "user" as const, content: "cambia el 8" },
      { role: "assistant" as const, content: "¿1) el título o 2) el campo?" },
    ]

    await assistant(gateway).run(template, "1", history, "adm-prueba")
    await assistant(gateway).run(template, "Hola", [], "adm-prueba")

    const last = (index: number) => gateway.requests[index].messages[gateway.requests[index].messages.length - 1].content ?? ""
    expect(gateway.requests[0].messages.map((message) => message.role)).toEqual(["user", "assistant", "user"])
    expect(last(0)).toContain("puede ser la respuesta a su última pregunta")
    expect(last(1)).toContain("Pedido del administrador:\nHola")
  })

  it("ends the turn with a question and no proposal", async () => {
    script([call("agregar_seccion", { titulo: "Datos", orientacion: "vertical", despues_de: "(final)" }), call("preguntar", { pregunta: "¿Qué datos del docente quiere?" })])

    const outcome = await run("Agrega los datos del docente")

    expect(outcome.status).toBe(OUTCOME_QUESTION)
    expect(outcome.message).toBe("¿Qué datos del docente quiere?")
    expect(outcome.proposal).toBeNull()
  })

  it("fits every tool schema to the strict mode", () => {
    const tools = new TemplateTools(AssistantDraft.fromTemplate(template), draftValidator, { estado: "ninguna", aviso: "" })

    for (const spec of tools.specs()) {
      const properties = record(spec.parameters.properties)
      expect(spec.parameters.type).toBe("object")
      expect(spec.parameters.additionalProperties).toBe(false)
      expect(spec.parameters.required).toEqual(Object.keys(properties))
      expect(spec.name).toMatch(/^[a-z_]{1,64}$/)
      for (const property of Object.values(properties)) expect(Object.keys(record(property)).filter((name) => ["minLength", "maxLength", "minItems", "maxItems"].includes(name))).toEqual([])
    }
    expect(JSON.stringify(tools.specs()[0].parameters)).toBe('{"type":"object","properties":{},"required":[],"additionalProperties":false}')
  })

  it("keeps the user tag stable and anonymous", () => {
    const key = "base64:" + Buffer.alloc(32, 7).toString("base64")
    const tag = userTag("11111111-1111-1111-1111-111111111111", key)

    expect(userTag("11111111-1111-1111-1111-111111111111", key)).toBe(tag)
    expect(userTag("22222222-2222-2222-2222-222222222222", key)).not.toBe(tag)
    expect(tag).toMatch(/^adm-[0-9a-f]{32}$/)
  })
})
