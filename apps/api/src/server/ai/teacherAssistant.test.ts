// @vitest-environment node
import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import type { PhpRecord } from "../configuration/phpValues"
import { aiConfig, type AiConfig } from "./config"
import { AiContractException, AiProviderError, baselineGateway, gatewayFor, NO_BALANCE, type AiAgentGateway, type AiAgentStep } from "./gateway"
import { templateSystemPrompt } from "./knowledge"
import { userTag, STEP_LIMIT, TIME_LIMIT, TOO_MANY_ERRORS } from "./templateAssistant"
import { runTeacherAssistant, teacherHistory, TEACHER_NOT_ALLOWED, type HistoryTurn, type TeacherAssistantDeps, type TeacherOutcome } from "./teacherAssistant"
import { teacherBaselineGateway, teacherGatewayFor, SIMULATED_ANSWER, SIMULATED_TEXT } from "./teacherGateway"
import { teacherSystemPrompt } from "./teacherPrompt"
import { answerSpace, coordinationWrites, docOf, line, para, snapshotOf, teacherWorld, teacherWrites, words, type TeacherWorld } from "./teacherTesting"
import { call, calls, resetCallSequence, scriptedGateway, testConfig, type ScriptedGateway } from "./testing"

let world: TeacherWorld
let config: AiConfig
let clock: number
let gateway: ScriptedGateway

beforeEach(() => {
  world = teacherWorld(["descripcion", "objetivo_general", "unidades"])
  teacherWrites(world, "objetivo_general", docOf(line("Comprender el funcionamiento de las redes.")))
  config = testConfig()
  clock = 1_000_000
  resetCallSequence()
})

function script(steps: (AiAgentStep | Error)[]): ScriptedGateway {
  gateway = scriptedGateway(steps)
  return gateway
}

async function run(request = "Mejore la descripción", history: HistoryTurn[] = [], deps: Partial<TeacherAssistantDeps> = {}): Promise<TeacherOutcome> {
  return runTeacherAssistant({ gateway, config, now: () => clock, ...deps }, await snapshotOf(world), request, history, "doc-seudonimo")
}

const read = (...claves: string[]) => call("leer_campos", { claves })
const proposal = (destino: string, texto = "Estudia las redes de computadoras.", fundamento = "El objetivo general y las horas de la asignatura.") => ({ destino, texto, fundamento })
const answer = (mensaje: string, propuestas: PhpRecord[] = []) => call("responder", { mensaje, propuestas })
const resultOf = (index: number) => JSON.parse(gateway.toolResults(index).at(-1)!) as PhpRecord
const everythingSent = () => JSON.stringify(gateway.requests)
const idOf = async (key: string) => (await snapshotOf(world)).fields.find((readable) => readable.field.key === key)!.field.id

describe("what the teacher assistant sends first", () => {
  it("uses its own Spanish instructions, two tools and the pseudonym of the teacher", async () => {
    script([answer("Hola.")])

    await run()

    const [request] = gateway.requests
    expect(request.system).toBe(teacherSystemPrompt())
    expect(request.system).not.toBe(templateSystemPrompt())
    expect(request.system).toContain("asistente del docente")
    expect(request.tools.map((tool) => tool.name)).toEqual(["leer_campos", "responder"])
    expect(request.userTag).toBe("doc-seudonimo")
  })

  it("opens with the subject data, the list of readable fields and the request, without any field content", async () => {
    script([answer("Hola.")])

    await run("Mejore la descripción")

    const opening = gateway.requests[0].messages.at(-1)!.content!
    expect(gateway.requests[0].messages).toHaveLength(1)
    expect(opening).toContain('{"asignatura":"Redes de computadoras","horas_docencia":"48","horas_practicas":"32","horas_autonomas":"64","horas_totales":"144","creditos":"3","semanas":"16"}')
    expect(opening).toMatch(/^- descripcion \| .+ \| Descripción \| propuestas: sí$/m)
    expect(opening).toMatch(/^- unidades \| .+ \| propuestas: no$/m)
    expect(opening).not.toContain("conducta_etica")
    expect(opening).not.toContain("Comprender el funcionamiento")
    expect(opening.endsWith("Pedido del docente:\nMejore la descripción")).toBe(true)
  })

  it("never sends a request or an earlier turn that carries a protected table", async () => {
    script([answer("Hola.")])
    const poisoned = { question: '<div data-block="identificacion">SECRETO-1</div>', answer: '<div data-block="x">SECRETO-2</div>', proposals: [], sentFields: [] }

    await run('<div data-block="identificacion">SECRETO-3</div>', [poisoned])

    expect(everythingSent()).not.toContain("SECRETO")
  })
})

describe("reading fields", () => {
  it("returns the content and the targets of the readable fields it asks for, and only of those", async () => {
    script([read("objetivo_general", "conducta_etica", "firmas"), answer("Leído.")])

    const outcome = await run()

    const result = resultOf(1)
    expect(result.claves_no_disponibles).toBe(2)
    expect(result.campos).toEqual([
      {
        clave: "objetivo_general",
        seccion: expect.any(String),
        nombre: "Objetivo general",
        contenido: "Comprender el funcionamiento de las redes.",
        limite_de_caracteres: null,
        destinos: [{ destino: "objetivo_general", tipo: "campo completo", maximo_caracteres: null }],
      },
    ])
    expect(gateway.toolResults(1).join("")).not.toContain("conducta_etica")
    expect(outcome.sentFields).toEqual([await idOf("objetivo_general")])
  })

  it("answers with a fixed error that repeats nothing when no key is available", async () => {
    script([read("clave-INVENTADA"), answer("No pude leer.")])

    const outcome = await run()

    expect(resultOf(1)).toEqual({ error: "Ninguna de esas claves está disponible. Use las claves de la lista del pedido." })
    expect(outcome.sentFields).toEqual([])
  })

  it("shows the current text of each space of a field with fixed text", async () => {
    coordinationWrites(world, "descripcion", docOf(line("Fijo."), para(words("Enfoque: "), answerSpace({ maxLength: 40 }))))
    script([read("descripcion"), answer("Leído.")])

    await run()

    expect((resultOf(1).campos as PhpRecord[])[0]).toMatchObject({
      contenido: "Fijo.\nEnfoque: [destino descripcion#1: vacío]",
      destinos: [{ destino: "descripcion#1", tipo: "espacio", texto_actual: "", maximo_caracteres: 40 }],
    })
  })
})

describe("a field too long to be shown whole", () => {
  it("is sent cut, never admits replacing all of it and says so from the start", async () => {
    teacherWrites(world, "objetivo_general", docOf(line("a".repeat(15000)), line("b".repeat(15000))))
    script([read("objetivo_general"), answer("Reemplazo.", [proposal("objetivo_general")]), answer("Sin propuestas.")])

    const outcome = await run()

    const [field] = JSON.parse(gateway.toolResults(1)[0]).campos as PhpRecord[]
    expect(String(field.contenido)).toHaveLength(20000 + "\n[texto recortado]".length)
    expect(field.destinos).toEqual([])
    expect(gateway.requests[0].messages.at(-1)!.content).toMatch(/^- objetivo_general \| .* \| propuestas: no$/m)
    expect(resultOf(2)).toMatchObject({ error: expect.stringContaining("ese destino no está disponible") })
    expect(outcome.proposals).toEqual([])
  })
})

describe("proposals", () => {
  it("name their target and what they are based on, and count every field that was sent", async () => {
    script([read("descripcion", "objetivo_general"), answer("Le propongo una descripción.", [proposal("descripcion")])])

    const outcome = await run()

    const snapshot = await snapshotOf(world)
    const target = snapshot.fields.find((readable) => readable.field.key === "descripcion")!.targets[0]
    expect(outcome).toMatchObject({ status: "completado", message: "Le propongo una descripción.", errorCode: null, steps: 2, gatewayVersion: "guion" })
    expect(outcome.proposals).toEqual([
      {
        fieldId: await idOf("descripcion"),
        target: { kind: "campo", space: null, path: [], mold: target.mold, row: null, fieldKey: "descripcion", fieldLabel: "Descripción" },
        baseHash: target.baseHash,
        text: "Estudia las redes de computadoras.",
        basis: "El objetivo general y las horas de la asignatura.",
      },
    ])
    expect(outcome.sentFields.toSorted()).toEqual([await idOf("descripcion"), await idOf("objetivo_general")].toSorted())
    expect(outcome.usage).toEqual({ prompt: 200, completion: 20, cached: 160 })
    expect(outcome.trace).toEqual([
      { paso: 1, funcion: "leer_campos", resultado: "ok" },
      { paso: 2, funcion: "responder", resultado: "ok" },
    ])
  })

  it.each([
    ["a field it has not read", "descripcion"],
    ["a field without reading permission", "conducta_etica"],
    ["a field nobody fills", "indicadores_evaluacion"],
    ["a table", "unidades"],
    ["an invented space", "descripcion#9"],
  ])("are refused for %s with an error that repeats nothing", async (_case, destino) => {
    script([read("objetivo_general", "unidades"), answer("Propuesta.", [proposal(destino)]), answer("Sin propuestas.")])

    const outcome = await run()

    expect(resultOf(2)).toEqual({ error: "Propuesta 1: ese destino no está disponible. Lea el campo con leer_campos y use uno de sus destinos." })
    expect(outcome).toMatchObject({ status: "completado", message: "Sin propuestas.", proposals: [] })
  })

  it("are refused when the save rules of the field refuse them, with the reason", async () => {
    world.template.definition.field_limits = { descripcion: 10 }
    script([read("descripcion"), answer("Propuesta.", [proposal("descripcion", "Una descripción demasiado larga")]), answer("Corta.", [proposal("descripcion", "Redes")])])

    const outcome = await run()

    expect(resultOf(2)).toEqual({ error: "Propuesta 1: Este campo admite hasta 10 caracteres." })
    expect(outcome.proposals.map((item) => item.text)).toEqual(["Redes"])
  })

  it.each([
    ["Se aplicará lo que indique [dato del sistema]."],
    ["Se aplicará lo que indique [ Datos del Sistema ]."],
    ["Incluye [contenido omitido]."],
  ])("refuses a proposal that would write a hidden-data marker into the syllabus and lets the model rewrite it: %s", async (texto) => {
    script([read("descripcion"), answer("Propuesta.", [proposal("descripcion", texto)]), answer("Corregida.", [proposal("descripcion", "Estudia las redes.")])])

    const outcome = await run()

    expect(JSON.stringify(resultOf(2))).toContain("no puede incluir")
    expect(outcome).toMatchObject({ status: "completado", message: "Corregida." })
    expect(outcome.proposals.map((item) => item.text)).toEqual(["Estudia las redes."])
  })

  it("tells the model never to write the hidden-data markers in a proposal", async () => {
    script([answer("Hola.")])

    await run()

    expect(gateway.requests[0]!.system).toContain("nunca los escribas en una propuesta")
  })

  it.each([
    ["two proposals for one target", [proposal("descripcion"), proposal("descripcion")], "Propuesta 2: ese destino ya tiene otra propuesta."],
    ["a proposal without its basis", [{ destino: "descripcion", texto: "Redes", fundamento: " " }], "Propuesta 1: escriba el texto y en qué se basa."],
    ["more than six proposals", Array.from({ length: 7 }, () => proposal("descripcion")), "«propuestas» debe ser una lista de hasta 6 propuestas."],
  ])("are refused as a whole for %s", async (_case, propuestas, error) => {
    script([read("descripcion"), answer("Propuesta.", propuestas), answer("Nada.")])

    const outcome = await run()

    expect(resultOf(2)).toEqual({ error })
    expect(outcome.proposals).toEqual([])
  })

  it("stops after too many consecutive errors and offers nothing", async () => {
    script(Array.from({ length: 5 }, () => answer("Propuesta.", [proposal("firmas")])))

    const outcome = await run()

    expect(outcome).toMatchObject({ status: "fallido", errorCode: TOO_MANY_ERRORS, proposals: [], message: "No pude completar el pedido. Intente explicarlo de otra forma." })
    expect(gateway.requests).toHaveLength(4)
  })

  it("are refused for a field whose content the provider has not received yet, even when asked for in the same reply", async () => {
    script([calls(["leer_campos", { claves: ["descripcion"] }], ["responder", { mensaje: "A ciegas.", propuestas: [proposal("descripcion")] }]), answer("Vista.", [proposal("descripcion")])])

    const outcome = await run()

    expect(gateway.toolResults(1).map((content) => JSON.parse(content) as PhpRecord)[1]).toEqual({
      error: "Propuesta 1: ese destino no está disponible. Lea el campo con leer_campos y use uno de sus destinos.",
    })
    expect(outcome).toMatchObject({ status: "completado", message: "Vista.", steps: 2 })
    expect(outcome.proposals).toHaveLength(1)
  })

  it("takes a plain text reply as a message without proposals", async () => {
    script([{ gatewayVersion: "guion", content: "¿Qué enfoque quiere?", toolCalls: [], usage: { prompt: 1, completion: 1, cached: 0 } }])

    expect(await run()).toMatchObject({ status: "completado", message: "¿Qué enfoque quiere?", proposals: [] })
  })

  it("reports an unknown function and goes on", async () => {
    script([calls(["guardar_campo", { clave: "descripcion" }]), answer("Listo.")])

    const outcome = await run()

    expect(resultOf(1)).toEqual({ error: "Esa función no existe." })
    expect(outcome.status).toBe("completado")
  })
})

describe("failures of the loop", () => {
  it("answers a provider failure in Spanish without passing its detail on", async () => {
    script([new AiProviderError(NO_BALANCE, "saldo 0 de la cuenta 123")])

    expect(await run()).toMatchObject({ status: "fallido", errorCode: NO_BALANCE, message: "El asistente no está disponible por ahora. Puede seguir editando su sílabo." })
  })

  it("retries after an invalid reply of the provider without telling it why", async () => {
    script([new AiContractException("detalle interno"), answer("Listo.")])

    expect((await run()).status).toBe("completado")
    expect(JSON.stringify(gateway.requests[1])).not.toContain("detalle interno")
  })

  it("has a step limit and a time limit", async () => {
    config = { ...config, maxSteps: 2 }
    script([read("descripcion"), read("descripcion")])
    expect(await run()).toMatchObject({ status: "fallido", errorCode: STEP_LIMIT })

    const slow: AiAgentGateway = { version: () => "lento", step: async () => ((clock += 121_000), read("descripcion")) }
    gateway = slow as ScriptedGateway
    config = testConfig()
    expect(await run()).toMatchObject({ status: "fallido", errorCode: TIME_LIMIT })
  })

  it("stops calling the provider as soon as the request is no longer allowed", async () => {
    let checks = 0
    script([read("descripcion"), answer("No debe llegar.")])

    const outcome = await run("Pedido", [], { permitted: async () => ++checks === 1 })

    expect(outcome).toMatchObject({ status: "fallido", errorCode: "no_permitido", message: TEACHER_NOT_ALLOWED, proposals: [] })
    expect(gateway.requests).toHaveLength(1)
  })
})

describe("the conversation sent again", () => {
  const turn = (sentFields: string[], label: string): HistoryTurn => ({
    question: `Pregunta ${label}`,
    answer: `Respuesta ${label}`,
    proposals: [{ label: `Campo ${label}`, state: "aceptada", text: `Texto propuesto ${label}` }],
    sentFields,
  })

  it("keeps only the turns whose every field is still readable", async () => {
    const kept = turn([await idOf("descripcion")], "vigente")
    const mixed = turn([await idOf("descripcion"), await idOf("objetivo_general")], "mezclada")
    const free = turn([], "sin-campos")
    world.allowed.delete("objetivo_general")

    expect(teacherHistory([kept, mixed, free], await snapshotOf(world))).toEqual([kept, free])
  })

  it("sends earlier turns before the new request and carries their fields over to the new answer", async () => {
    const earlier = turn([await idOf("objetivo_general")], "anterior")
    script([answer("Sigo.")])

    const outcome = await run("Ahora más corto", [earlier])

    expect(gateway.requests[0].messages.slice(0, 2)).toEqual([
      { role: "user", content: "Pregunta anterior" },
      { role: "assistant", content: "Respuesta anterior\n\nPropuestas de esa respuesta:\n- Campo anterior (aceptada): Texto propuesto anterior" },
    ])
    expect(outcome.sentFields).toEqual([await idOf("objetivo_general")])
  })

  it("drops a turn that is no longer allowed even if the caller passes it", async () => {
    const forbidden = turn([await idOf("objetivo_general")], "prohibida")
    world.allowed.delete("objetivo_general")
    script([answer("Sigo.")])

    const outcome = await run("Otra cosa", [forbidden])

    expect(everythingSent()).not.toContain("prohibida")
    expect(outcome.sentFields).toEqual([])
  })
})

describe("the pseudonym sent to the provider", () => {
  it("is a keyed hash, with its own prefix for the teacher and the same one as before for Administration", () => {
    const hash = createHmac("sha256", "clave").update("usuario-1").digest("hex").slice(0, 32)

    expect(userTag("usuario-1", "clave")).toBe(`adm-${hash}`)
    expect(userTag("usuario-1", "clave", "doc")).toBe(`doc-${hash}`)
  })
})

describe("the simulated driver of the teacher assistant", () => {
  const simulate = async () => runTeacherAssistant({ gateway: teacherBaselineGateway, config, now: () => clock }, await snapshotOf(world), "Mejore la descripción", [], "doc-x")

  it("reads the first field that admits a proposal and proposes a fixed text, always the same", async () => {
    const outcome = await simulate()

    expect(outcome).toMatchObject({ status: "completado", message: SIMULATED_ANSWER, steps: 2, gatewayVersion: "teacher-simulator-v1" })
    expect(outcome.proposals.map((item) => [item.target.fieldKey, item.text])).toEqual([["descripcion", SIMULATED_TEXT]])
    expect(await simulate()).toEqual(outcome)
  })

  it("fits its text in the space and answers without proposals when nothing fits or nothing is readable", async () => {
    coordinationWrites(world, "descripcion", docOf(line("Fijo."), para(answerSpace({ maxLength: 12 }))))
    expect((await simulate()).proposals.map((item) => item.text)).toEqual([SIMULATED_TEXT.slice(0, 12).trimEnd()])

    world = teacherWorld(["descripcion"])
    world.template.definition.field_limits = { descripcion: 3 }
    expect(await simulate()).toMatchObject({ status: "completado", proposals: [], message: SIMULATED_ANSWER })

    world = teacherWorld()
    expect(await simulate()).toMatchObject({ status: "completado", proposals: [], steps: 1 })
  })

  it("is chosen by the baseline driver while the template assistant keeps its own simulator", () => {
    expect(teacherGatewayFor(aiConfig({ AI_DRIVER: "baseline" }))).toBe(teacherBaselineGateway)
    expect(gatewayFor(aiConfig({ AI_DRIVER: "baseline" }))).toBe(baselineGateway)
    expect(teacherGatewayFor(aiConfig({ AI_DRIVER: "deepseek", AI_MODEL: "deepseek-flash" })).version()).toBe("deepseek:deepseek-flash")
    expect(teacherGatewayFor(aiConfig({})).version()).toBe("disabled-v1")
  })
})
