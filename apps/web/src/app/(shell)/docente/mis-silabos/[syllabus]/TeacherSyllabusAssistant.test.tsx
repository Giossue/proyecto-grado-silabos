import { act, fireEvent, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getTeacherSyllabus, saveTeacherField, startTeacherSyllabus, submitTeacherSyllabus, validateTeacherSyllabus, type SyllabusDetail, type SyllabusField } from "@/api/syllabi"
import { getTeacherAssistant, sendTeacherAssistantMessage, type TeacherAssistantChat, type TeacherAssistantMessage, type TeacherProposal } from "@/api/teacherAssistant"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { navigation } from "@/test/nextNavigation"
import { createTestQueryClient, flush, renderWithProviders } from "@/test/render"
import TeacherSyllabusDetailPage from "./TeacherSyllabusDetailPage"

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => ({ syllabus: "syllabus-1" }) }))
vi.mock("@/lib/unauthorized", () => ({ handleUnauthorized: vi.fn() }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/components/domain/ai/avatar/RobotAvatar", () => ({ RobotAvatar: () => <span data-robot-avatar /> }))
vi.mock("@/api/support-documents", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTeacherSupportDocuments: vi.fn(async () => ({ data: [{ id: "doc-1", title: "Guía", size: 10, view: "lista", uploaded_at: "2026-09-10T00:00:00Z" }] })),
}))
vi.mock("@/api/syllabi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/syllabi")>()),
  getTeacherSyllabus: vi.fn(),
  saveTeacherField: vi.fn(),
  startTeacherSyllabus: vi.fn(),
  submitTeacherSyllabus: vi.fn(),
  validateTeacherSyllabus: vi.fn(),
}))
vi.mock("@/api/teacherAssistant", () => ({
  getTeacherAssistant: vi.fn(),
  sendTeacherAssistantMessage: vi.fn(),
}))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const doc = (text: string): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

const field = (id: string, overrides: Partial<SyllabusField> = {}): SyllabusField => ({
  id, key: `campo_${id}`, label: `Rótulo ${id}`, quien_llena: "docente", required: true, teacher_editable: true, value: doc(`Texto de ${id}`), ...overrides,
})

const syllabus = (overrides: Partial<SyllabusDetail> = {}): SyllabusDetail => ({
  id: "syllabus-1",
  subject: "Inteligencia Artificial",
  code: "SW-01",
  convocation: "2026",
  period: "2026",
  state: "borrador",
  version_bloqueo: 2,
  iniciado_en: "2026-09-10T00:00:00Z",
  parallels: ["A"],
  teachers: ["Docente"],
  presentation: {
    appearance: { font_family: "Arial", body_font_size: 11, title_font_size: 16, section_font_size: 13, field_font_size: 11, text_color: "#172033", accent_color: "#075da9", table_header_background: "#dbe6f4", table_header_color: "#315f92", margin_cm: 2.5, orientation: "portrait", title_bold: true, title_italic: false, title_alignment: "center", section_bold: true, section_italic: false, section_alignment: "left", body_alignment: "left" },
    title: "PROGRAMA DE ASIGNATURA (SÍLABO)",
    logos: { institution: "/institution.png", faculty: "/faculty.png" },
  },
  sections: [{ id: "section-1", key: "descripcion", title: "Descripción", description: null, orientation: "portrait", fields: [field("field-1")] }],
  ...overrides,
}) as unknown as SyllabusDetail

const proposal = (overrides: Partial<TeacherProposal> = {}): TeacherProposal => ({
  id: "p-1", status: "pendiente", field_id: "field-1", field_key: "campo_field-1", field_label: "Rótulo field-1", target: "campo", space: null,
  text: "Texto propuesto", basis: "En las 4 horas de docencia y en los objetivos", ...overrides,
})

const question: TeacherAssistantMessage = { id: "q-1", role: "usuario", status: "completado", content: "Deme ideas", error: null, created_at: "2026-11-27T10:00:00Z", proposals: [] }
const answer = (overrides: Partial<TeacherAssistantMessage> = {}): TeacherAssistantMessage => ({
  id: "a-1", role: "asistente", status: "completado", content: "Revisé sus **objetivos**.", error: null, created_at: "2026-11-27T10:00:05Z", proposals: [proposal()], ...overrides,
})

type Available = Extract<TeacherAssistantChat, { available: true }>
const chat = (overrides: Partial<Available> = {}): Available => ({ available: true, limit: 20, remaining: 18, busy: false, messages: [], ...overrides })
const withProposals = (...proposals: TeacherProposal[]): Available => chat({ messages: [question, answer({ proposals })] })

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const saved = (version: number, document: DocumentNode = doc("guardado")) => ({ version_bloqueo: version, guardado_en: null, document })

const mountPage = (queryClient = createTestQueryClient()) => renderWithProviders(<TeacherSyllabusDetailPage />, { queryClient })
type Page = ReturnType<typeof mountPage>

const settle = async (rounds = 4): Promise<void> => {
  if (vi.isFakeTimers()) {
    for (let round = 0; round < rounds; round += 1) await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    return
  }
  await flush(rounds)
}

const advance = async (ms: number): Promise<void> => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  await settle()
}

const open = async (detail: SyllabusDetail = syllabus()): Promise<Page> => {
  vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
  const page = mountPage()
  await settle()
  return page
}

type Tiptap = { state: { doc: { content: { size: number } } }; commands: { insertContentAt: (position: number, content: string) => void } }
const editorElement = (id: string): HTMLElement | null => document.getElementById(`input-${id}`)
const readyEditor = (id: string): HTMLElement | null => {
  const element = editorElement(id)
  return element && (element as unknown as { editor?: Tiptap }).editor ? element : null
}
const editorShown = async (id: string): Promise<HTMLElement> =>
  readyEditor(id) ??
  waitFor(() => {
    const element = readyEditor(id)
    if (!element) throw new Error(`editor ${id} not ready`)
    return element
  })
const locked = (id: string): boolean => editorElement(id)!.getAttribute("contenteditable") === "false"
const write = async (id: string, text: string): Promise<void> => {
  const element = await editorShown(id)
  const editor = (element as unknown as { editor: Tiptap }).editor
  act(() => {
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, text)
  })
  await settle()
}
const textOf = (value: unknown): string => {
  const node = value as DocumentNode
  return node.text ?? (node.content ?? []).map(textOf).join("")
}

const toolButtons = (page: Page): HTMLButtonElement[] => [...page.container.querySelectorAll<HTMLButtonElement>('[data-tour="page-tools"] button')]
const assistantButton = (page: Page): HTMLButtonElement | undefined => page.container.querySelector<HTMLButtonElement>('[data-tour="teacher-assistant"]') ?? undefined
const pageButton = (page: Page, name: string): HTMLButtonElement | undefined =>
  [...page.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === name || button.getAttribute("aria-label") === name)
const panel = (): HTMLElement | null => document.body.querySelector<HTMLElement>('aside[aria-label="Asistente IA"]')
const panelButtons = (name: string, within: ParentNode = panel()!): HTMLButtonElement[] =>
  [...within.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent?.trim() === name)
const panelButton = (name: string, within?: ParentNode): HTMLButtonElement | undefined => panelButtons(name, within ?? panel()!)[0]
const card = (id = "p-1"): HTMLElement | null => panel()!.querySelector<HTMLElement>(`[data-proposal="${id}"]`)
const composer = (): HTMLTextAreaElement => panel()!.querySelector("textarea")!
const compose = (text: string): void => {
  fireEvent.change(composer(), { target: { value: text } })
}
const submitMessage = async (): Promise<void> => {
  fireEvent.submit(panel()!.querySelector("form")!)
  await settle(6)
}
const click = async (element: Element): Promise<void> => {
  fireEvent.click(element)
  await settle()
}
const openPanel = async (page: Page): Promise<void> => {
  await click(assistantButton(page)!)
}
const lastCall = (mock: { mock: { invocationCallOrder: number[] } }): number => mock.mock.invocationCallOrder.at(-1)!

beforeEach(() => {
  vi.useRealTimers()
  vi.mocked(getTeacherSyllabus).mockReset()
  vi.mocked(saveTeacherField).mockReset().mockResolvedValue(saved(3))
  vi.mocked(startTeacherSyllabus).mockReset()
  vi.mocked(submitTeacherSyllabus).mockReset()
  vi.mocked(validateTeacherSyllabus).mockReset()
  vi.mocked(getTeacherAssistant).mockReset().mockResolvedValue(chat())
  vi.mocked(sendTeacherAssistantMessage).mockReset().mockResolvedValue({ message: "El pedido quedó registrado.", assistant_message_id: "a-1" })
  navigation.reset("/docente/mis-silabos/syllabus-1")
  window.sessionStorage.clear()
})

describe("«Asistente IA» en el sílabo del docente: disponibilidad", () => {
  it("con el interruptor apagado la pantalla queda igual: solo consulta si está disponible y no hace nada más", async () => {
    vi.useFakeTimers()
    vi.mocked(getTeacherAssistant).mockResolvedValue({ available: false })
    const page = await open()
    await advance(60_000)

    expect(toolButtons(page).map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["Documentos de apoyo", "Vista previa"])
    expect(panel()).toBeNull()
    expect(page.container.textContent).not.toContain("Asistente")
    expect(getTeacherAssistant).toHaveBeenCalledTimes(1)
    expect(getTeacherAssistant).toHaveBeenCalledWith("syllabus-1")
    for (const other of [sendTeacherAssistantMessage, saveTeacherField]) expect(other).not.toHaveBeenCalled()
    page.unmount()
  })

  it("disponible: un botón flotante como el de Administración queda abajo a la derecha, sin abrir nada", async () => {
    const page = await open()
    const button = assistantButton(page)!

    expect(toolButtons(page).map((item) => item.getAttribute("aria-label") ?? item.textContent)).toEqual(["Documentos de apoyo", "Vista previa"])
    expect(button.textContent).toBe("Asistente")
    expect(button.querySelector("svg")).not.toBeNull()
    expect(button.className.split(" ")).toEqual(expect.arrayContaining(["fixed", "right-6", "bottom-6", "rounded-full"]))
    expect(panel()).toBeNull()
    page.unmount()
  })

  it("mientras el asistente prepara una respuesta, el botón flotante lo indica aunque esté cerrado", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(chat({ busy: true }))
    const page = await open()

    expect(assistantButton(page)!.querySelector('[role="status"]')).not.toBeNull()
    page.unmount()
  })

  it.each([
    ["en revisión", { state: "en_revision" }],
    ["aprobado", { state: "aprobado" }],
    ["sin poder editarse", { editable: false, edit_block_reason: "El periodo académico está en pausa" }],
    ["sin iniciar y bloqueado", { state: "sin_iniciar", iniciado_en: null, editable: false }],
  ] as Array<[string, Partial<SyllabusDetail>]>)("en un sílabo %s ni siquiera consulta el asistente", async (_name, overrides) => {
    const page = await open(syllabus(overrides))

    expect(getTeacherAssistant).not.toHaveBeenCalled()
    expect(assistantButton(page)).toBeUndefined()
    page.unmount()
  })

  it("en un sílabo sin iniciar consulta solo después de prepararlo", async () => {
    const preparing = deferred<{ message: string; syllabus: SyllabusDetail }>()
    vi.mocked(startTeacherSyllabus).mockReturnValue(preparing.promise)
    const page = await open(syllabus({ state: "sin_iniciar", iniciado_en: null }))

    expect(getTeacherAssistant).not.toHaveBeenCalled()
    preparing.resolve({ message: "Sílabo preparado", syllabus: syllabus({ state: "sin_iniciar" }) })
    await settle()

    expect(getTeacherAssistant).toHaveBeenCalledWith("syllabus-1")
    expect(lastCall(vi.mocked(getTeacherAssistant))).toBeGreaterThan(lastCall(vi.mocked(startTeacherSyllabus)))
    expect(assistantButton(page)).toBeDefined()
    page.unmount()
  })

  it("si la consulta de disponibilidad falla, la pantalla sigue igual y sin errores", async () => {
    vi.mocked(getTeacherAssistant).mockRejectedValue(new ApiError("This action is unauthorized", 403))
    const page = await open()

    expect(assistantButton(page)).toBeUndefined()
    expect(page.container.querySelector(".feedback.error")).toBeNull()
    expect(page.container.querySelector(".edit-blocked")).toBeNull()
    await editorShown("field-1")
    expect(locked("field-1")).toBe(false)
    page.unmount()
  })
})

describe("«Asistente IA» disponible: lo que la pantalla ya hacía sigue igual", () => {
  it("el autoguardado espera 700 ms, la vista previa guarda antes y «Enviar» pide confirmación y envía con la versión vigente", async () => {
    vi.mocked(saveTeacherField).mockReset().mockResolvedValueOnce(saved(3)).mockResolvedValueOnce(saved(4))
    vi.mocked(submitTeacherSyllabus).mockResolvedValue({ message: "Enviado", syllabus: syllabus({ state: "en_revision" }) })
    const page = await open()
    await editorShown("field-1")
    vi.useFakeTimers()
    await write("field-1", " uno")
    await advance(699)
    expect(saveTeacherField).not.toHaveBeenCalled()
    await advance(1)
    expect(saveTeacherField).toHaveBeenCalledTimes(1)
    await write("field-1", " dos")
    await click(pageButton(page, "Vista previa")!)
    expect(vi.mocked(saveTeacherField).mock.calls.map((call) => [call[2], textOf(call[3])])).toEqual([[2, "Texto de field-1 uno"], [3, "Texto de field-1 uno dos"]])
    expect(page.container.querySelector('[aria-label="Vista previa del sílabo"]')).not.toBeNull()
    vi.useRealTimers()

    await click(pageButton(page, "Enviar")!)
    expect(submitTeacherSyllabus).not.toHaveBeenCalled()
    await click([...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent?.trim() === "Enviar")!)

    expect(submitTeacherSyllabus).toHaveBeenCalledWith("syllabus-1", 4, expect.any(String), null)
    expect(assistantButton(page)).toBeUndefined()
    expect(sendTeacherAssistantMessage).not.toHaveBeenCalled()
    page.unmount()
  })
})

describe("«Asistente IA»: el panel y los pedidos", () => {
  it.each([
    ["sin conversación", false],
    ["con conversación", true],
  ])("el panel queda limpio %s: sin línea de aviso, listas ni explicaciones", async (_case, talking) => {
    if (talking) vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal()))
    const page = await open()
    await openPanel(page)

    const text = panel()!.textContent!
    for (const extra of ["puede equivocarse", "datos personales", "DeepSeek", "Qué se envía", "Se envía a", "No se envía", "Le propone textos", "discapacidad", "En qué se basa"]) {
      expect(text, extra).not.toContain(extra)
    }
    expect(panelButton("Cerrar")).toBeUndefined()
    page.unmount()
  })

  it("se abre a un lado, como el de Administración, sin tapar ni bloquear el sílabo", async () => {
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)

    expect(panel()!.className.split(" ")).toEqual(expect.arrayContaining(["fixed", "right-6", "bottom-24"]))
    expect(document.body.querySelector('[role="dialog"], [data-slot="sheet-overlay"]')).toBeNull()
    expect(page.container.closest("[aria-hidden='true'], [inert]")).toBeNull()
    expect(document.body.style.pointerEvents).toBe("")
    vi.useFakeTimers()
    await write("field-1", " a la vez")
    await advance(700)
    expect(textOf(vi.mocked(saveTeacherField).mock.calls[0]![3])).toBe("Texto de field-1 a la vez")
    expect(panel()).not.toBeNull()
    page.unmount()
  })

  it("el botón flotante abre y cierra el panel y su texto lo dice", async () => {
    const page = await open()
    const button = assistantButton(page)!
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(button.hasAttribute("aria-haspopup")).toBe(false)

    await openPanel(page)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(button.getAttribute("aria-controls")).toBe(panel()!.id)
    expect(button.textContent).toBe("Cerrar asistente")

    await click(button)
    expect(panel()).toBeNull()
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(button.hasAttribute("aria-controls")).toBe(false)
    expect(button.textContent).toBe("Asistente")
    page.unmount()
  })

  it("al abrir el panel el foco entra en él; con Escape vuelve al botón y lo escrito sin enviar se conserva", async () => {
    const page = await open()
    await openPanel(page)
    expect(panel()!.contains(document.activeElement)).toBe(true)
    compose("Borrador del pedido")
    await click(assistantButton(page)!)
    await openPanel(page)
    expect(composer().value).toBe("Borrador del pedido")

    fireEvent.keyDown(document.body, { key: "Escape" })
    await settle()
    expect(panel()).not.toBeNull()
    fireEvent.keyDown(composer(), { key: "Escape" })
    await settle()
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(assistantButton(page))
    page.unmount()
  })

  it("ofrece a lo más tres sugerencias de la etapa 1; elegir una la escribe sin enviarla", async () => {
    const page = await open()
    await openPanel(page)

    const suggestions = [...panel()!.querySelectorAll<HTMLButtonElement>("[data-suggestions] button")]
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.length).toBeLessThanOrEqual(3)
    for (const suggestion of suggestions) {
      expect(suggestion.textContent).not.toMatch(/internet|bibliotec|bibliograf|libro|tabla|enlace/i)
      expect(suggestion.querySelector("svg")).not.toBeNull()
    }
    await click(suggestions[0]!)

    expect(composer().value).toBe(suggestions[0]!.textContent)
    expect(document.activeElement).toBe(composer())
    expect(sendTeacherAssistantMessage).not.toHaveBeenCalled()
    page.unmount()
  })

  it("enviar vacío marca el campo con su mensaje y le pone el foco, sin pedir nada ni desactivar el botón", async () => {
    const page = await open()
    await openPanel(page)
    expect(panelButton("Enviar")!.disabled).toBe(false)

    await submitMessage()

    expect(panel()!.textContent).toContain("El campo pedido es obligatorio")
    expect(composer().getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(composer())
    expect(panelButton("Enviar")!.disabled).toBe(false)
    expect(sendTeacherAssistantMessage).not.toHaveBeenCalled()
    page.unmount()
  })

  it("guarda lo pendiente, envía el pedido y consulta cada 2,5 s hasta recibir la respuesta", async () => {
    const page = await open()
    await openPanel(page)
    await write("field-1", " nuevo")
    vi.useFakeTimers()
    const waiting = chat({ remaining: 17, busy: true, messages: [question, answer({ status: "pendiente", content: "", proposals: [] })] })
    vi.mocked(getTeacherAssistant).mockReset().mockResolvedValueOnce(waiting).mockResolvedValueOnce(waiting).mockResolvedValue({ ...withProposals(proposal()), remaining: 17 })

    compose("  Deme ideas  ")
    await submitMessage()

    expect(sendTeacherAssistantMessage).toHaveBeenCalledWith("syllabus-1", "Deme ideas", expect.stringMatching(UUID))
    expect(saveTeacherField).toHaveBeenCalledTimes(1)
    expect(textOf(vi.mocked(saveTeacherField).mock.calls[0]![3])).toBe("Texto de field-1 nuevo")
    expect(lastCall(vi.mocked(saveTeacherField))).toBeLessThan(lastCall(vi.mocked(sendTeacherAssistantMessage)))
    expect(composer().value).toBe("")
    expect(panel()!.textContent).toContain("Preparando la respuesta")
    expect(panel()!.textContent).toContain("Le quedan 17 pedidos hoy")
    expect(panel()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)

    const before = vi.mocked(getTeacherAssistant).mock.calls.length
    await advance(2500)
    expect(vi.mocked(getTeacherAssistant).mock.calls.length).toBe(before + 1)
    await advance(2500)
    expect(vi.mocked(getTeacherAssistant).mock.calls.length).toBe(before + 2)
    expect(card()!.textContent).toContain("Texto propuesto")
    expect(panel()!.textContent).not.toContain("Preparando la respuesta")
    await advance(20_000)
    expect(vi.mocked(getTeacherAssistant).mock.calls.length).toBe(before + 2)
    expect(panelButton("Enviar")!.disabled).toBe(false)
    page.unmount()
  })

  it("si mientras espera el servidor deja de permitir el asistente, deja de consultar y lo dice", async () => {
    const waiting = chat({ busy: true, messages: [question, answer({ status: "pendiente", content: "", proposals: [] })] })
    vi.useFakeTimers()
    vi.mocked(getTeacherAssistant).mockResolvedValueOnce(waiting).mockResolvedValueOnce(waiting).mockRejectedValue(new ApiError("This action is unauthorized", 403))
    const page = await open()
    await openPanel(page)
    expect(panel()!.textContent).toContain("Preparando la respuesta")
    await advance(2500)
    const calls = vi.mocked(getTeacherAssistant).mock.calls.length
    await advance(60_000)

    expect(vi.mocked(getTeacherAssistant).mock.calls.length).toBe(calls)
    expect(panel()!.textContent).toContain("El asistente no está disponible por ahora")
    expect(panel()!.textContent).not.toContain("Preparando la respuesta")
    expect(page.container.querySelector(".edit-blocked")).toBeNull()
    expect(assistantButton(page)!.textContent).toBe("Cerrar asistente")
    await click(assistantButton(page)!)
    expect(panel()).toBeNull()
    expect(assistantButton(page)).toBeUndefined()
    page.unmount()
  })

  it("una respuesta fallida se intenta de nuevo con el mismo pedido y una clave nueva cada vez", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(chat({ messages: [question, answer({ status: "fallido", content: "", error: "El asistente está ocupado. Inténtelo en unos minutos.", proposals: [] })] }))
    const page = await open()
    await openPanel(page)
    compose("Lo que estoy escribiendo")

    expect(panel()!.textContent).toContain("El asistente está ocupado. Inténtelo en unos minutos")
    await click(panelButton("Intentar de nuevo")!)
    await settle()
    await click(panelButton("Intentar de nuevo")!)
    await settle()

    const calls = vi.mocked(sendTeacherAssistantMessage).mock.calls
    expect(calls.map((call) => call.slice(0, 2))).toEqual([["syllabus-1", "Deme ideas"], ["syllabus-1", "Deme ideas"]])
    expect(calls[0]![2]).toMatch(UUID)
    expect(calls[1]![2]).toMatch(UUID)
    expect(calls[1]![2]).not.toBe(calls[0]![2])
    expect(composer().value).toBe("Lo que estoy escribiendo")
    page.unmount()
  })

  it("solo la última respuesta fallida ofrece intentar de nuevo", async () => {
    const failed = answer({ id: "a-0", status: "fallido", content: "", error: "No respondió", proposals: [] })
    vi.mocked(getTeacherAssistant).mockResolvedValue(chat({ messages: [question, failed, { ...question, id: "q-2" }, answer()] }))
    const page = await open()
    await openPanel(page)

    expect(panel()!.textContent).toContain("No respondió")
    expect(panelButton("Intentar de nuevo")).toBeUndefined()
    page.unmount()
  })

  it("sin pedidos disponibles dice el motivo en lugar de ofrecer botones para pedir", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(chat({ remaining: 0, messages: [question, answer({ status: "fallido", content: "", error: "No respondió", proposals: [] })] }))
    const page = await open()
    await openPanel(page)

    expect(panel()!.textContent).toContain("Llegó al límite de 20 pedidos de hoy al asistente. Podrá pedir otra vez mañana")
    expect(panel()!.querySelector("textarea")).toBeNull()
    expect(panelButton("Enviar")).toBeUndefined()
    expect(panelButton("Intentar de nuevo")).toBeUndefined()
    page.unmount()
  })

  it.each([
    ["el límite", new ApiError("Llegó al límite", 429, { limit: ["Llegó al límite de 20 pedidos de hoy al asistente. Podrá pedir otra vez mañana."] }), "Llegó al límite de 20 pedidos"],
    ["un pedido abierto", new ApiError("Datos no válidos", 422, { busy: ["Espere a que el asistente termine la respuesta anterior."] }), "Espere a que el asistente termine la respuesta anterior"],
    ["el proveedor", new ApiError("El asistente no está disponible por ahora. Puede seguir editando su sílabo.", 503), "Puede seguir editando su sílabo"],
    ["la red", new TypeError("Failed to fetch"), "No se pudo enviar el pedido"],
  ])("si el envío falla por %s, dice por qué, conserva lo escrito y el siguiente intento usa otra clave", async (_name, failure, shown) => {
    vi.mocked(sendTeacherAssistantMessage).mockRejectedValue(failure)
    const page = await open()
    await openPanel(page)
    compose("Deme ideas")
    await submitMessage()

    expect(panel()!.querySelector('[role="alert"]')!.textContent).toContain(shown)
    expect(composer().value).toBe("Deme ideas")
    await submitMessage()
    const keys = vi.mocked(sendTeacherAssistantMessage).mock.calls.map((call) => call[2])
    expect(keys).toHaveLength(2)
    expect(keys[1]).not.toBe(keys[0])
    page.unmount()
  })

  it.each([
    ["un fallo interno", new ApiError("Server Error", 500), "No se pudo enviar el pedido"],
    ["un sílabo que ya no existe", new ApiError("No query results for model [Syllabus] syllabus-1", 404), "Recargue la página"],
  ])("ante %s no muestra el texto técnico del servidor al enviar", async (_name, failure, shown) => {
    vi.mocked(sendTeacherAssistantMessage).mockRejectedValue(failure)
    const page = await open()
    await openPanel(page)
    compose("Deme ideas")
    await submitMessage()

    expect(panel()!.querySelector('[role="alert"]')!.textContent).toContain(shown)
    expect(panel()!.textContent).not.toMatch(/Server Error|No query results/)
    page.unmount()
  })

  it("un pedido rechazado por su texto marca el campo", async () => {
    vi.mocked(sendTeacherAssistantMessage).mockRejectedValue(new ApiError("Datos no válidos", 422, { message: ["El campo pedido no debe ser mayor que 4000 caracteres."] }))
    const page = await open()
    await openPanel(page)
    compose("Deme ideas")
    await submitMessage()

    expect(composer().getAttribute("aria-invalid")).toBe("true")
    expect(panel()!.textContent).toContain("no debe ser mayor que 4000 caracteres")
    page.unmount()
  })

  it("si el interruptor se apaga con el panel abierto, lo dice y quita el botón", async () => {
    vi.mocked(sendTeacherAssistantMessage).mockRejectedValue(new ApiError("Datos no válidos", 422, { assistant: ["El asistente no está disponible por ahora."] }))
    const page = await open()
    await openPanel(page)
    vi.mocked(getTeacherAssistant).mockResolvedValue({ available: false })
    compose("Deme ideas")
    await submitMessage()

    expect(panel()!.textContent).toContain("El asistente no está disponible por ahora")
    expect(panel()!.querySelector("textarea")).toBeNull()
    await click(assistantButton(page)!)
    expect(panel()).toBeNull()
    expect(assistantButton(page)).toBeUndefined()
    page.unmount()
  })

  it("si el servidor ya no permite editar al enviar, cierra el panel y el sílabo dice por qué", async () => {
    vi.mocked(sendTeacherAssistantMessage).mockRejectedValue(new ApiError("This action is unauthorized", 403))
    const page = await open()
    await openPanel(page)
    compose("Deme ideas")
    await submitMessage()

    expect(panel()).toBeNull()
    expect(page.container.querySelector(".edit-blocked")!.textContent).toContain("El periodo académico está en pausa")
    expect(assistantButton(page)).toBeUndefined()
    page.unmount()
  })
})

describe("«Asistente IA»: las propuestas", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()
  const useClipboard = (): void => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  }
  const removeClipboard = (): void => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })
  }
  const copyButton = (id = "p-1"): HTMLButtonElement => card(id)!.querySelector("button")!
  const announced = (id = "p-1"): string => card(id)!.querySelector('[role="status"]')!.textContent!

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    useClipboard()
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard")
  })

  it("cada propuesta dice su campo y su texto, siempre como texto, y solo ofrece «Copiar»", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(
      proposal({ text: "<img src=x onerror=alert(1)>\n- Primer punto" }),
      proposal({ id: "p-2", target: "espacio", space: 2, field_label: "Evaluación" }),
    ))
    const page = await open()
    await openPanel(page)

    expect(panel()!.querySelector("strong")!.textContent).toBe("objetivos")
    expect(card()!.textContent).toContain("Propuesta para el campo")
    expect(card()!.textContent).toContain("Rótulo field-1")
    expect(card()!.textContent).toContain("<img src=x onerror=alert(1)>\n- Primer punto")
    expect(card("p-2")!.textContent).toContain("Propuesta para el espacio 2 del campo")
    expect(card("p-2")!.textContent).toContain("Evaluación")
    expect(panel()!.querySelector("img")).toBeNull()
    for (const id of ["p-1", "p-2"]) {
      expect([...card(id)!.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Copiar"])
      expect(copyButton(id).querySelector("svg")).not.toBeNull()
      for (const gone of ["En qué se basa", "En las 4 horas", "Reemplaza todo", "Llena el espacio"]) {
        expect(card(id)!.textContent, gone).not.toContain(gone)
      }
    }
    page.unmount()
  })

  it("«Copiar» lleva al portapapeles el texto exacto, lo confirma un momento y no toca el sílabo", async () => {
    const text = "Primera línea\n- Segunda\n\nCuarta"
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ text }), proposal({ id: "p-2" })))
    const page = await open()
    await openPanel(page)
    vi.useFakeTimers()
    expect(announced()).toBe("")

    await click(copyButton())
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text)
    expect(copyButton().textContent).toBe("Copiado")
    expect(copyButton().disabled).toBe(false)
    expect(announced()).toBe("Texto copiado")
    expect(copyButton("p-2").textContent).toBe("Copiar")

    await advance(2_000)
    expect(copyButton().textContent).toBe("Copiar")
    expect(announced()).toBe("")
    expect(saveTeacherField).not.toHaveBeenCalled()
    expect(sendTeacherAssistantMessage).not.toHaveBeenCalled()
    page.unmount()
  })

  it.each([
    ["el navegador niega el permiso", () => writeText.mockRejectedValue(new Error("NotAllowedError"))],
    ["el navegador no ofrece portapapeles", removeClipboard],
  ])("si no se puede copiar porque %s, lo dice y se puede intentar otra vez", async (_case, arrange) => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal()))
    const page = await open()
    await openPanel(page)
    arrange()
    await click(copyButton())

    expect(card()!.querySelector('[role="alert"]')!.textContent).toBe("No se pudo copiar. Seleccione el texto y cópielo a mano")
    expect(copyButton().textContent).toBe("Copiar")
    expect(copyButton().disabled).toBe(false)

    useClipboard()
    writeText.mockResolvedValue(undefined)
    await click(copyButton())
    expect(card()!.querySelector('[role="alert"]')).toBeNull()
    expect(copyButton().textContent).toBe("Copiado")
    page.unmount()
  })

  it("una propuesta reemplazada lo dice y no ofrece copiarla", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(
      proposal({ status: "reemplazada", field_label: "Evaluación" }),
      proposal({ id: "p-2" }),
    ))
    const page = await open()
    await openPanel(page)

    expect(card()!.textContent).toContain("«Evaluación» se reemplazó por una más nueva")
    expect(card()!.querySelectorAll("button")).toHaveLength(0)
    expect(copyButton("p-2").textContent).toBe("Copiar")
    page.unmount()
  })
})
