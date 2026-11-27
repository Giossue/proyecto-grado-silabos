// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import { makeAssignment, makeUser } from "../auth/testing"
import type { PhpRecord } from "../configuration/phpValues"
import { aiConfig, type AiConfig } from "./config"
import { AiProviderError, BUSY, type AiAgentStep } from "./gateway"
import { userTag } from "./templateAssistant"
import { answerTeacherAssistant, failTeacherAssistant, teacherSessionOn, type TeacherAnswerDeps } from "./teacherAnswerJob"
import { TEACHER_NOT_ALLOWED } from "./teacherAssistant"
import type { TeacherMessage } from "./teacherAssistantStore"
import { CAREER_ID, fakeTeacherStore, storeWorld, SYLLABUS_ID, type StoreWorld } from "./teacherStoreTesting"
import {
  coordinationWrites,
  COORDINATOR_NAME,
  docOf,
  fieldByKey,
  LIBRARIAN_NAME,
  line,
  para,
  SYSTEM_VARIABLES,
  TEACHER_EMAIL,
  TEACHER_NAME,
  teacherWrites,
  variableNode,
  words,
} from "./teacherTesting"
import { call, resetCallSequence, scriptedGateway, testConfig, type ScriptedGateway } from "./testing"

const TEACHER = "d0000000-0000-4000-8000-000000000001"
const OTHER_TEACHER = "d0000000-0000-4000-8000-000000000002"
const OBJECTIVE = "OBJETIVO-RESERVADO comprender las redes"

let world: StoreWorld
let config: AiConfig
let enabled: boolean
let today: string
let active: boolean
let role: string
let gateway: ScriptedGateway
let sequence: number

beforeEach(() => {
  world = storeWorld(TEACHER, ["descripcion", "objetivo_general"])
  teacherWrites(world, "objetivo_general", docOf(line(OBJECTIVE)))
  config = testConfig()
  enabled = true
  today = "2026-11-27"
  active = true
  role = "docente"
  sequence = 0
  resetCallSequence()
})

const nextId = (prefix: string) => `${prefix}-0000-4000-8000-${String(++sequence).padStart(12, "0")}`

function deps(): TeacherAnswerDeps {
  return {
    store: fakeTeacherStore(world),
    config: () => config,
    enabled: async () => enabled,
    today: () => today,
    teacherSession: teacherSessionOn({
      findUser: async (id) => makeUser({ id, active }),
      effectiveRoleAssignments: async (userId) => [makeAssignment({ userId, role, careerId: CAREER_ID })],
    }),
    gateway: () => gateway,
    appKey: () => "clave-de-prueba",
    now: () => world.clock,
    newProposalId: () => nextId("e0000000"),
  }
}

function asks(text: string, userId = TEACHER, syllabusId = SYLLABUS_ID): string {
  world.clock++
  const question = nextId("a0000000")
  const answer = nextId("b0000000")
  const base = { syllabusId, userId, sentFields: [], errorCode: null, createdAt: world.clock }
  world.messages.push(
    { ...base, id: question, role: "usuario", state: "completado", replyTo: null, content: { texto: text }, key: question },
    { ...base, id: answer, role: "asistente", state: "pendiente", replyTo: question, content: { texto: "" }, key: null },
  )
  return answer
}

function script(...steps: (AiAgentStep | Error)[]): ScriptedGateway {
  gateway = scriptedGateway(steps)
  return gateway
}

const read = (...claves: string[]) => call("leer_campos", { claves })
const reply = (mensaje: string, ...propuestas: PhpRecord[]) => call("responder", { mensaje, propuestas })
const proposal = (destino: string, texto: string) => ({ destino, texto, fundamento: "El objetivo general." })
const answerOf = (id: string): TeacherMessage => world.messages.find((message) => message.id === id)!
const sent = () => JSON.stringify(gateway.requests)
const idOf = (key: string) => fieldByKey(world.template, key).id

async function ask(text: string, ...steps: (AiAgentStep | Error)[]): Promise<string> {
  script(...steps)
  const id = asks(text)
  await answerTeacherAssistant(id, deps())
  return id
}

describe("the job that answers the teacher", () => {
  it("stores the answer, what was sent and the proposals", async () => {
    const id = await ask("Mejore la descripción", read("descripcion", "objetivo_general"), reply("Le propongo esto.", proposal("descripcion", "Estudia redes.")))

    expect(answerOf(id)).toMatchObject({ state: "completado", errorCode: null, content: { texto: "Le propongo esto.", pasos: 2, version_pasarela: "guion", uso: { prompt: 200, completion: 20, cached: 160 } } })
    expect(answerOf(id).sentFields.toSorted()).toEqual([idOf("descripcion"), idOf("objetivo_general")].toSorted())
    expect(world.proposals).toMatchObject([
      { messageId: id, syllabusId: SYLLABUS_ID, userId: TEACHER, position: 0, state: "pendiente", fieldId: idOf("descripcion"), text: "Estudia redes.", basis: "El objetivo general.", target: { kind: "campo", fieldKey: "descripcion" } },
    ])
  })

  it("never sends names, e-mails, system values or identifiers, and identifies the teacher by a pseudonym", async () => {
    coordinationWrites(world, "descripcion", docOf(para(words("Aprobado por: "), ...SYSTEM_VARIABLES.map(variableNode)), para({ type: "response", attrs: { kind: "texto", options: [], value: "" } })))
    teacherWrites(world, "objetivo_general", docOf(para(words("Objetivo de "), ...SYSTEM_VARIABLES.map(variableNode))))
    const table = structuredClone(fieldByKey(world.template, "asignatura").content) as { content: { attrs: PhpRecord }[] }
    table.content[0].attrs.value = { disability: { answer: "si", type: "TIPO-PROTEGIDO", description: "ADAPTACION-PROTEGIDA" } }
    teacherWrites(world, "asignatura", table)
    world.allowed.add("asignatura")

    await ask("Revise todo", read("descripcion", "objetivo_general", "asignatura"), reply("Revisado."))

    expect(gateway.requests).toHaveLength(2)
    for (const request of gateway.requests) expect(request.userTag).toBe(userTag(TEACHER, "clave-de-prueba", "doc"))
    for (const forbidden of [TEACHER_NAME, TEACHER_EMAIL, COORDINATOR_NAME, LIBRARIAN_NAME, TEACHER, SYLLABUS_ID, CAREER_ID, "Ana Pérez", "PROTEGID", "SW-701", "Ciencias Administrativas", "Firma del docente"]) {
      expect(sent(), forbidden).not.toContain(forbidden)
    }
    for (const variable of SYSTEM_VARIABLES) expect(sent(), variable).not.toContain(variable)
    expect(gateway.toolResults(1)[0]).toContain("[dato del sistema]")
    expect(JSON.parse(gateway.toolResults(1)[0])).toMatchObject({ claves_no_disponibles: 1 })
  })

  it.each([
    ["the reading permission is removed", () => void world.allowed.delete("objetivo_general")],
    ["Coordination closes the field", () => coordinationWrites(world, "objetivo_general", docOf(line("Texto cerrado.")))],
    ["a condition hides the field", () => {
      teacherWrites(world, "nombre_campus", docOf(para({ type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Sí" }], value: null, id: "control" } })))
      world.template.definition.field_conditions = { objetivo_general: { response: "control", options: ["o1"] } }
    }],
  ])("applies the current rules when it runs: after %s the field is not sent", async (_case, change) => {
    script(read("objetivo_general", "descripcion"), reply("Hecho."))
    const id = asks("Revise el objetivo")
    change()

    await answerTeacherAssistant(id, deps())

    expect(sent()).not.toContain("OBJETIVO-RESERVADO")
    expect(gateway.requests[0].messages.at(-1)!.content).not.toContain("- objetivo_general |")
    expect(answerOf(id).sentFields).toEqual([idOf("descripcion")])
  })

  it.each([
    ["the switch is turned off", () => void (enabled = false)],
    ["the provider is not configured", () => void (config = aiConfig({ AI_DRIVER: "deepseek" }))],
    ["the provider is disabled", () => void (config = aiConfig({}))],
    ["the teacher is reassigned", () => void world.teachers.set(SYLLABUS_ID, [OTHER_TEACHER])],
    ["the syllabus is sent to review", () => void (world.facts.state = "en_revision")],
    ["the period is paused", () => void (world.facts.processState = "pausado")],
    ["the career call is closed", () => void (world.facts.convocationState = "cerrado")],
    ["the deadline passes", () => void (world.facts.dueOn = "2026-11-26")],
    ["the account is disabled", () => void (active = false)],
    ["the teacher role is removed", () => void (role = "coordinador")],
  ])("never calls the provider when %s before it runs", async (_case, change) => {
    script(reply("No debe llegar."))
    const id = asks("Pedido")
    change()

    await answerTeacherAssistant(id, deps())

    expect(gateway.requests).toEqual([])
    expect(answerOf(id)).toMatchObject({ state: "fallido", errorCode: "no_permitido", content: { texto: "", error: TEACHER_NOT_ALLOWED } })
    expect(world.proposals).toEqual([])
  })

  it("stops between two calls when the switch is turned off while it works", async () => {
    const steps = scriptedGateway([read("descripcion"), reply("No debe llegar.")])
    gateway = { ...steps, step: async (request) => ((enabled = false), steps.step(request)) }
    const id = asks("Pedido")

    await answerTeacherAssistant(id, deps())

    expect(gateway.requests).toHaveLength(1)
    expect(answerOf(id)).toMatchObject({ state: "fallido", errorCode: "no_permitido" })
  })

  it("stores a provider failure in Spanish, without proposals or the detail of the provider", async () => {
    const id = await ask("Pedido", read("descripcion"), new AiProviderError(BUSY, "detalle del proveedor"))

    expect(answerOf(id)).toMatchObject({ state: "fallido", errorCode: BUSY, content: { texto: "", error: "El asistente está ocupado. Inténtelo en unos minutos." } })
    expect(JSON.stringify(answerOf(id))).not.toContain("detalle del proveedor")
    expect(world.proposals).toEqual([])
  })

  it("lets an unexpected error reach the queue, which marks the job as failed", async () => {
    script(new Error("sin base"))
    const id = asks("Pedido")

    await expect(answerTeacherAssistant(id, deps())).rejects.toThrow("sin base")
    await failTeacherAssistant(id, deps())

    expect(answerOf(id)).toMatchObject({ state: "fallido", errorCode: "asistente_fallido" })
  })

  it("does nothing for an answer that is no longer open, so it never calls twice", async () => {
    const id = await ask("Pedido", reply("Primera."))
    script(reply("Segunda."))

    await answerTeacherAssistant(id, deps())

    expect(gateway.requests).toEqual([])
    expect(answerOf(id).content.texto).toBe("Primera.")
  })

  it("writes nothing when the syllabus and its conversation are removed while it works", async () => {
    const steps = scriptedGateway([reply("Tarde.")])
    gateway = { ...steps, step: async (request) => ((world.messages = []), steps.step(request)) }
    const id = asks("Pedido")

    await answerTeacherAssistant(id, deps())

    expect(world.messages).toEqual([])
    expect(world.proposals).toEqual([])
  })

  it("replaces a pending proposal only for the same target", async () => {
    await ask("Uno", read("descripcion", "objetivo_general"), reply("Dos propuestas.", proposal("descripcion", "Primera"), proposal("objetivo_general", "Otra")))
    await ask("Dos", read("descripcion"), reply("Nueva.", proposal("descripcion", "Segunda")))

    expect(world.proposals.map((item) => [item.text, item.state])).toEqual([
      ["Primera", "reemplazada"],
      ["Otra", "pendiente"],
      ["Segunda", "pendiente"],
    ])
  })

  it("marks a failed job without touching a finished answer", async () => {
    const open = asks("Pedido")
    await failTeacherAssistant(open, deps())
    expect(answerOf(open)).toMatchObject({ state: "fallido", errorCode: "asistente_fallido", content: { texto: "", error: "El asistente no está disponible por ahora. Puede seguir editando su sílabo." } })

    const done = await ask("Otro", reply("Listo."))
    await failTeacherAssistant(done, deps())
    expect(answerOf(done)).toMatchObject({ state: "completado", content: { texto: "Listo." } })
  })
})

describe("content that stops being readable never returns to the provider", () => {
  const quoting = () => ask("Resuma el objetivo", read("objetivo_general"), reply(`El objetivo dice: ${OBJECTIVE}`, proposal("objetivo_general", `Nuevo ${OBJECTIVE}`)))

  it("is sent again while the field stays readable", async () => {
    await quoting()

    await ask("Más corto", reply("Hecho."))

    expect(gateway.requests[0].messages.map((message) => message.role)).toEqual(["user", "assistant", "user"])
    expect(sent()).toContain("OBJETIVO-RESERVADO")
  })

  it("neither through earlier answers nor through earlier proposals after the permission is removed", async () => {
    await quoting()
    world.allowed.delete("objetivo_general")

    await ask("Más corto", reply("Hecho."))

    expect(gateway.requests[0].messages).toHaveLength(1)
    expect(sent()).not.toContain("OBJETIVO-RESERVADO")
  })

  it("nor through a later answer that only saw it in the conversation", async () => {
    await quoting()
    const second = await ask("Repítalo", reply(`Repito: ${OBJECTIVE}`))
    expect(answerOf(second).sentFields).toEqual([idOf("objetivo_general")])
    world.allowed.delete("objetivo_general")

    await ask("Otra cosa", reply("Hecho."))

    expect(gateway.requests[0].messages).toHaveLength(1)
    expect(sent()).not.toContain("OBJETIVO-RESERVADO")
  })

  it("keeps the turns that never saw that field", async () => {
    await ask("Describa", read("descripcion"), reply("Sobre la descripción."))
    await quoting()
    world.allowed.delete("objetivo_general")

    await ask("Siga", reply("Hecho."))

    expect(gateway.requests[0].messages.map((message) => message.content)).toContain("Sobre la descripción.")
  })

  it("sends at most the six latest completed turns and none that failed", async () => {
    for (let turn = 1; turn <= 8; turn++) await ask(`Pedido ${turn}`, reply(`Respuesta ${turn}.`))
    const failed = asks("Pedido fallido")
    await failTeacherAssistant(failed, deps())

    await ask("Final", reply("Hecho."))

    const earlier = gateway.requests[0].messages.slice(0, -1).filter((message) => message.role === "user").map((message) => message.content)
    expect(earlier).toEqual(["Pedido 3", "Pedido 4", "Pedido 5", "Pedido 6", "Pedido 7", "Pedido 8"])
  })
})

describe("conversations of two teachers", () => {
  it("never mix, also after the syllabus is reassigned", async () => {
    await ask("PEDIDO-DEL-PRIMERO", read("objetivo_general"), reply("RESPUESTA-DEL-PRIMERO", proposal("objetivo_general", "PROPUESTA-DEL-PRIMERO")))
    world.teachers.set(SYLLABUS_ID, [OTHER_TEACHER])
    script(reply("Hola."))
    const id = asks("Pedido del segundo", OTHER_TEACHER)

    await answerTeacherAssistant(id, deps())

    expect(gateway.requests[0].messages).toHaveLength(1)
    expect(sent()).not.toContain("DEL-PRIMERO")
    expect(gateway.requests[0].userTag).toBe(userTag(OTHER_TEACHER, "clave-de-prueba", "doc"))
    expect(world.proposals.map((item) => [item.userId, item.state])).toEqual([[TEACHER, "pendiente"]])
  })
})
