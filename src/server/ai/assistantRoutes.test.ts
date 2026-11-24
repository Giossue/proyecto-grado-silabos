// @vitest-environment node
import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import type { FakeWorld } from "../auth/testing"
import { makeAssignment } from "../auth/testing"
import { AssistantDraft, type AssistantSection } from "./assistantDraft"
import { answerTemplateAssistant, failTemplateAssistant, type AnswerDeps } from "./answerJob"
import { applyProposal, clearAssistant, discardProposal, showAssistant, showProposal, storeAssistantMessage, type AssistantRouteDeps } from "./assistantRoutes"
import type { AiConfig } from "./config"
import { AiProviderError, NO_BALANCE } from "./gateway"
import { templateSystemPrompt } from "./knowledge"
import { SAME_AS_PENDING, TemplateAssistant } from "./templateAssistant"
import {
  assistantRequest,
  assistantWorld,
  bridgeFor,
  call,
  fakeAssistantStore,
  resetCallSequence,
  scriptedGateway,
  sessionWorld,
  testConfig,
  type AssistantWorld,
  type ScriptedGateway,
} from "./testing"

let sessions: FakeWorld
let world: AssistantWorld
let config: AiConfig
let gateway: ScriptedGateway
let ids: number

beforeEach(() => {
  sessions = sessionWorld()
  world = assistantWorld()
  config = testConfig()
  gateway = scriptedGateway([])
  ids = 0
  resetCallSequence()
})

function uuid7(): string {
  ids++
  return `01a1c5ba-${String(ids).padStart(4, "0")}-7000-8000-000000000000`
}

function answerDeps(): AnswerDeps {
  const store = fakeAssistantStore(world)
  return {
    store,
    assistant: () => new TemplateAssistant({ gateway, config, system: templateSystemPrompt, processState: () => store.processState() }),
    appKey: () => "base64:" + Buffer.alloc(32, 7).toString("base64"),
    now: () => 1_800_000_000,
    newProposalId: uuid7,
  }
}

function deps(): AssistantRouteDeps {
  return {
    bridge: bridgeFor(sessions),
    store: fakeAssistantStore(world),
    config: () => config,
    newQuestionId: uuid7,
    newAnswerId: randomUUID,
    dispatchAnswer: async (messageId) => {
      try {
        await answerTemplateAssistant(messageId, answerDeps())
      } catch (error) {
        await failTemplateAssistant(messageId, answerDeps())
        throw error
      }
    },
  }
}

function script(steps: Parameters<typeof scriptedGateway>[0]): ScriptedGateway {
  gateway = scriptedGateway(steps)
  return gateway
}

const addField = (name: string) => call("agregar_campo", { seccion: "resultados", nombre: name, quien_llena: "carrera", contenido_html: "<p></p>", despues_de: "(final)" })

function draft(): AssistantSection[] {
  return JSON.parse(JSON.stringify(AssistantDraft.fromTemplate(world.template as never).payload().sections)) as AssistantSection[]
}

async function ask(message: string, key: string | null = null, sections: unknown[] | null = null, version = "sesion-1:1"): Promise<Response> {
  return storeAssistantMessage(assistantRequest("POST", "/messages", { message, idempotency_key: key ?? randomUUID(), draft: sections ?? draft(), draft_version: version }), deps())
}

async function chat(): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await showAssistant(assistantRequest("GET", ""), deps())
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

type ChatMessage = { id: string; role: string; status: string; result: unknown; content: string; error: unknown; proposal: { id: string; status: string; changes: string[]; draft_version: string } | null }

function messages(body: Record<string, unknown>): ChatMessage[] {
  return body.messages as ChatMessage[]
}

const apply = (id: string) => applyProposal(assistantRequest("POST", `/proposals/${id}/apply`), id, deps())
const discard = (id: string) => discardProposal(assistantRequest("POST", `/proposals/${id}/discard`), id, deps())

describe("template assistant API", () => {
  it("marks only the assistant changes over the editor draft and sends them to the editor", async () => {
    script([addField("Competencias"), call("responder", { mensaje: "Propongo **Competencias**." })])
    const sections = draft()
    sections[1].fields.push({ key: "sin_guardar", label: "Sin guardar", quien_llena: "carrera", content: { type: "doc", content: [{ type: "paragraph" }] }, max_length: 400 })

    expect((await ask("Agrega Competencias", null, sections, "sesion-1:7")).status).toBe(202)

    const { status, body } = await chat()
    expect(status).toBe(200)
    expect(body.available).toBe(true)
    const [question, answer] = messages(body)
    expect(messages(body)).toHaveLength(2)
    expect(question.content).toBe("Agrega Competencias")
    expect(answer.result).toBe("propuesta")
    expect(answer.content).toBe("Propongo **Competencias**.")
    expect(answer.proposal?.status).toBe("pendiente")
    expect(answer.proposal?.draft_version).toBe("sesion-1:7")
    expect(answer.proposal?.changes).toEqual(["Nuevo campo «Competencias» en «4. Resultados de aprendizaje»."])
    const proposalId = answer.proposal?.id as string

    const shown = (await (await showProposal(assistantRequest("GET", `/proposals/${proposalId}`), proposalId, deps())).json()) as Record<string, unknown>
    const shownSections = shown.sections as AssistantSection[]
    expect(shown.draft_version).toBe("sesion-1:7")
    expect(shown.changed).toEqual({ sections: [], fields: ["competencias"] })
    expect(shownSections[1].fields[1].key).toBe("sin_guardar")
    expect(shownSections[1].fields[1].max_length).toBe(400)
    expect(shownSections[3].fields[1].key).toBe("competencias")

    expect((await apply(proposalId)).status).toBe(200)

    expect(world.proposals.find((proposal) => proposal.id === proposalId)?.state).toBe("aplicada")
    expect(AssistantDraft.fromTemplate(world.template as never).overview().flatMap((section) => section.campos as { clave: string }[]).some((field) => field.clave === "competencias")).toBe(false)
    expect(world.audits.map((event) => [event.action, event.resourceType])).toEqual([
      ["ia.plantilla_solicitada", "mensaje_ia_plantilla"],
      ["plantilla.propuesta_ia_aplicada", "propuesta_ia_plantilla"],
    ])
    const again = await apply(proposalId)
    expect(again.status).toBe(422)
    expect(Object.keys(((await again.json()) as { errors: Record<string, unknown> }).errors)).toEqual(["proposal"])
  })

  it("cannot apply a discarded proposal", async () => {
    script([addField("Competencias"), call("responder", { mensaje: "Listo." })])
    await ask("Agrega Competencias")
    const proposal = world.proposals[0]

    expect((await discard(proposal.id)).status).toBe(200)

    expect(world.proposals[0].state).toBe("descartada")
    expect(world.audits.map((event) => event.action)).toContain("plantilla.propuesta_ia_descartada")
    expect((await apply(proposal.id)).status).toBe(422)
  })

  it("does not let problems already in the draft block the proposal", async () => {
    script([addField("Competencias"), call("responder", { mensaje: "Listo." })])
    const sections = draft()
    sections.push({ key: "a_medias", title: "A medias", orientation: "portrait", fields: [] })

    await ask("Agrega Competencias", null, sections)

    const opening = gateway.requests[0].messages[gateway.requests[0].messages.length - 1].content ?? ""
    expect(opening).toContain("El borrador ya tenía estos problemas")
    expect(opening).toContain("«A medias» no tiene campos")
    expect(world.proposals[0].changes.lista).toEqual(["Nuevo campo «Competencias» en «4. Resultados de aprendizaje»."])
  })

  it("rejects an unreadable draft", async () => {
    const sections = draft() as unknown as { fields: { content: unknown }[] }[]
    sections[0].fields[0].content = { type: "nada" }

    const response = await ask("Hola", null, sections)

    expect(response.status).toBe(422)
    expect(Object.keys(((await response.json()) as { errors: Record<string, unknown> }).errors)).toContain("draft.0.fields.0.content")
    expect(world.messages).toHaveLength(0)
  })

  it("takes one request at a time and ignores repeated keys", async () => {
    script([call("responder", { mensaje: "Hola." })])
    const key = randomUUID()

    const first = (await (await ask("Hola", key)).json()) as { assistant_message_id: string }
    const repeated = await ask("Hola", key)
    expect(repeated.status).toBe(202)
    expect(((await repeated.json()) as { assistant_message_id: string }).assistant_message_id).toBe(first.assistant_message_id)
    expect(world.messages).toHaveLength(2)

    world.messages = world.messages.map((message) => (message.id === first.assistant_message_id ? { ...message, content: { ...message.content, estado: "pendiente" } } : message))
    const busy = await ask("Otra cosa")
    expect(busy.status).toBe(422)
    expect(((await busy.json()) as { errors: { message: string[] } }).errors.message[0]).toBe("Espere a que el asistente termine la respuesta anterior.")
    expect((await clearAssistant(assistantRequest("DELETE", ""), deps())).status).toBe(422)
  })

  it("replaces the pending proposal with a new one that starts from the draft", async () => {
    script([
      addField("Competencias"),
      call("responder", { mensaje: "Primera." }),
      call("cambiar_orientacion_seccion", { clave: "resultados", orientacion: "horizontal" }),
      call("responder", { mensaje: "Segunda." }),
    ])
    await ask("Agrega Competencias")

    await ask("Ponla en horizontal")

    const messagesSent = gateway.requests[2].messages
    expect(messagesSent[messagesSent.length - 1].content).toContain("Las propuestas anteriores que no aplicó no están en el borrador")
    expect(messagesSent.map((message) => message.role)).toEqual(["user", "assistant", "user"])
    expect(world.proposals.map((proposal) => proposal.state)).toEqual(["reemplazada", "pendiente"])
    expect(world.proposals[1].changes.lista).toEqual(["La sección «4. Resultados de aprendizaje» pasa a horizontal."])
  })

  it("asks to apply a pending proposal instead of repeating it", async () => {
    script([
      addField("Competencias"),
      call("responder", { mensaje: "Propongo Competencias." }),
      addField("Competencias"),
      call("responder", { mensaje: "Propuesta lista otra vez." }),
    ])
    await ask("Agrega Competencias")

    await ask("si eso")

    const messagesSent = gateway.requests[2].messages
    expect(messagesSent[messagesSent.length - 1].content).toContain("Su última propuesta sigue pendiente")
    expect(world.proposals.map((proposal) => proposal.state)).toEqual(["pendiente"])
    const listed = messages((await chat()).body)
    expect(listed[3].result).toBe("respuesta")
    expect(listed[3].content).toBe(SAME_AS_PENDING)
    expect(listed[3].proposal).toBeNull()
    expect(listed[1].proposal?.status).toBe("pendiente")
  })

  it("hides the previous messages from the screen and the model with a new chat", async () => {
    script([call("responder", { mensaje: "Uno." }), call("responder", { mensaje: "Dos." })])
    await ask("Primero")

    expect((await clearAssistant(assistantRequest("DELETE", ""), deps())).status).toBe(200)
    expect(messages((await chat()).body)).toHaveLength(0)
    await ask("Segundo")

    expect(gateway.requests[1].messages).toHaveLength(1)
  })

  it("leaves a simple message when the provider fails", async () => {
    script([new AiProviderError(NO_BALANCE, "Sin saldo.")])

    await ask("Hola")

    const answer = messages((await chat()).body)[1]
    expect(answer.status).toBe("fallido")
    expect(answer.error).toBe("El asistente no está disponible por ahora. Puede seguir editando la plantilla.")
    expect(answer.proposal).toBeNull()
  })

  it("rejects requests when the assistant is not configured", async () => {
    config = testConfig({ driver: "disabled" })

    expect((await chat()).body.available).toBe(false)
    const response = await ask("Hola")
    expect(response.status).toBe(422)
    expect(Object.keys(((await response.json()) as { errors: Record<string, unknown> }).errors)).toEqual(["message"])
  })

  it("lets only the administrator reach the assistant", async () => {
    script([addField("Competencias"), call("responder", { mensaje: "Listo." })])
    await ask("Agrega Competencias")
    const proposal = world.proposals[0]

    sessions.assignments = [makeAssignment({ role: "coordinador" })]

    expect((await chat()).status).toBe(403)
    expect((await ask("Hola")).status).toBe(403)
    expect((await apply(proposal.id)).status).toBe(403)
  })

  it("carries the repeatable tables the assistant created to the editor", async () => {
    script([
      call("crear_tabla_repetible", {
        titulo: "Prácticas",
        fila: "práctica",
        minimo: 1,
        maximo: 5,
        al_empezar: 1,
        columnas: [{ nombre: "Tema", tipo: "texto", obligatoria: true, opciones: [] }],
      }),
      call("agregar_campo", { seccion: "descripcion", nombre: "Prácticas", quien_llena: "carrera", contenido_html: '<div data-block="tabla_practicas"></div>', despues_de: "(final)" }),
      call("responder", { mensaje: "Listo." }),
    ])

    expect((await ask("Agrega una tabla de prácticas")).status).toBe(202)
    const proposalId = messages((await chat()).body)[1].proposal?.id as string

    const shown = (await (await showProposal(assistantRequest("GET", `/proposals/${proposalId}`), proposalId, deps())).json()) as { block_changes: Record<string, { label: string }> }
    expect(shown.block_changes.tabla_practicas.label).toBe("Prácticas")
  })
})
