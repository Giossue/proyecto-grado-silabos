import { act, fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { copyTeacherSyllabus, getTeacherSigningStatement, getTeacherSyllabus, saveTeacherField, startTeacherSyllabus, submitTeacherSyllabus, validateTeacherSyllabus, type SyllabusDetail, type SyllabusField } from "@/api/syllabi"
import { PageFrame } from "@/components/domain/PageFrame"
import { SyllabusDocumentPreview } from "@/components/domain/syllabus/SyllabusDocumentPreview"
import { SYLLABUS_PREVIEW_KEY } from "@/components/domain/syllabus/syllabusPreview"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { makeTestP12 } from "@/lib/signature/testCertificate"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { handleUnauthorized } from "@/lib/unauthorized"
import definition from "@silabos/shared/test/fixtures/template-definition.json"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import { confirmSignatureDialog, fillSignatureDialog } from "@/test/signatureDialog"
import type { StoredResponsible } from "@/types/configuration"
import TeacherSyllabusDetailPage from "./TeacherSyllabusDetailPage"

type EditorProps = { id: string; value?: DocumentNode | null; disabled?: boolean; onValueChange?: (value: DocumentNode) => void }

const route = vi.hoisted(() => ({ params: { syllabus: "syllabus-1" } as Record<string, string> }))
const editors = vi.hoisted(() => ({ props: new Map<string, EditorProps>() }))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => route.params }))
vi.mock("@/lib/unauthorized", () => ({ handleUnauthorized: vi.fn() }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/teacherAssistant", () => ({ getTeacherAssistant: vi.fn(async () => ({ available: false })), sendTeacherAssistantMessage: vi.fn(), acceptTeacherProposal: vi.fn(), discardTeacherProposal: vi.fn() }))
vi.mock("@/components/domain/RoleDeadlineBanner", () => ({ RoleDeadlineBanner: () => <div data-testid="role-deadline-banner" /> }))
vi.mock("@/components/domain/syllabus/FreeTextEditor", () => ({
  FreeTextEditor: function FreeTextEditorStub(props: EditorProps) {
    editors.props.set(props.id, props)
    return <div id={props.id} data-free-text-editor="" />
  },
}))
vi.mock("@/components/domain/syllabus/SyllabusDocumentPreview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/domain/syllabus/SyllabusDocumentPreview")>()
  return { ...actual, SyllabusDocumentPreview: vi.fn(actual.SyllabusDocumentPreview) }
})
vi.mock("@/components/domain/PageFrame", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/domain/PageFrame")>()
  return { ...actual, PageFrame: vi.fn(actual.PageFrame) }
})
vi.mock("@/api/support-documents", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTeacherSupportDocuments: vi.fn(async () => ({ data: [{ id: "doc-1", title: "Guía", size: 10, view: "lista", uploaded_at: "2026-09-10T00:00:00Z" }] })),
}))
vi.mock("@/api/syllabi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/syllabi")>()),
  copyTeacherSyllabus: vi.fn(),
  getTeacherSigningStatement: vi.fn(),
  getTeacherSyllabus: vi.fn(),
  saveTeacherField: vi.fn(),
  startTeacherSyllabus: vi.fn(),
  submitTeacherSyllabus: vi.fn(),
  validateTeacherSyllabus: vi.fn(),
}))

const appearance = {
  font_family: "Arial",
  body_font_size: 11,
  title_font_size: 16,
  section_font_size: 13,
  field_font_size: 11,
  text_color: "#172033",
  accent_color: "#075da9",
  table_header_background: "#dbe6f4",
  table_header_color: "#315f92",
  margin_cm: 2.5,
  orientation: "portrait",
  title_bold: true,
  title_italic: false,
  title_alignment: "center",
  section_bold: true,
  section_italic: false,
  section_alignment: "left",
  body_alignment: "left",
}

const doc = (text: string): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
const field = (id: string, quien_llena: StoredResponsible = "docente", overrides: Partial<SyllabusField> = {}): SyllabusField => ({
  id, key: `campo_${id}`, label: "Contenido", quien_llena,
  required: true, teacher_editable: quien_llena === "docente" || quien_llena === "carrera", value: doc("Texto enviado"), ...overrides,
})

const syllabus = (state: "borrador" | "en_revision" | "correccion_solicitada" | "aprobado", quien_llena: StoredResponsible = "docente"): SyllabusDetail => ({
  id: "syllabus-1",
  subject: "Inteligencia Artificial",
  code: "SW-01",
  convocation: "2026",
  period: "2026",
  state,
  version_bloqueo: 2,
  iniciado_en: "2026-09-10T00:00:00Z",
  parallels: ["A"],
  teachers: ["Docente"],
  presentation: {
    appearance,
    title: "PROGRAMA DE ASIGNATURA (SÍLABO)",
    logos: { institution: "/institution.png", faculty: "/faculty.png" },
  },
  sections: [{
    id: "section-1",
    key: "descripcion",
    title: "Descripción",
    description: null,
    orientation: "portrait",
    fields: [field("field-1", quien_llena, { key: "contenido" })],
  }],
}) as unknown as SyllabusDetail

const mountPage = () => renderWithProviders(<TeacherSyllabusDetailPage />)
type Page = ReturnType<typeof mountPage>

const settle = async (): Promise<void> => {
  if (vi.isFakeTimers()) {
    for (let round = 0; round < 3; round += 1) await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    return
  }
  await flush()
}

const advance = async (ms: number): Promise<void> => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

const editorIds = (page: Page): string[] => [...page.container.querySelectorAll("[data-free-text-editor]")].map((element) => element.id)

const typeText = async (page: Page, text: string, index = 0): Promise<void> => {
  const id = editorIds(page)[index]!
  act(() => editors.props.get(id)!.onValueChange!(doc(text)))
  await settle()
}

const emitDocument = (page: Page, value: DocumentNode, index = 0): void => {
  const id = editorIds(page)[index]!
  act(() => editors.props.get(id)!.onValueChange!(value))
}

const buttonNamed = (page: Page, name: string): HTMLButtonElement | undefined =>
  [...page.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(name) || button.getAttribute("aria-label") === name)

const click = async (element: Element): Promise<void> => {
  fireEvent.click(element)
  await settle()
}

const dialogButton = (name: string): HTMLButtonElement | undefined =>
  [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent?.trim() === name)

const preview = (page: Page): HTMLElement | null => page.container.querySelector('[role="region"][aria-label="Vista previa del sílabo"]')

const previewSections = () => vi.mocked(SyllabusDocumentPreview).mock.lastCall![0].sections

const leaveThroughLink = (): void => {
  const link = document.createElement("a")
  link.href = "/docente/mis-silabos"
  link.textContent = "Mis sílabos"
  document.body.append(link)
  fireEvent.click(link)
  link.remove()
}

const simulateExitAnimation = (): void => {
  const style = document.createElement("style")
  style.dataset.exit = ""
  style.textContent = '[data-state="closed"] { animation-name: exit; }'
  document.head.append(style)
}

const openTab = async (page: Page, title: string): Promise<void> => {
  const tab = [...page.container.querySelectorAll('[role="tab"]')].find((candidate) => candidate.textContent?.includes(title))!
  fireEvent.mouseDown(tab, { button: 0 })
  await settle()
}

describe("TeacherSyllabusDetailPage", () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.mocked(copyTeacherSyllabus).mockReset()
    vi.mocked(getTeacherSyllabus).mockReset()
    vi.mocked(getTeacherSigningStatement).mockReset()
    vi.mocked(startTeacherSyllabus).mockReset()
    vi.mocked(saveTeacherField).mockReset()
    vi.mocked(submitTeacherSyllabus).mockReset()
    vi.mocked(validateTeacherSyllabus).mockReset()
    vi.mocked(handleUnauthorized).mockReset()
    vi.mocked(SyllabusDocumentPreview).mockClear()
    vi.mocked(PageFrame).mockClear()
    editors.props.clear()
    navigation.reset("/docente/mis-silabos/syllabus-1")
    window.sessionStorage.clear()
    document.head.querySelectorAll("style[data-exit]").forEach((style) => style.remove())
  })

  it("presenta como documento de solo lectura una revisión enviada", async () => {
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("en_revision") })
    const page = mountPage()
    await flush()

    expect(preview(page)!.textContent).toContain("PROGRAMA")
    expect(preview(page)!.textContent).toContain("Texto enviado")
    expect(editorIds(page)).toHaveLength(0)
  })

  it("«Vista previa» muestra la hoja, queda presionado y al pulsarlo otra vez vuelve al formulario", async () => {
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador", "docente") })
    const page = mountPage()
    await flush()
    expect(preview(page)).toBeNull()
    expect(buttonNamed(page, "Vista previa")!.textContent).toBe("Vista previa")

    await click(buttonNamed(page, "Vista previa")!)
    expect(preview(page)).not.toBeNull()
    expect(page.container.querySelector("#field-field-1")).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(buttonNamed(page, "Vista previa")!.getAttribute("aria-pressed")).toBe("true")

    await click(buttonNamed(page, "Vista previa")!)
    expect(buttonNamed(page, "Vista previa")!.getAttribute("aria-pressed")).toBe("false")
    expect(preview(page)).toBeNull()
    expect(page.container.querySelector("#field-field-1")).not.toBeNull()
    page.unmount()
  })

  it("«Vista previa» guarda lo pendiente y muestra lo último que se escribió", async () => {
    const detail = syllabus("borrador", "docente")
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    vi.mocked(saveTeacherField).mockResolvedValue({ version_bloqueo: 3, guardado_en: null, document: doc("Texto nuevo") })
    const page = mountPage()
    await flush()

    emitDocument(page, doc("Texto nuevo"))
    await click(buttonNamed(page, "Vista previa")!)

    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-1", 2, doc("Texto nuevo"))
    expect(previewSections()[0]!.fields[0]!.document).toEqual(doc("Texto nuevo"))
    page.unmount()
  })

  it("lo oculto por «Mostrar solo si» no sale en la vista previa y conserva lo escrito", async () => {
    const detail = syllabus("borrador", "docente")
    const choice = (value: string | null): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Sí" }, { const: "o2", title: "No" }], value, id: "usa_lab" } }] }] })
    detail.sections[0]!.fields = [
      field("field-0", "institucional", { key: "pregunta", value: choice("o2"), document: choice("o2") }),
      field("field-1", "docente", { key: "contenido" }),
      field("field-2", "docente", { key: "tecnicas", value: doc("Prácticas guiadas"), document: doc("Prácticas guiadas"), show_if: { response: "usa_lab", options: ["o1"] } }),
    ]
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    vi.mocked(saveTeacherField).mockResolvedValue({ version_bloqueo: 3, guardado_en: null, document: doc("Texto nuevo") })
    const page = mountPage()
    await flush()
    expect(page.container.querySelector("#field-field-2")).toBeNull()

    emitDocument(page, doc("Texto nuevo"))
    await click(buttonNamed(page, "Vista previa")!)

    expect(previewSections()[0]!.fields.map((item) => item.id)).toEqual(["field-0", "field-1"])
    expect(detail.sections[0]!.fields[2]!.value).toEqual(doc("Prácticas guiadas"))
    page.unmount()
  })

  it("el campo de texto se escribe con su editor y se guarda como documento", async () => {
    vi.useFakeTimers()
    const detail = syllabus("borrador", "docente")
    detail.sections[0]!.fields[0]!.value = null
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    vi.mocked(saveTeacherField).mockResolvedValue({ version_bloqueo: 3, guardado_en: null, document: doc("") })
    const page = mountPage()
    await settle()

    expect(editorIds(page)).toHaveLength(1)
    const document = { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Semana 1" }] }] }] }] }
    emitDocument(page, document)
    await advance(700)
    await settle()

    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-1", 2, document)
    page.unmount()
  })

  it("guarda tablas libres y totales escritos sin calcularlos", async () => {
    vi.useFakeTimers()
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(saveTeacherField).mockResolvedValue({ version_bloqueo: 3, guardado_en: null, document: doc("") })
    const page = mountPage()
    await settle()
    const document = { type: "doc", content: [{ type: "table", content: ["Semana adicional", "999"].map((text) => ({ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }] })) }] }
    emitDocument(page, document)
    await advance(700)
    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-1", 2, document)
    page.unmount()
  })

  it("un campo Carrera sin espacios para el docente es de solo lectura", async () => {
    const detail = syllabus("borrador", "carrera")
    detail.sections[0]!.fields[0]!.teacher_editable = false
    detail.sections[0]!.fields.push(field("field-2", "carrera", { label: "Bibliografía" }))
    detail.sections[0]!.fields.push(field("field-3", "carrera", { label: "Herramientas TIC", teacher_editable: true }))
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()
    const locked = page.container.querySelector("#field-field-1")!.closest("[data-field-key]")!
    expect(locked.querySelector('[data-locked-field="field-1"]')!.lastElementChild!.textContent).toBe("Bloqueado")
    expect(locked.textContent).not.toMatch(/lo completa|Carrera/)
    expect(editorIds(page)).toEqual(["input-field-2", "input-field-3"])
    expect(page.container.textContent).not.toContain("Viene del proyecto de carrera")
    page.unmount()
  })

  it("los campos del docente se ven siempre abiertos, sin acordeones", async () => {
    const detail = syllabus("borrador", "docente")
    detail.sections[0]!.fields.push(field("field-2", "docente", { label: "Bibliografía" }))
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()

    expect(page.container.querySelectorAll('.teacher-form [data-slot="accordion-item"], .teacher-form [data-slot="accordion-trigger"]')).toHaveLength(0)
    expect(page.container.querySelectorAll(".teacher-form [data-field-key]")).toHaveLength(2)
    expect(editorIds(page)).toEqual(["input-field-1", "input-field-2"])
    page.unmount()
  })

  it("un campo sin nombre en la plantilla se muestra sin título, sin repetir el de la sección", async () => {
    const detail = syllabus("borrador", "docente")
    detail.sections[0]!.fields = [field("field-1", "docente", { label: "" })]
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()

    const item = page.container.querySelector("[data-field-key]")!
    expect(item.querySelector("h3")).toBeNull()
    expect(item.querySelector("#input-field-1")).not.toBeNull()
    page.unmount()
  })

  it("una sección sin campos del docente se ve con sus campos bloqueados y no cuenta como faltante", async () => {
    const detail = syllabus("borrador", "institucional")
    detail.sections[0]!.fields[0]!.value = doc("Software")
    detail.sections[0]!.fields[0]!.document = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "FACULTAD: Ciencias" }] }] }] }] }] }
    detail.sections[0]!.fields.push(field("field-2", "institucional", { key: "conducta", label: "Conducta ética", value: doc("Texto institucional") }))
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()

    expect(editorIds(page)).toHaveLength(0)
    expect(page.container.querySelector("#field-field-2")!.textContent).toContain("Texto institucional")
    const locked = page.container.querySelector('[data-locked-field="field-2"]')!
    expect(locked.textContent).toContain("Texto institucional")
    expect(locked.lastElementChild!.textContent).toBe("Bloqueado")
    expect(locked.lastElementChild!.querySelector("svg")).not.toBeNull()
    expect(page.container.textContent).not.toMatch(/lo completa|Institucional|Carrera/)
    expect(buttonNamed(page, "Enviar")!.disabled).toBe(false)
  })

  it("una sección bloqueada se abre desde su pestaña y muestra sus campos", async () => {
    const detail = syllabus("borrador")
    detail.sections.push({
      id: "section-ethics",
      key: "conducta",
      title: "Conducta ética",
      description: null,
      orientation: "portrait",
      fields: [field("ethics-field", "institucional", { key: "conducta_etica", label: "Conducta", value: doc("Texto institucional") })],
    })
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()

    const tab = [...page.container.querySelectorAll('[role="tab"]')].find((item) => item.textContent === "Conducta ética")!
    await act(async () => {
      fireEvent.mouseDown(tab, { button: 0 })
    })
    expect(page.container.querySelector('[data-locked-field="ethics-field"]')!.textContent).toContain("Bloqueado")
    expect(page.container.querySelector("#field-ethics-field")!.textContent).toContain("Texto institucional")
    page.unmount()
  })

  it("al reenviar sin cambios desde la corrección, la confirmación lo advierte sin impedir el envío", async () => {
    vi.useFakeTimers()
    const detail = { ...syllabus("correccion_solicitada"), unchanged_since_correction: true }
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    vi.mocked(saveTeacherField).mockResolvedValue({ version_bloqueo: 3, guardado_en: null, document: doc("") })
    const page = mountPage()
    await settle()

    await click(buttonNamed(page, "Enviar")!)
    expect(document.body.textContent).toContain("No ha cambiado nada desde que pidieron la corrección")
    expect(dialogButton("Enviar")!.disabled).toBe(false)
    page.unmount()

    const edited = mountPage()
    await settle()
    await typeText(edited, "Arreglo pedido")
    await click(buttonNamed(edited, "Enviar")!)
    expect(document.body.textContent).not.toContain("No ha cambiado nada desde que pidieron la corrección")
    edited.unmount()
  })

  it("cuántos campos faltan se dice en un tooltip del botón, sin texto a la vista", async () => {
    const detail = syllabus("borrador")
    detail.sections[0]!.fields[0]!.value = null
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()

    const submit = buttonNamed(page, "Enviar")!
    expect(submit.disabled).toBe(true)
    const hint = page.container.querySelector("#submit-hint")!
    expect(hint.textContent).toBe("Falta 1 campo por completar")
    expect(hint.classList.contains("sr-only")).toBe(true)
    const trigger = submit.parentElement!
    expect(trigger.tabIndex).toBe(0)
    expect(trigger.getAttribute("aria-describedby")).toBe("submit-hint")
    fireEvent.focus(trigger)
    await flush()
    expect(document.querySelector('[role="tooltip"]')!.textContent).toBe("Falta 1 campo por completar")
    page.unmount()
  })

  it("dos celdas de la misma fila de unidades se guardan aunque el primer guardado siga en curso", async () => {
    vi.useFakeTimers()
    setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, { horas_docencia: "64", horas_practicas: "0", horas_autonomas: "0", semanas_periodo: "16" })
    const week = () => ({ contenidos: "", acd_h: "", ape_h: "", aa_h: "", acd: "", ape: "", aa: "", evaluacion: "" })
    const units = Array.from({ length: 4 }, () => ({ nombre: "U", resultado: "R", semanas: Array.from({ length: 4 }, week) }))
    const detail = syllabus("borrador")
    detail.sections[0]!.fields[0]!.value = { type: "doc", content: [{ type: "documentBlock", attrs: { kind: "unidades", props: {}, value: { units } } }] }
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    let finishFirst: () => void = () => undefined
    vi.mocked(saveTeacherField)
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = () => resolve({ version_bloqueo: 3, guardado_en: null, document: doc("") }) }))
      .mockResolvedValue({ version_bloqueo: 4, guardado_en: null, document: doc("") })
    const page = mountPage()
    await settle()
    const weekOf = (call: unknown[]) => ((call[3] as DocumentNode).content![0]!.attrs!.value as { units: Array<{ semanas: Array<Record<string, string>> }> }).units[0]!.semanas[0]!

    fireEvent.change(page.container.querySelector("#input-field-1-0-units-0-semanas-0-contenidos")!, { target: { value: "Introducción" } })
    await advance(700)
    fireEvent.change(page.container.querySelector("#input-field-1-0-units-0-semanas-0-acd_h")!, { target: { value: "4" } })
    await advance(700)
    finishFirst()
    await settle()
    await advance(0)

    const last = vi.mocked(saveTeacherField).mock.calls.at(-1)!
    expect(last[2]).toBe(3)
    expect(weekOf(last)).toMatchObject({ contenidos: "Introducción", acd_h: "4" })
    page.unmount()
  })

  it("si las horas de las unidades no suman, no lo dice junto al botón: al pulsarlo lleva al error sin enviar", async () => {
    const week = (acd: string) => ({ contenidos: "", acd_h: acd, ape_h: "", aa_h: "", acd: "", ape: "", aa: "", evaluacion: "" })
    const units = (acd: string) => Array.from({ length: 4 }, (_, index) => ({ nombre: "U", resultado: "R", semanas: Array.from({ length: 4 }, (__, number) => week(index === 0 && number === 0 ? acd : "")) }))
    const planning = (acd: string): DocumentNode => ({ type: "doc", content: [{ type: "documentBlock", attrs: { kind: "unidades", props: {}, value: { units: units(acd) } } }] })
    setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, { horas_docencia: "64", horas_practicas: "0", horas_autonomas: "0", semanas_periodo: "16" })

    const wrong = syllabus("borrador")
    wrong.sections[0]!.fields[0]!.value = planning("60")
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: wrong })
    const first = mountPage()
    await flush()
    expect(buttonNamed(first, "Enviar")!.disabled).toBe(false)
    expect(first.container.querySelector("#submit-hint")).toBeNull()
    vi.mocked(validateTeacherSyllabus).mockClear()
    vi.mocked(validateTeacherSyllabus).mockResolvedValue({ validation: { results: [] } } as never)
    fireEvent.click(buttonNamed(first, "Enviar")!)
    await flush()
    expect(validateTeacherSyllabus).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain("¿Enviar a revisión?")
    expect(submitTeacherSyllabus).not.toHaveBeenCalled()
    first.unmount()

    const right = syllabus("borrador")
    right.sections[0]!.fields[0]!.value = planning("64")
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: right })
    const second = mountPage()
    await flush()
    expect(buttonNamed(second, "Enviar")!.disabled).toBe(false)
    second.unmount()
  })

  it("formación y discapacidad son documentos docentes sin controles por sección", async () => {
    const detail = syllabus("borrador", "institucional")
    detail.sections[0]!.fields.push(
      field("field-2", "docente", { key: "formacion_docente", label: "Formación y experiencia académica-investigativa" }),
      field("field-3", "docente", { key: "discapacidad", label: "Estudiantes con discapacidad" }),
    )
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()
    expect(editorIds(page)).toHaveLength(2)
    expect(page.container.querySelector("#disability-choice")).toBeNull()
    expect(page.container.querySelector("#field-field-2")).not.toHaveClass("border-l-2")
    page.unmount()
    detail.state = "en_revision"
    const readonly = mountPage()
    await flush()
    expect(editorIds(readonly)).toHaveLength(0)
    expect(preview(readonly)!.textContent).toContain("Texto enviado")
    readonly.unmount()
  })

  it("muestra el comentario general de coordinación, sin observaciones por campo", async () => {
    const draft = syllabus("correccion_solicitada")
    draft.review_comments = [{
      stage: "coordinacion",
      comment: "Aclare el resultado",
      commented_at: "2026-09-29T09:00:00-05:00",
      commented_by: "Coordinación Demo",
      revision_number: 1,
    }]
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    const page = mountPage()
    await flush()

    expect(page.container.querySelector(".review-comment")!.textContent).toContain("Coordinación pidió correcciones")
    expect(page.container.querySelector(".review-comment")!.textContent).toContain("Aclare el resultado")
    expect(page.container.querySelector('button[aria-label="Comentarios"]')).toBeNull()
    expect(page.container.textContent).not.toContain("Está preparando una nueva revisión")
    expect(vi.mocked(PageFrame).mock.lastCall![0].hideIcon).toBe(true)
    expect(page.container.textContent).not.toContain("Guardar respuesta")
    page.unmount()
  })

  it("detiene el autoguardado y ofrece recarga ante un conflicto de versión", async () => {
    vi.useFakeTimers()
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(saveTeacherField).mockRejectedValue(new ApiError("El borrador cambió", 409))
    const page = mountPage()
    await settle()

    await typeText(page, "Cambio local")
    await advance(700)
    await settle()

    expect(page.container.querySelector(".feedback.error")!.textContent).toContain("otra sesión")
    expect(page.container.querySelector(".feedback.error button")!.textContent).toBe("Recargar borrador")
    page.unmount()
  })

  it("deja las firmas fuera del formulario, oculta el botón de validación y muestra los errores vigentes", async () => {
    const draft = syllabus("borrador")
    draft.sections.push({
      id: "section-review",
      key: "revision",
      title: "Revisión y aprobación",
      description: "Complete los campos aplicables",
      orientation: "portrait",
      fields: [field("review-field", "institucional", { key: "firmas", label: "Firmas", value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "variable", attrs: { id: "firma_coordinador" } }] }] } })],
    })
    draft.validation = {
      version_bloqueo: draft.version_bloqueo,
      blocking_errors: 1,
      warnings: 0,
      results: [{
        field_id: "field-1",
        code: "campo_obligatorio_faltante",
        severity: "error",
        message: "«Descripción de la asignatura» está vacío. Complétalo antes de enviar",
      }],
    }
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    const page = mountPage()
    await flush()

    expect(page.container.textContent).toContain("Descripción")
    expect(page.container.textContent).not.toContain("Revisión y aprobación")
    expect(page.container.textContent).not.toContain("Resultados de validación")
    expect(page.container.textContent).toContain("está vacío")
    expect([...page.container.querySelectorAll("button")].some((button) => button.textContent === "Validar sílabo")).toBe(false)
    page.unmount()
  })

  it("deshabilita Enviar mientras algún campo del docente sigue vacío", async () => {
    const draft = syllabus("borrador")
    draft.sections[0]!.fields[0]!.value = null
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    const page = mountPage()
    await flush()

    const send = buttonNamed(page, "Enviar")
    expect(send).toBeDefined()
    expect(send!.disabled).toBe(true)
    expect(page.container.querySelector(".submit-hint")).toBeNull()

    await typeText(page, "Contenido")
    expect(buttonNamed(page, "Enviar")!.disabled).toBe(false)
    expect(page.container.querySelector(".submit-hint")).toBeNull()
    page.unmount()
  })

  it("copia el contenido desde otro paralelo del docente tras confirmar", async () => {
    const draft = syllabus("borrador")
    draft.copy_sources = [{ id: "syllabus-2", parallel: "B", state: "borrador" }]
    const copied = syllabus("borrador")
    copied.version_bloqueo = 3
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    vi.mocked(copyTeacherSyllabus).mockResolvedValue({ message: "Contenido copiado", syllabus: copied })
    const page = mountPage()
    await flush()

    await click(buttonNamed(page, "Copiar desde paralelo B")!)
    expect(document.body.textContent).toContain("¿Copiar desde el paralelo B?")
    await click([...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent?.includes("Copiar contenido"))!)

    expect(copyTeacherSyllabus).toHaveBeenCalledWith("syllabus-1", "syllabus-2", 2)
    expect(buttonNamed(page, "Copiar desde paralelo B")).toBeUndefined()
    page.unmount()
  })

  it("permite enviar sin validar antes y marca los errores bloqueantes que devuelve el servidor", async () => {
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(submitTeacherSyllabus).mockRejectedValue(new ApiError("Corrija los errores", 422, { validation: ["Corrija los errores determinísticos antes de enviar"] }))
    vi.mocked(validateTeacherSyllabus).mockResolvedValue({
      message: "Validación completada",
      validation: {
        version_bloqueo: 2,
        blocking_errors: 2,
        warnings: 0,
        results: [
          { field_id: "field-1", code: "campo_obligatorio_faltante", severity: "error", message: "Completa «Contenido»" },
          { field_id: "master-1", code: "dato_maestro_faltante", severity: "error", message: "Falta el dato institucional de créditos" },
        ],
      },
    })
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    const page = mountPage()
    await flush()

    const send = buttonNamed(page, "Enviar")
    expect(send).toBeDefined()
    await click(send!)

    expect(submitTeacherSyllabus).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("¿Enviar a revisión?")
    const confirm = dialogButton("Enviar")
    expect(confirm).toBeDefined()
    await click(confirm!)

    expect(submitTeacherSyllabus).toHaveBeenCalledWith("syllabus-1", 2, expect.any(String), null)
    expect(getTeacherSigningStatement).not.toHaveBeenCalled()
    expect(page.container.querySelector(".submit-feedback")).toBeNull()
    expect(buttonNamed(page, "Ir a la primera")).toBeUndefined()
    expect(page.container.querySelector(".feedback.error")!.textContent).toContain("Falta el dato institucional de créditos")
    expect(page.container.querySelector(".feedback.error")!.textContent).not.toContain("Completa «Contenido»")
    expect(page.container.textContent).not.toContain("Pulse cada una")
    expect(page.container.querySelector("#field-field-1")!.getAttribute("data-invalid")).toBe("true")

    await typeText(page, "Contenido nuevo")
    expect(page.container.querySelector("#field-field-1")!.getAttribute("data-invalid")).toBe("false")
    page.unmount()
  })

  it("con el asistente apagado el docente no ve nada del asistente", async () => {
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    const page = mountPage()
    await flush()

    expect(buttonNamed(page, "Asistente")).toBeUndefined()
    expect(page.container.querySelector('aside[aria-label="Asistente de unidades"]')).toBeNull()
    page.unmount()
  })

  it("al abrir un sílabo sin iniciar, lo prepara solo y muestra el formulario sin pasarlo a borrador", async () => {
    const pending = { ...syllabus("borrador"), state: "sin_iniciar" as SyllabusDetail["state"], iniciado_en: null }
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: pending })
    vi.mocked(startTeacherSyllabus).mockResolvedValue({ message: "Sílabo preparado", syllabus: { ...syllabus("borrador"), state: "sin_iniciar" } })
    const page = mountPage()
    await flush()

    expect(startTeacherSyllabus).toHaveBeenCalledTimes(1)
    expect(startTeacherSyllabus).toHaveBeenCalledWith(pending.id)
    expect(page.container.querySelector('[data-tour="page-header"]')!.textContent).toContain("Sin iniciar")
    expect(page.container.querySelector('[data-tour="page-header"]')!.textContent).not.toContain("Borrador")
    expect(page.container.querySelector('[data-tour="page-header"]')!.textContent).toContain("Volver a mis sílabos")
    expect(buttonNamed(page, "Iniciar borrador")).toBeUndefined()
    expect(page.container.textContent).not.toContain("Listo para iniciar")
    expect(editorIds(page)).toHaveLength(1)
    page.unmount()
  })

  it("un sílabo ya preparado sin iniciar se edita sin volver a prepararlo y pasa a «Borrador» con el primer cambio guardado", async () => {
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: { ...syllabus("borrador", "docente"), state: "sin_iniciar" } })
    vi.mocked(saveTeacherField).mockResolvedValue({ estado: "borrador", version_bloqueo: 3, guardado_en: null, document: doc("Texto nuevo") })
    const page = mountPage()
    await flush()

    expect(startTeacherSyllabus).not.toHaveBeenCalled()
    expect(editorIds(page)).toHaveLength(1)
    const header = () => page.container.querySelector('[data-tour="page-header"]')!.textContent
    expect(header()).toContain("Sin iniciar")
    emitDocument(page, doc("Texto nuevo"))
    await click(buttonNamed(page, "Vista previa")!)

    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-1", 2, doc("Texto nuevo"))
    expect(header()).toContain("Borrador")
    expect(header()).not.toContain("Sin iniciar")
    page.unmount()
  })

  it("ofrece «Documentos de apoyo» mientras el sílabo no está aprobado y lo quita al aprobarse", async () => {
    for (const [state, offered] of [["borrador", true], ["en_revision", true], ["correccion_solicitada", true], ["aprobado", false]] as const) {
      vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus(state) })
      const page = mountPage()
      await flush()

      expect(Boolean(buttonNamed(page, "Documentos de apoyo")), state).toBe(offered)
      page.unmount()
    }
  })

  it("marca con aria-selected la pestaña de la sección abierta aunque el mensaje emergente cambie data-state", async () => {
    const detail = syllabus("borrador")
    detail.sections.push({ ...detail.sections[0]!, id: "section-2", key: "otra", title: "Otra", fields: [field("field-2")] })
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()

    const [first, second] = [...page.container.querySelectorAll('[role="tab"]')]
    for (const className of ["aria-selected:border-foreground", "aria-selected:text-foreground", "aria-selected:font-semibold"]) {
      expect(first!.className.split(" ")).toContain(className)
    }
    expect(first!.getAttribute("aria-selected")).toBe("true")
    expect(second!.getAttribute("aria-selected")).toBe("false")
    page.unmount()
  })

  it("usa el encabezado normal de la app: sin barra propia, sin repetir la franja de plazo y con Volver sobre el título", async () => {
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    const page = mountPage()
    await flush()

    expect(page.container.querySelector('header[aria-label="Herramientas del sílabo"]')).toBeNull()
    expect(page.container.querySelector('[data-testid="role-deadline-banner"]')).toBeNull()
    expect(page.container.querySelector('[data-tour="page-header"]')!.textContent).toContain("Volver a mis sílabos")
    page.unmount()
  })

  it("en pausa no ofrece iniciar ni repite el motivo: lo explica la franja", async () => {
    for (const state of ["sin_iniciar", "borrador"] as const) {
      const draft = syllabus("borrador")
      draft.state = state as SyllabusDetail["state"]
      draft.editable = false
      draft.edit_block_reason = "El periodo académico está en pausa. Podrá seguir editando cuando se reanude"
      draft.edit_blocked_by_convocation = true
      vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
      const page = mountPage()
      await flush()

      expect(buttonNamed(page, "Iniciar borrador")).toBeUndefined()
      expect(page.container.querySelector(".edit-blocked")).toBeNull()
      page.unmount()
    }
  })

  it("un borrador de un periodo académico finalizado se ve como formulario, sin poder editarlo", async () => {
    const draft = syllabus("borrador")
    draft.editable = false
    draft.edit_block_reason = "El periodo académico finalizó"
    draft.edit_blocked_by_convocation = true
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    const page = mountPage()
    await flush()

    expect(page.container.querySelector("#field-field-1")).not.toBeNull()
    expect(page.container.querySelector("section.teacher-form")).not.toBeNull()
    expect(buttonNamed(page, "Firmar y enviar")).toBeUndefined()
    page.unmount()
  })

  it("un bloqueo que no es del periodo académico sí muestra su motivo", async () => {
    const draft = syllabus("borrador")
    draft.editable = false
    draft.edit_block_reason = "No tiene una asignación vigente para editar este sílabo"
    draft.edit_blocked_by_convocation = false
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    const page = mountPage()
    await flush()

    expect(page.container.querySelector(".edit-blocked")!.textContent).toContain("No tiene una asignación vigente")
    page.unmount()
  })

  it("queda sin poder editar, con el mismo aspecto, si un guardado es rechazado por pausa", async () => {
    vi.useFakeTimers()
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(saveTeacherField).mockRejectedValue(new ApiError("This action is unauthorized", 403))
    const page = mountPage()
    await settle()

    await typeText(page, "Cambio local")
    await advance(700)
    await settle()

    expect(editors.props.get(editorIds(page)[0]!)!.disabled).toBe(true)
    expect(page.container.querySelector(".edit-blocked")!.textContent).toContain("El periodo académico está en pausa. Podrá seguir editando cuando se reanude")
    expect(buttonNamed(page, "Enviar")).toBeUndefined()
    page.unmount()
  })

  it("deja el campo pendiente tras un fallo y lo reenvía con Reintentar", async () => {
    vi.useFakeTimers()
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(saveTeacherField)
      .mockRejectedValueOnce(new ApiError("Error temporal", 500))
      .mockResolvedValueOnce({ version_bloqueo: 3, guardado_en: null, document: doc("") })
    const page = mountPage()
    await settle()

    await typeText(page, "Cambio local")
    await advance(700)
    await settle()

    expect(page.container.querySelector(".save-status")!.textContent).toContain("Sin guardar")
    await click(buttonNamed(page, "Reintentar")!)

    expect(saveTeacherField).toHaveBeenCalledTimes(2)
    expect(saveTeacherField).toHaveBeenLastCalledWith("syllabus-1", "field-1", 2, doc("Cambio local"))
    expect(page.container.querySelector(".save-status")).toBeNull()
    page.unmount()
  })

  it("lleva al inicio de sesión si un guardado falla por sesión caducada", async () => {
    vi.useFakeTimers()
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(saveTeacherField).mockRejectedValue(new ApiError("CSRF token mismatch", 419))
    const page = mountPage()
    await settle()

    await typeText(page, "Cambio local")
    await advance(700)
    await settle()

    expect(handleUnauthorized).toHaveBeenCalled()
    expect(page.container.querySelector(".save-status")!.textContent).toContain("Sin guardar")
    page.unmount()
  })

  it("guarda lo pendiente al salir de la página en lugar de descartarlo", async () => {
    vi.useFakeTimers()
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(saveTeacherField).mockResolvedValue({ version_bloqueo: 3, guardado_en: null, document: doc("") })
    const page = mountPage()
    await settle()

    await typeText(page, "Antes de salir")
    const event = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)

    leaveThroughLink()
    await settle()

    expect(saveTeacherField).toHaveBeenCalledWith("syllabus-1", "field-1", 2, doc("Antes de salir"))
    expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos")
    page.unmount()
  })

  it.each([
    { button: "Seguir editando", allowed: false },
    { button: "Salir y descartar cambios", allowed: true },
  ])("pide confirmación al fallar el guardado y permite decidir: $button", async ({ button, allowed }) => {
    vi.useFakeTimers()
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(saveTeacherField).mockRejectedValue(new ApiError("Error temporal", 500))
    const page = mountPage()
    await settle()

    await typeText(page, "Antes de salir")
    leaveThroughLink()
    await settle()
    const choice = dialogButton(button)
    expect(choice).toBeDefined()
    await click(choice!)
    if (allowed) expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos")
    else expect(navigation.push).not.toHaveBeenCalled()
    page.unmount()
  })

  it("marca con asterisco todo campo del docente: en el sílabo todos son obligatorios", async () => {
    const detail = syllabus("borrador", "docente")
    detail.sections[0]!.fields[0]!.required = false
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()

    expect(page.container.querySelector("#field-field-1")!.textContent).toContain("*")
    page.unmount()
  })

  it("«Siguiente» y «Anterior» recorren las secciones como las pestañas", async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    const detail = syllabus("borrador", "docente")
    detail.sections.push({
      id: "section-2",
      key: "bibliografia",
      title: "Bibliografía",
      description: null,
      orientation: "portrait",
      fields: [field("field-2", "docente", { key: "bibliografia_basica", label: "Bibliografía básica" })],
    })
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()
    expect(buttonNamed(page, "Anterior")).toBeUndefined()
    expect(buttonNamed(page, "Siguiente")!.closest(".teacher-form")).toBeNull()

    await click(buttonNamed(page, "Siguiente")!)
    expect(page.container.querySelector("#field-field-2")).not.toBeNull()
    expect(page.container.querySelector("#field-field-1")).toBeNull()
    expect(buttonNamed(page, "Siguiente")).toBeUndefined()

    await click(buttonNamed(page, "Anterior")!)
    expect(page.container.querySelector("#field-field-1")).not.toBeNull()
    page.unmount()
  })

  it("tras un comentario de biblioteca el docente edita todo el sílabo y lo reenvía a revisión", async () => {
    const detail = syllabus("correccion_solicitada")
    detail.sections.push({
      id: "section-2",
      key: "bibliografia",
      title: "Bibliografía",
      description: null,
      orientation: "portrait",
      fields: [field("field-2", "docente", { key: "bibliografia_basica", label: "Bibliografía básica" })],
    })
    detail.review_comments = [
      { stage: "biblioteca", comment: "Comentario anterior", commented_at: "2026-09-20T09:00:00-05:00", commented_by: "Biblioteca Demo", revision_number: 1 },
      { stage: "biblioteca", comment: "La 10.ª edición no está disponible", commented_at: "2026-09-29T09:00:00-05:00", commented_by: "Biblioteca Demo", revision_number: 2 },
    ]
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: detail })
    const page = mountPage()
    await flush()

    expect(page.container.querySelector("#input-field-1")).not.toBeNull()
    await openTab(page, "Bibliografía")
    expect(page.container.querySelector("#input-field-2")).not.toBeNull()
    expect(page.container.querySelector(".library-correction")).toBeNull()
    expect(page.container.querySelector('button[aria-label="Comentarios"]')).toBeNull()
    expect(page.container.querySelector(".review-comment")!.textContent).toContain("La 10.ª edición no está disponible")
    expect(page.container.textContent).not.toContain("Comentario anterior")
    expect(buttonNamed(page, "Reenviar bibliografía")).toBeUndefined()
    expect(buttonNamed(page, "Enviar")).toBeDefined()
    await click(buttonNamed(page, "Enviar")!)
    expect(document.body.textContent).toContain("¿Enviar a revisión?")
    expect(document.body.textContent).toContain("Asegúrese de haber hecho los arreglos que pidió Biblioteca")
    expect(document.body.textContent).not.toContain("Pasa directo a biblioteca")
    page.unmount()
  })

  it("la formación es un campo más del sílabo: sin modal, y la vista previa no la repite como bloque", async () => {
    const draft = syllabus("borrador", "carrera")
    draft.sections[0]!.fields.push(field("field-2", "carrera", { key: "formacion_docente", label: "Formación y experiencia académica-investigativa", value: doc("Magíster en Tecnología") }))
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    const page = mountPage()
    await flush()
    expect(document.body.textContent).not.toContain("Complete su formación y experiencia")
    expect(editorIds(page)).toHaveLength(2)
    await click(buttonNamed(page, "Vista previa")!)
    expect(previewSections().flatMap((section) => section.fields.map((item) => item.key))).toEqual(["contenido"])
    expect(getTeacherSyllabus).toHaveBeenCalledTimes(1)
    page.unmount()
  })

  it("si el docente cambió su formación, la vista previa vuelve a leer el sílabo para mostrarla en la identificación", async () => {
    const draft = syllabus("borrador", "carrera")
    draft.sections[0]!.fields.push(field("field-2", "carrera", { key: "formacion_docente", label: "Formación y experiencia académica-investigativa", value: doc("Magíster") }))
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    vi.mocked(saveTeacherField).mockResolvedValue({ version_bloqueo: 3, guardado_en: null, document: doc("Magíster y doctor") })
    const page = mountPage()
    await flush()
    act(() => editors.props.get(editorIds(page)[1]!)!.onValueChange!(doc("Magíster y doctor")))
    await click(buttonNamed(page, "Vista previa")!)
    expect(saveTeacherField).toHaveBeenCalled()
    expect(getTeacherSyllabus).toHaveBeenCalledTimes(2)
    page.unmount()
  })

  it("mientras carga un sílabo enviado muestra la hoja del documento", async () => {
    window.sessionStorage.setItem(SYLLABUS_PREVIEW_KEY, "syllabus-1")
    vi.mocked(getTeacherSyllabus).mockReturnValue(new Promise(() => undefined))
    const page = mountPage()
    await flush()

    expect(page.container.querySelector('[data-skeleton="preview-sheet"]')).not.toBeNull()
    page.unmount()
  })

  it("al primer envío firma la declaración y envía con la firma", async () => {
    const draft = syllabus("borrador")
    draft.teacher_signature_required = true
    const sent = syllabus("en_revision")
    sent.signatures = [{ role: "docente", name: "Docente Demo", signed_at: "2026-09-16T10:00:00Z" }]
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    vi.mocked(getTeacherSigningStatement).mockResolvedValue({ statement: "silabos-ueb|silabo:syllabus-1|accion:envio_docente|huella:abc", required: true })
    vi.mocked(submitTeacherSyllabus).mockResolvedValue({ message: "Enviado", syllabus: sent })
    const page = mountPage()
    await flush()

    expect(buttonNamed(page, "Enviar")).toBeUndefined()
    await click(buttonNamed(page, "Firmar y enviar")!)
    await fillSignatureDialog(makeTestP12("DOCENTE DEMO", "clave"), "clave")
    await confirmSignatureDialog()

    expect(getTeacherSigningStatement).toHaveBeenCalledWith("syllabus-1", 2)
    expect(submitTeacherSyllabus).toHaveBeenCalledWith("syllabus-1", 2, expect.any(String), {
      statement: "silabos-ueb|silabo:syllabus-1|accion:envio_docente|huella:abc",
      cms: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/),
    })
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos"))
    page.unmount()
  })

  it("muestra en el diálogo el error de firma del envío", async () => {
    const draft = syllabus("borrador")
    draft.teacher_signature_required = true
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    vi.mocked(getTeacherSigningStatement).mockResolvedValue({ statement: "silabos-ueb|silabo:syllabus-1|accion:envio_docente|huella:abc", required: true })
    vi.mocked(submitTeacherSyllabus).mockRejectedValue(new ApiError("Datos inválidos", 422, { signature: ["El certificado está vencido"] }))
    const page = mountPage()
    await flush()

    await click(buttonNamed(page, "Firmar y enviar")!)
    await fillSignatureDialog(makeTestP12("DOCENTE DEMO", "clave"), "clave")
    await confirmSignatureDialog()

    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("El certificado está vencido")
    expect(page.container.querySelector(".feedback.error")).toBeNull()
    page.unmount()
  })

  it("el sílabo aprobado se ve como documento con su PDF", async () => {
    const approved = { ...syllabus("en_revision"), state: "aprobado" as const, approved_revision_id: "revision-9" }
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: approved })
    const page = mountPage()
    await flush()

    expect(preview(page)).not.toBeNull()
    expect(buttonNamed(page, "Ver PDF")?.textContent).toBe("Ver PDF")
    expect(buttonNamed(page, "Asistente")).toBeUndefined()
    expect(page.container.querySelector('a[href*="documentos"]')).toBeNull()
    expect(buttonNamed(page, "Firmar")).toBeUndefined()
    page.unmount()
  })

  it("al copiar, el diálogo se desvanece nombrando todavía el paralelo", async () => {
    simulateExitAnimation()
    const draft = syllabus("borrador")
    draft.copy_sources = [{ id: "syllabus-2", parallel: "B", state: "borrador" }]
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: draft })
    vi.mocked(copyTeacherSyllabus).mockResolvedValue({ message: "Contenido copiado", syllabus: syllabus("borrador") })
    const page = mountPage()
    await flush()
    await click(buttonNamed(page, "Copiar desde paralelo B")!)
    const dialog = (): HTMLElement => [...document.body.querySelectorAll<HTMLElement>('[role="dialog"]')].find((item) => item.textContent?.includes("Copiar contenido"))!

    await click([...dialog().querySelectorAll("button")].find((button) => button.textContent?.includes("Copiar contenido"))!)

    expect(dialog().dataset.state).toBe("closed")
    expect(dialog().textContent).toContain("¿Copiar desde el paralelo B?")
    page.unmount()
  })

  it("tras enviar, vuelve a la lista solo cuando el diálogo terminó de cerrarse", async () => {
    const sent = syllabus("en_revision")
    vi.mocked(getTeacherSyllabus).mockResolvedValue({ syllabus: syllabus("borrador") })
    vi.mocked(submitTeacherSyllabus).mockResolvedValue({ message: "Enviado", syllabus: sent })
    const page = mountPage()
    await flush()
    await click(buttonNamed(page, "Enviar")!)

    await click(dialogButton("Enviar")!)
    expect(submitTeacherSyllabus).toHaveBeenCalled()
    expect(navigation.push).not.toHaveBeenCalled()

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, DIALOG_EXIT_MS)) })
    await flush()
    expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos")
    page.unmount()
  })
})
