import { act, fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getTeacherSyllabus, saveTeacherField, startTeacherSyllabus, submitTeacherSyllabus, validateTeacherSyllabus, type SyllabusDetail, type SyllabusField } from "@/api/syllabi"
import { acceptTeacherProposal, discardTeacherProposal, getTeacherAssistant, sendTeacherAssistantMessage, type TeacherAssistantChat, type TeacherAssistantMessage, type TeacherProposal } from "@/api/teacherAssistant"
import { SyllabusDocumentPreview } from "@/components/domain/syllabus/SyllabusDocumentPreview"
import { handleUnauthorized } from "@/lib/unauthorized"
import { toast } from "@/lib/toast"
import { teacherAssistantKeys } from "@/queries/teacherAssistant"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { navigation } from "@/test/nextNavigation"
import { createTestQueryClient, flush, renderWithProviders } from "@/test/render"
import TeacherSyllabusDetailPage from "./TeacherSyllabusDetailPage"

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => ({ syllabus: "syllabus-1" }) }))
vi.mock("@/lib/unauthorized", () => ({ handleUnauthorized: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/components/domain/ai/avatar/RobotAvatar", () => ({ RobotAvatar: () => <span data-robot-avatar /> }))
vi.mock("@/components/domain/syllabus/SyllabusDocumentPreview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/domain/syllabus/SyllabusDocumentPreview")>()
  return { ...actual, SyllabusDocumentPreview: vi.fn(actual.SyllabusDocumentPreview) }
})
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
  acceptTeacherProposal: vi.fn(),
  discardTeacherProposal: vi.fn(),
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

const twoFields = (): SyllabusDetail => {
  const detail = syllabus()
  detail.sections[0]!.fields = [field("field-1"), field("field-3")]
  return detail
}

const twoSections = (): SyllabusDetail => {
  const detail = syllabus()
  detail.sections.push({ id: "section-2", key: "metodologia", title: "Metodología", description: null, orientation: "portrait", fields: [field("field-2")] })
  return detail
}

const proposal = (overrides: Partial<TeacherProposal> = {}): TeacherProposal => ({
  id: "p-1", status: "pendiente", field_id: "field-1", field_key: "campo_field-1", field_label: "Rótulo field-1", target: "campo", space: null,
  text: "Texto propuesto", basis: "En las 4 horas de docencia y en los objetivos", usable: true, blocked_reason: null, ...overrides,
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

const accepted = (value: DocumentNode, fieldId = "field-1", version = 2) => ({ message: "Propuesta colocada en el campo.", field_id: fieldId, value, version_bloqueo: version })
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
const assistantButton = (page: Page): HTMLButtonElement | undefined => toolButtons(page).find((button) => button.getAttribute("aria-label") === "Asistente IA")
const pageButton = (page: Page, name: string): HTMLButtonElement | undefined =>
  [...page.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === name || button.getAttribute("aria-label") === name)
const panel = (): HTMLElement | null =>
  [...document.body.querySelectorAll<HTMLElement>('[role="dialog"]')].find((dialog) => dialog.querySelector('[data-slot="sheet-title"]')?.textContent === "Asistente IA") ?? null
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
const openTab = async (page: Page, title: string): Promise<void> => {
  const tab = [...page.container.querySelectorAll('[role="tab"]')].find((candidate) => candidate.textContent?.includes(title))!
  fireEvent.mouseDown(tab, { button: 0 })
  await settle()
}
const lastCall = (mock: { mock: { invocationCallOrder: number[] } }): number => mock.mock.invocationCallOrder.at(-1)!
const previewValue = () => vi.mocked(SyllabusDocumentPreview).mock.lastCall![0].sections[0]!.fields[0]!

beforeEach(() => {
  vi.useRealTimers()
  vi.mocked(getTeacherSyllabus).mockReset()
  vi.mocked(saveTeacherField).mockReset().mockResolvedValue(saved(3))
  vi.mocked(startTeacherSyllabus).mockReset()
  vi.mocked(submitTeacherSyllabus).mockReset()
  vi.mocked(validateTeacherSyllabus).mockReset()
  vi.mocked(getTeacherAssistant).mockReset().mockResolvedValue(chat())
  vi.mocked(sendTeacherAssistantMessage).mockReset().mockResolvedValue({ message: "El pedido quedó registrado.", assistant_message_id: "a-1" })
  vi.mocked(acceptTeacherProposal).mockReset().mockResolvedValue(accepted(doc("Texto propuesto")))
  vi.mocked(discardTeacherProposal).mockReset().mockResolvedValue({ message: "Propuesta descartada." })
  vi.mocked(handleUnauthorized).mockReset()
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(SyllabusDocumentPreview).mockClear()
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
    for (const other of [sendTeacherAssistantMessage, acceptTeacherProposal, discardTeacherProposal, saveTeacherField]) expect(other).not.toHaveBeenCalled()
    page.unmount()
  })

  it("disponible: un botón con icono y texto queda junto a «Vista previa», sin abrir nada", async () => {
    const page = await open()

    expect(toolButtons(page).map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["Documentos de apoyo", "Vista previa", "Asistente IA"])
    expect(assistantButton(page)!.textContent).toBe("Asistente IA")
    expect(assistantButton(page)!.querySelector("svg")).not.toBeNull()
    expect(panel()).toBeNull()
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

  it("mientras carga reserva el botón del asistente solo si ya sabe que está disponible", async () => {
    vi.mocked(getTeacherSyllabus).mockReturnValue(new Promise(() => undefined))
    const placeholders = (page: Page) => page.container.querySelector('[data-skeleton="page-actions"]')!.children.length
    const unknown = mountPage()
    await settle()
    expect(placeholders(unknown)).toBe(2)
    unknown.unmount()

    const client = createTestQueryClient()
    client.setQueryData(teacherAssistantKeys.chat("syllabus-1"), chat())
    const known = mountPage(client)
    await settle()
    expect(placeholders(known)).toBe(3)
    known.unmount()
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
    for (const other of [sendTeacherAssistantMessage, acceptTeacherProposal, discardTeacherProposal]) expect(other).not.toHaveBeenCalled()
    page.unmount()
  })
})

describe("«Asistente IA»: el panel, el aviso y los pedidos", () => {
  it("avisa que usa IA, qué se envía y qué no, y pide no escribir datos personales", async () => {
    const page = await open()
    await openPanel(page)

    const text = panel()!.textContent
    for (const part of [
      "inteligencia artificial (DeepSeek)", "revíselas antes de usarlas", "No escriba datos personales",
      "Lo que usted escribe aquí", "El nombre de la asignatura, sus horas, créditos y semanas",
      "campos que usted puede editar y que Administración permite leer",
      "estudiantes con discapacidad", "Los nombres y correos de la identificación",
      "no reconoce los nombres escritos dentro de un texto",
    ]) expect(text, part).toContain(part)
    expect(panelButton("Cerrar")!.querySelector("svg")).not.toBeNull()
    page.unmount()
  })

  it("con conversación el detalle del aviso queda recogido y siempre se puede volver a abrir", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal()))
    const page = await open()
    await openPanel(page)

    expect(panel()!.textContent).toContain("inteligencia artificial (DeepSeek)")
    expect(panel()!.textContent).toContain("No escriba datos personales")
    expect(panel()!.textContent).not.toContain("estudiantes con discapacidad")
    const toggle = panelButton("Qué se envía")!
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    await click(toggle)

    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(panel()!.textContent).toContain("estudiantes con discapacidad")
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
    expect(panelButton("Enviar pedido")!.disabled).toBe(false)

    await submitMessage()

    expect(panel()!.textContent).toContain("El campo pedido es obligatorio")
    expect(composer().getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(composer())
    expect(panelButton("Enviar pedido")!.disabled).toBe(false)
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
    expect(panelButton("Enviar pedido")!.disabled).toBe(false)
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
    expect(assistantButton(page)).toBeUndefined()
    expect(page.container.querySelector(".edit-blocked")).toBeNull()
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
    expect(panelButton("Enviar pedido")).toBeUndefined()
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
    await click(panelButton("Cerrar")!)
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
  it("cada propuesta dice su campo, el texto, en qué se basó y ofrece «Usar» y «Descartar», siempre como texto", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(
      proposal({ text: "<img src=x onerror=alert(1)>\n- Primer punto", basis: "<b>En los objetivos</b>" }),
      proposal({ id: "p-2", target: "espacio", space: 2, field_label: "Evaluación" }),
    ))
    const page = await open()
    await openPanel(page)

    expect(panel()!.querySelector("strong")!.textContent).toBe("objetivos")
    expect(card()!.textContent).toContain("Rótulo field-1")
    expect(card()!.textContent).toContain("<img src=x onerror=alert(1)>\n- Primer punto")
    expect(card()!.textContent).toContain("En qué se basa: <b>En los objetivos</b>")
    expect(card()!.textContent).toContain("Reemplaza todo el texto del campo")
    expect(card("p-2")!.textContent).toContain("Evaluación")
    expect(card("p-2")!.textContent).toContain("Llena el espacio 2 del campo")
    expect(panel()!.querySelector("img, b")).toBeNull()
    for (const name of ["Usar", "Descartar"]) expect(panelButton(name, card()!)!.querySelector("svg")).not.toBeNull()
    page.unmount()
  })

  it("una propuesta que no se puede usar muestra el motivo, sin botones desactivados", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ usable: false, blocked_reason: "Ese texto cambió desde que se hizo la propuesta. Pida una nueva." })))
    const page = await open()
    await openPanel(page)

    expect(card()!.textContent).toContain("Ese texto cambió desde que se hizo la propuesta. Pida una nueva")
    expect(panelButton("Usar", card()!)).toBeUndefined()
    expect(panelButton("Descartar", card()!)).toBeDefined()
    expect(card()!.querySelectorAll("button:disabled")).toHaveLength(0)
    page.unmount()
  })

  it("una propuesta ya usada no se presenta como error; la reemplazada lo dice y la descartada no aparece", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(
      proposal({ status: "aceptada", usable: false, blocked_reason: "Ese texto cambió desde que se hizo la propuesta. Pida una nueva." }),
      proposal({ id: "p-2", status: "reemplazada", usable: false, field_label: "Evaluación" }),
      proposal({ id: "p-3", status: "descartada", usable: false, text: "Texto descartado" }),
      proposal({ id: "p-4", status: "aceptada", usable: true }),
    ))
    const page = await open()
    await openPanel(page)

    expect(card()!.textContent).toContain("Usada")
    expect(card()!.textContent).not.toContain("Ese texto cambió")
    expect(card()!.querySelector('[role="alert"]')).toBeNull()
    expect(panelButton("Usar", card()!)).toBeUndefined()
    expect(panelButton("Descartar", card()!)).toBeUndefined()
    expect(panelButton("Ver en el campo", card()!)).toBeDefined()
    expect(card("p-2")!.textContent).toContain("«Evaluación» se reemplazó por una más nueva")
    expect(card("p-2")!.querySelectorAll("button")).toHaveLength(0)
    expect(card("p-3")).toBeNull()
    expect(panel()!.textContent).not.toContain("Texto descartado")
    expect(panelButton("Usar", card("p-4")!)).toBeDefined()
    expect(panelButton("Descartar", card("p-4")!)).toBeUndefined()
    page.unmount()
  })

  it("«Descartar» quita la propuesta sin tocar el sílabo y solo se desactiva mientras se envía", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal()))
    const discarding = deferred<{ message: string }>()
    vi.mocked(discardTeacherProposal).mockReturnValue(discarding.promise)
    const page = await open()
    await openPanel(page)

    await click(panelButton("Descartar", card()!)!)
    expect(panelButton("Usar", card()!)!.disabled).toBe(true)
    expect(panelButton("Descartar", card()!)!.disabled).toBe(true)
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ status: "descartada", usable: false })))
    discarding.resolve({ message: "Propuesta descartada." })
    await settle()

    expect(discardTeacherProposal).toHaveBeenCalledWith("syllabus-1", "p-1")
    expect(card()).toBeNull()
    expect(acceptTeacherProposal).not.toHaveBeenCalled()
    expect(saveTeacherField).not.toHaveBeenCalled()
    page.unmount()
  })

  it.each([
    ["Usar", new ApiError("Server Error", 500), "No se pudo usar la propuesta"],
    ["Usar", new ApiError("No query results for model [TeacherAssistantProposal] p-1", 404), "Esa propuesta ya no existe"],
    ["Descartar", new ApiError("Server Error", 500), "No se pudo descartar la propuesta"],
    ["Descartar", new ApiError("No query results for model [TeacherAssistantProposal] p-1", 404), "Esa propuesta ya no existe"],
  ])("«%s» no muestra el texto técnico del servidor: %s", async (action, failure, shown) => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal()))
    vi.mocked(acceptTeacherProposal).mockRejectedValue(failure)
    vi.mocked(discardTeacherProposal).mockRejectedValue(failure)
    const page = await open()
    await openPanel(page)
    await click(panelButton(action, card()!)!)

    expect(card()!.querySelector('[role="alert"]')!.textContent).toContain(shown)
    expect(panel()!.textContent).not.toMatch(/Server Error|No query results/)
    expect(saveTeacherField).not.toHaveBeenCalled()
    page.unmount()
  })

  it("si no se puede descartar, dice por qué", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal()))
    vi.mocked(discardTeacherProposal).mockRejectedValue(new ApiError("Datos no válidos", 422, { proposal: ["Esta propuesta ya no está pendiente."] }))
    const page = await open()
    await openPanel(page)
    await click(panelButton("Descartar", card()!)!)

    expect(card()!.querySelector('[role="alert"]')!.textContent).toContain("Esta propuesta ya no está pendiente")
    expect(panelButton("Descartar", card()!)!.disabled).toBe(false)
    page.unmount()
  })
})

describe("«Asistente IA»: «Usar» sin perder lo escrito", () => {
  beforeEach(() => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal()))
  })

  it("guarda lo pendiente, bloquea el campo, acepta con la versión vigente, lo muestra, lo guarda y recién entonces refresca el asistente", async () => {
    const firstSave = deferred<ReturnType<typeof saved>>()
    const secondSave = deferred<ReturnType<typeof saved>>()
    const accepting = deferred<ReturnType<typeof accepted>>()
    vi.mocked(saveTeacherField).mockReset().mockReturnValueOnce(firstSave.promise).mockReturnValueOnce(secondSave.promise)
    vi.mocked(acceptTeacherProposal).mockReturnValue(accepting.promise)
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)
    await write("field-1", " tecleado")

    await click(panelButton("Usar", card()!)!)
    expect(locked("field-1")).toBe(true)
    expect(saveTeacherField).toHaveBeenCalledTimes(1)
    expect(textOf(vi.mocked(saveTeacherField).mock.calls[0]![3])).toBe("Texto de field-1 tecleado")
    expect(acceptTeacherProposal).not.toHaveBeenCalled()
    expect(panelButton("Usar", card()!)!.disabled).toBe(true)

    firstSave.resolve(saved(3))
    await settle()
    expect(acceptTeacherProposal).toHaveBeenCalledWith("syllabus-1", "p-1", 3)
    expect(locked("field-1")).toBe(true)
    expect(editorElement("field-1")!.textContent).toBe("Texto de field-1 tecleado")

    const consultations = vi.mocked(getTeacherAssistant).mock.calls.length
    const value = doc("Texto propuesto")
    accepting.resolve(accepted(value, "field-1", 3))
    await settle()
    await waitFor(() => expect(editorElement("field-1")!.textContent).toBe("Texto propuesto"))
    expect(locked("field-1")).toBe(false)
    expect(saveTeacherField).toHaveBeenCalledTimes(2)
    expect(saveTeacherField).toHaveBeenLastCalledWith("syllabus-1", "field-1", 3, value)
    expect(vi.mocked(getTeacherAssistant).mock.calls.length).toBe(consultations)

    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ status: "aceptada", usable: false, blocked_reason: "Ese texto cambió desde que se hizo la propuesta. Pida una nueva." })))
    secondSave.resolve(saved(4, value))
    await settle()

    expect(vi.mocked(getTeacherAssistant).mock.calls.length).toBe(consultations + 1)
    expect(card()!.textContent).toContain("Colocada en el campo")
    expect(card()!.textContent).not.toContain("Ese texto cambió")
    expect(panelButton("Usar", card()!)).toBeUndefined()
    expect(submitTeacherSyllabus).not.toHaveBeenCalled()
    expect(validateTeacherSyllabus).not.toHaveBeenCalled()
    expect(saveTeacherField).toHaveBeenCalledTimes(2)
    page.unmount()
  })

  it("lo que se escribe después de usarla se guarda con el autoguardado de siempre", async () => {
    vi.mocked(saveTeacherField).mockReset().mockResolvedValueOnce(saved(3)).mockResolvedValueOnce(saved(4))
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)
    await waitFor(() => expect(editorElement("field-1")!.textContent).toBe("Texto propuesto"))
    await write("field-1", " y editado")

    await waitFor(() => expect(saveTeacherField).toHaveBeenCalledTimes(2), { timeout: 2000 })
    const [, fieldId, version, value] = vi.mocked(saveTeacherField).mock.calls[1]!
    expect([fieldId, version, textOf(value)]).toEqual(["field-1", 3, "Texto propuesto y editado"])
    page.unmount()
  })

  it("nunca usa el valor aceptado como documento: la vista previa recibe el que devuelve el guardado", async () => {
    const detail = syllabus()
    detail.sections[0]!.fields = [field("field-1", { document: doc("Documento anterior") })]
    const saving = deferred<ReturnType<typeof saved>>()
    vi.mocked(saveTeacherField).mockReset().mockReturnValue(saving.promise)
    const page = await open(detail)
    await click(pageButton(page, "Vista previa")!)
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)

    expect(previewValue().value).toEqual(doc("Texto propuesto"))
    expect(previewValue().document).toEqual(doc("Documento anterior"))
    saving.resolve(saved(3, doc("Documento resuelto")))
    await settle()
    expect(previewValue().document).toEqual(doc("Documento resuelto"))
    page.unmount()
  })

  it.each([
    ["un error del guardado", new ApiError("Error temporal", 500), "Error temporal"],
    ["un conflicto de versión", new ApiError("El borrador cambió", 409), "otra sesión"],
  ])("si lo pendiente no se puede guardar por %s, no acepta nada, conserva lo escrito y dice por qué", async (_name, failure, shown) => {
    vi.mocked(saveTeacherField).mockReset().mockRejectedValue(failure)
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)
    await write("field-1", " tecleado")
    await click(panelButton("Usar", card()!)!)

    expect(acceptTeacherProposal).not.toHaveBeenCalled()
    expect(editorElement("field-1")!.textContent).toBe("Texto de field-1 tecleado")
    const alert = card()!.querySelector('[role="alert"]')!.textContent
    expect(alert).toContain("No se colocó la propuesta")
    expect(alert).toContain(shown)
    expect(pageButton(page, "Reintentar")).toBeDefined()
    for (const call of vi.mocked(saveTeacherField).mock.calls) expect(textOf(call[3])).toBe("Texto de field-1 tecleado")
    page.unmount()
  })

  it("un conflicto al aceptar no cambia nada y deja el aviso de conflicto de siempre", async () => {
    vi.mocked(acceptTeacherProposal).mockRejectedValue(new ApiError("El borrador cambió en otra sesión", 409, {}, { code: "conflicto_version_borrador", version_bloqueo_actual: 9 }))
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)

    expect(editorElement("field-1")!.textContent).toBe("Texto de field-1")
    expect(saveTeacherField).not.toHaveBeenCalled()
    expect(page.container.querySelector(".feedback.error")!.textContent).toContain("otra sesión")
    expect(page.container.querySelector(".feedback.error button")!.textContent).toBe("Recargar borrador")
    expect(card()!.querySelector('[role="alert"]')!.textContent).toContain("«Recargar borrador»")
    page.unmount()
  })

  it("si el servidor no acepta la propuesta, no cambia nada y muestra el motivo una sola vez", async () => {
    const reason = "Ese texto cambió desde que se hizo la propuesta. Pida una nueva."
    vi.mocked(acceptTeacherProposal).mockRejectedValue(new ApiError("Datos no válidos", 422, { proposal: [reason] }))
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ usable: false, blocked_reason: reason })))
    await click(panelButton("Usar", card()!)!)

    expect(card()!.textContent.split("Ese texto cambió").length - 1).toBe(1)
    expect(editorElement("field-1")!.textContent).toBe("Texto de field-1")
    expect(locked("field-1")).toBe(false)
    expect(saveTeacherField).not.toHaveBeenCalled()
    expect(page.container.querySelector(".feedback.error")).toBeNull()
    page.unmount()
  })

  it("si el servidor ya no permite editar, no coloca nada y el sílabo dice por qué", async () => {
    vi.mocked(acceptTeacherProposal).mockRejectedValue(new ApiError("This action is unauthorized", 403))
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)

    expect(panel()).toBeNull()
    expect(page.container.querySelector(".edit-blocked")!.textContent).toContain("El periodo académico está en pausa")
    expect(editorElement("field-1")!.textContent).toBe("Texto de field-1")
    expect(saveTeacherField).not.toHaveBeenCalled()
    page.unmount()
  })

  it("con la sesión caducada al aceptar, lleva al inicio de sesión sin cambiar nada", async () => {
    vi.mocked(acceptTeacherProposal).mockRejectedValue(new ApiError("No autenticado", 401))
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)

    expect(handleUnauthorized).toHaveBeenCalled()
    expect(saveTeacherField).not.toHaveBeenCalled()
    expect(editorElement("field-1")!.textContent).toBe("Texto de field-1")
    page.unmount()
  })

  it("una propuesta para un campo que no está en la pantalla no se acepta", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ field_id: "field-9" })))
    const page = await open()
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)

    expect(acceptTeacherProposal).not.toHaveBeenCalled()
    expect(card()!.querySelector('[role="alert"]')!.textContent).toContain("Recargue la página")
    page.unmount()
  })

  it("si se coloca pero no se puede guardar, lo dice y queda para reintentar", async () => {
    vi.mocked(saveTeacherField).mockReset().mockRejectedValueOnce(new ApiError("Error temporal", 500)).mockResolvedValueOnce(saved(3))
    const page = await open()
    await editorShown("field-1")
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)

    await waitFor(() => expect(editorElement("field-1")!.textContent).toBe("Texto propuesto"))
    const alert = card()!.querySelector('[role="alert"]')!.textContent
    expect(alert).toContain("pero no se pudo guardar")
    expect(alert).toContain("Error temporal")
    await click(panelButton("Cerrar")!)
    await click(pageButton(page, "Reintentar")!)
    expect(saveTeacherField).toHaveBeenLastCalledWith("syllabus-1", "field-1", 2, doc("Texto propuesto"))
    page.unmount()
  })

  it("mientras acepta, lo escrito en otro campo se guarda después y nunca a la vez", async () => {
    const accepting = deferred<ReturnType<typeof accepted>>()
    vi.mocked(acceptTeacherProposal).mockReturnValue(accepting.promise)
    vi.mocked(saveTeacherField).mockReset().mockResolvedValueOnce(saved(3)).mockResolvedValueOnce(saved(4))
    const page = await open(twoFields())
    await editorShown("field-3")
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)
    expect(locked("field-1")).toBe(true)
    expect(locked("field-3")).toBe(false)

    vi.useFakeTimers()
    await write("field-3", " mientras tanto")
    await advance(5000)
    expect(saveTeacherField).not.toHaveBeenCalled()

    accepting.resolve(accepted(doc("Texto propuesto")))
    await settle(8)
    await advance(700)

    expect(vi.mocked(saveTeacherField).mock.calls.map(([, id, version]) => [id, version])).toEqual([["field-3", 2], ["field-1", 3]])
    expect(textOf(vi.mocked(saveTeacherField).mock.calls[0]![3])).toBe("Texto de field-3 mientras tanto")
    expect(textOf(vi.mocked(saveTeacherField).mock.calls[1]![3])).toBe("Texto propuesto")
    expect(lastCall(vi.mocked(acceptTeacherProposal))).toBeLessThan(vi.mocked(saveTeacherField).mock.invocationCallOrder[0]!)
    expect(card()!.querySelector('[role="alert"]')).toBeNull()
    page.unmount()
  })

  it("«Enviar» y «Usar» de otra propuesta esperan mientras se coloca una", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal(), proposal({ id: "p-2" })))
    const accepting = deferred<ReturnType<typeof accepted>>()
    vi.mocked(acceptTeacherProposal).mockReturnValue(accepting.promise)
    const page = await open()
    await openPanel(page)
    expect(pageButton(page, "Enviar")!.disabled).toBe(false)
    await click(panelButton("Usar", card()!)!)

    expect(pageButton(page, "Enviar")!.disabled).toBe(true)
    expect(panelButton("Usar", card("p-2")!)!.disabled).toBe(true)
    accepting.resolve(accepted(doc("Texto propuesto")))
    await settle()

    expect(pageButton(page, "Enviar")!.disabled).toBe(false)
    expect(panelButton("Usar", card("p-2")!)!.disabled).toBe(false)
    expect(acceptTeacherProposal).toHaveBeenCalledTimes(1)
    expect(submitTeacherSyllabus).not.toHaveBeenCalled()
    page.unmount()
  })

  it("salir mientras se coloca espera a que quede guardada", async () => {
    const accepting = deferred<ReturnType<typeof accepted>>()
    vi.mocked(acceptTeacherProposal).mockReturnValue(accepting.promise)
    const page = await open()
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)
    await click(panelButton("Cerrar")!)

    const unload = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await click(pageButton(page, "Volver a mis sílabos")!)
    expect(navigation.back).not.toHaveBeenCalled()
    expect(navigation.push).not.toHaveBeenCalled()

    accepting.resolve(accepted(doc("Texto propuesto")))
    await settle(8)

    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-1", 2, doc("Texto propuesto"))
    expect(navigation.back.mock.calls.length + navigation.push.mock.calls.length).toBe(1)
    expect(toast.success).toHaveBeenCalledWith("Propuesta colocada en «Rótulo field-1»")
    page.unmount()
  })

  it("si se cierra el panel antes de un rechazo, el motivo se avisa igual", async () => {
    const accepting = deferred<ReturnType<typeof accepted>>()
    vi.mocked(acceptTeacherProposal).mockReturnValue(accepting.promise)
    const page = await open()
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)
    await click(panelButton("Cerrar")!)
    accepting.reject(new ApiError("Datos no válidos", 422, { proposal: ["Esta propuesta ya no está pendiente."] }))
    await settle()

    expect(toast.error).toHaveBeenCalledWith("Esta propuesta ya no está pendiente")
    expect(saveTeacherField).not.toHaveBeenCalled()
    page.unmount()
  })

  it("si el campo está en una sección que nunca se abrió, su editor muestra el texto nuevo al abrirla", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ field_id: "field-2" })))
    vi.mocked(acceptTeacherProposal).mockResolvedValue(accepted(doc("Método propuesto"), "field-2"))
    const page = await open(twoSections())
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)

    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-2", 2, doc("Método propuesto"))
    await click(panelButton("Cerrar")!)
    await openTab(page, "Metodología")
    await waitFor(() => expect(editorElement("field-2")!.textContent).toBe("Método propuesto"))
    page.unmount()
  })

  it("si la sección ya se había abierto, al volver muestra el texto nuevo", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ field_id: "field-2" })))
    vi.mocked(acceptTeacherProposal).mockResolvedValue(accepted(doc("Método propuesto"), "field-2"))
    const page = await open(twoSections())
    await openTab(page, "Metodología")
    await editorShown("field-2")
    await openTab(page, "Descripción")
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)
    await click(panelButton("Cerrar")!)
    await openTab(page, "Metodología")

    await waitFor(() => expect(editorElement("field-2")!.textContent).toBe("Método propuesto"))
    expect(saveTeacherField).toHaveBeenCalledTimes(1)
    page.unmount()
  })

  it("un editor de texto propio, con sus tablas protegidas, también muestra una propuesta en lista", async () => {
    const detail = syllabus()
    detail.sections[0]!.fields = [field("field-1", { teacher_edits: true } as Partial<SyllabusField>)]
    const value: DocumentNode = { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Primer punto" }] }] }] }] }
    vi.mocked(acceptTeacherProposal).mockResolvedValue(accepted(value))
    const page = await open(detail)
    await editorShown("field-1")
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)

    await waitFor(() => expect(editorElement("field-1")!.querySelector("ul li")!.textContent).toBe("Primer punto"))
    expect(saveTeacherField).toHaveBeenCalledTimes(1)
    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-1", 2, value)
    page.unmount()
  })

  it("en un espacio del campo, el texto aparece en ese espacio, se bloquea mientras se coloca y se guarda el documento completo", async () => {
    const space = (answerText: string | null): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Se evaluará con " }, { type: "response", attrs: { kind: "texto", options: [], value: answerText, id: "r1" } }] }] })
    const detail = syllabus()
    detail.sections[0]!.fields = [field("field-1", { template: space(null), value: space("rúbricas") })]
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ target: "espacio", space: 1, text: "portafolios" })))
    const accepting = deferred<ReturnType<typeof accepted>>()
    vi.mocked(acceptTeacherProposal).mockReturnValue(accepting.promise)
    const page = await open(detail)
    const answerBox = () => page.container.querySelector<HTMLTextAreaElement>("#field-field-1 textarea")!
    await openPanel(page)
    await click(panelButton("Usar", card()!)!)
    expect(answerBox().disabled).toBe(true)

    accepting.resolve(accepted(space("portafolios")))
    await settle()

    expect(answerBox().value).toBe("portafolios")
    expect(answerBox().disabled).toBe(false)
    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-1", 2, space("portafolios"))
    page.unmount()
  })

  it("«Ver en el campo» cierra el panel y abre la sección del campo, también desde la vista previa", async () => {
    vi.mocked(getTeacherAssistant).mockResolvedValue(withProposals(proposal({ status: "aceptada", usable: false, field_id: "field-2" })))
    const page = await open(twoSections())
    await click(pageButton(page, "Vista previa")!)
    await openPanel(page)
    await click(panelButton("Ver en el campo", card()!)!)

    await waitFor(() => expect(page.container.querySelector("#field-field-2")).not.toBeNull())
    expect(panel()).toBeNull()
    expect(pageButton(page, "Vista previa")!.getAttribute("aria-pressed")).toBe("false")
    await waitFor(() => expect(document.activeElement!.closest("#field-field-2")).not.toBeNull())
    page.unmount()
  })

  it("al cerrar el panel, el foco vuelve al botón y lo escrito sin enviar se conserva", async () => {
    const page = await open()
    assistantButton(page)!.focus()
    await openPanel(page)
    compose("Borrador del pedido")
    await click(panelButton("Cerrar")!)
    await waitFor(() => expect(document.activeElement).toBe(assistantButton(page)))
    await openPanel(page)

    expect(composer().value).toBe("Borrador del pedido")
    fireEvent.keyDown(composer(), { key: "Escape" })
    await settle()
    expect(panel()).toBeNull()
    page.unmount()
  })
})
