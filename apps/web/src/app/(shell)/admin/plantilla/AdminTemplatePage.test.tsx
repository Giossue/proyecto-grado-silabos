import { act, fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getSession } from "@/api/session"
import { checkTemplateDraft, createTemplate, getTemplate, getTemplateJson, getTemplateTeacherPreview, previewTemplateDraft, type TemplatePayload } from "@/api/template"
import { applyTemplateAssistantProposal, discardTemplateAssistantProposal, getTemplateAssistant, getTemplateAssistantProposal, sendTemplateAssistantMessage } from "@/api/templateAssistant"
import { TemplateVisualBuilder } from "@/components/domain/configuration/TemplateVisualBuilder"
import { navigation } from "@/test/nextNavigation"
import { renderWithProviders } from "@/test/render"
import AdminTemplatePage from "./AdminTemplatePage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/templateAssistant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/templateAssistant")>()),
  getTemplateAssistant: vi.fn(),
  sendTemplateAssistantMessage: vi.fn(),
  clearTemplateAssistant: vi.fn(),
  getTemplateAssistantProposal: vi.fn(),
  applyTemplateAssistantProposal: vi.fn(),
  discardTemplateAssistantProposal: vi.fn(),
}))
vi.mock("@/components/domain/ai/avatar/useAvatarController", () => ({ useAvatarController: () => ({ state: {} }) }))
vi.mock("@/api/template", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/template")>()),
  getTemplate: vi.fn(),
  createTemplate: vi.fn(),
  getTemplateJson: vi.fn(),
  getTemplateTeacherPreview: vi.fn(),
  previewTemplateDraft: vi.fn(),
  checkTemplateDraft: vi.fn(),
  getTemplateDraftImpact: vi.fn(),
}))
vi.mock("@/components/domain/configuration/TemplateVisualBuilder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/domain/configuration/TemplateVisualBuilder")>()
  return { ...actual, TemplateVisualBuilder: vi.fn(actual.TemplateVisualBuilder) }
})

const payload: TemplatePayload = {
  processLock: null,
  logos: {
    institution: "/logo.png",
    faculty: "/faculty.png",
    institution_size: { width: 120, height: 40 },
    faculty_size: { width: 120, height: 40 },
  },
  template: {
    id: "template-1",
    name: "Plantilla institucional",
    description: null,
    titleBlock: { text: "PROGRAMA DE ASIGNATURA (SÍLABO)" },
    sections: [
      {
        id: "section-1",
        key: "descripcion",
        title: "Descripción de la asignatura",
        orientation: "portrait",
        fields: [
          { id: "field-1", key: "descripcion", label: "Descripción", quien_llena: "carrera", content: { type: "doc", content: [{ type: "paragraph" }] } },
          { id: "field-2", key: "sin_nombre", label: "", quien_llena: "carrera", content: { type: "doc", content: [{ type: "paragraph" }] } },
        ],
      },
    ],
  },
}

const settle = async (rounds = 6): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const body = (): HTMLElement => document.body
const buttons = (root: ParentNode = body()): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>("button")]
const buttonWithText = (text: string, root: ParentNode = body()): HTMLButtonElement | undefined => buttons(root).find((button) => button.textContent?.trim() === text)
const one = <T extends Element = HTMLElement>(selector: string): T => {
  const element = body().querySelector<T>(selector)
  if (!element) throw new Error(`No está ${selector}`)
  return element
}
const click = async (element: Element | null | undefined): Promise<void> => {
  expect(element).toBeTruthy()
  fireEvent.click(element as Element)
  await settle()
}

const mountPage = async () => {
  const view = renderWithProviders(<AdminTemplatePage />)
  await settle()
  return view
}

const startEditing = async (): Promise<void> => {
  await click(buttonWithText("Editar"))
}

describe("AdminTemplatePage", () => {
  beforeEach(() => {
    navigation.reset("/admin/plantilla")
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", name: "Administración", email: "admin@ueb.edu.ec", email_verified: true, can_edit_identity: true },
      active_role: { id: "role-1", code: "administrador", career_id: null, career_name: null },
      available_roles: [],
    } as never)
    vi.mocked(getTemplate).mockReset()
    vi.mocked(getTemplate).mockResolvedValue(payload)
    vi.mocked(getTemplateAssistant).mockReset()
    vi.mocked(getTemplateAssistant).mockResolvedValue({ available: true, locked: false, suggestions: [], messages: [] })
    vi.mocked(sendTemplateAssistantMessage).mockReset()
    vi.mocked(sendTemplateAssistantMessage).mockResolvedValue({ message: "El pedido quedó registrado.", assistant_message_id: "a-1" })
    vi.mocked(applyTemplateAssistantProposal).mockReset()
    vi.mocked(applyTemplateAssistantProposal).mockResolvedValue({ message: "Propuesta aplicada en el editor." })
    vi.mocked(discardTemplateAssistantProposal).mockResolvedValue({ message: "Propuesta descartada." })
    vi.mocked(checkTemplateDraft).mockResolvedValue({ problems: [] })
    vi.mocked(TemplateVisualBuilder).mockClear()
  })

  it("pasa al editor qué tablas repetibles se pueden abrir en el diseñador", async () => {
    const blockDesigns = { unidades: { design: null, reason: "Tiene listas o grupos dentro de cada fila. Para cambiarla use Más → Editar JSON." } }
    vi.mocked(getTemplate).mockResolvedValue({ ...payload, blockDesigns })
    await mountPage()

    expect(vi.mocked(TemplateVisualBuilder).mock.lastCall![0].blockDesigns).toEqual(blockDesigns)
  })

  it("al editar, «Ver como docente» muestra el formulario del borrador sin guardar", async () => {
    const doc = { type: "doc" as const, content: [{ type: "paragraph" }] }
    vi.mocked(previewTemplateDraft).mockResolvedValue({
      sheets: [],
      sections: [
        {
          id: "nuevo",
          key: "descripcion",
          title: "Descripción del borrador",
          description: null,
          orientation: "portrait",
          fields: [{ id: "nuevo-1", key: "descripcion", label: "Descripción", quien_llena: "carrera", teacher_editable: true, required: true, value: doc, document: doc }],
        },
      ],
    } as never)
    vi.mocked(getTemplateTeacherPreview).mockClear()
    await mountPage()
    await startEditing()

    await click(buttonWithText("Ver como docente"))

    expect(getTemplateTeacherPreview).not.toHaveBeenCalled()
    expect(previewTemplateDraft).toHaveBeenCalledWith(
      "template-1",
      expect.objectContaining({ version: 1, title: "PROGRAMA DE ASIGNATURA (SÍLABO)", sections: [expect.objectContaining({ key: "descripcion" })] }),
    )
    expect(body().textContent).toContain("Vista de prueba del borrador sin guardar")
    expect(one("section.teacher-form").textContent).toContain("Descripción del borrador")

    await click(buttonWithText("Volver a editar"))
    expect(body().querySelector("section.teacher-form")).toBeNull()
    expect(buttonWithText("Ver como docente")).toBeDefined()
  })

  it("«Ver como docente» cambia la hoja por el formulario del docente con la plantilla guardada, y se puede volver", async () => {
    const doc = { type: "doc" as const, content: [{ type: "paragraph" }] }
    vi.mocked(getTemplateTeacherPreview).mockResolvedValue({
      sections: [
        {
          id: "section-1",
          key: "descripcion",
          title: "Descripción de la asignatura",
          description: null,
          orientation: "portrait",
          fields: [{ id: "field-1", key: "descripcion", label: "Descripción", quien_llena: "carrera", teacher_editable: true, required: true, value: doc, document: doc }],
        },
      ],
    } as never)
    await mountPage()

    await click(buttonWithText("Ver como docente"))
    expect(getTemplateTeacherPreview).toHaveBeenCalledWith("template-1")
    expect(body().textContent).toContain("Vista de prueba: así verá el formulario el docente. Lo que escriba aquí no se guarda")
    expect(one("section.teacher-form").textContent).toContain("Descripción")
    expect(buttonWithText("Editar")).toBeUndefined()
    expect(one("[data-sheet]").closest('[style*="display: none"]')).not.toBeNull()

    await click(buttonWithText("Volver a la plantilla"))
    expect(body().querySelector("section.teacher-form")).toBeNull()
    expect(buttonWithText("Ver como docente")).toBeDefined()
    expect(buttonWithText("Editar")).toBeDefined()
  })

  const proposal = (version: string) => ({
    id: "p-1",
    status: "pendiente" as const,
    draft_version: version,
    changes: ["Nuevo campo «Competencias» en «Descripción de la asignatura»."],
    changed: { sections: [], fields: ["competencias"] },
    sections: [
      {
        key: "descripcion",
        title: "Descripción de la asignatura",
        orientation: "portrait" as const,
        fields: [
          { key: "descripcion", label: "Descripción", quien_llena: "carrera" as const, content: { type: "doc" as const, content: [{ type: "paragraph" }] } },
          { key: "sin_nombre", label: "", quien_llena: "carrera" as const, content: { type: "doc" as const, content: [{ type: "paragraph" }] } },
          { key: "competencias", label: "Competencias", quien_llena: "carrera" as const, content: { type: "doc" as const, content: [{ type: "paragraph" }] } },
        ],
      },
    ],
  })

  const askAssistant = async (): Promise<string> => {
    expect(buttonWithText("Asistente")).toBeUndefined()
    await startEditing()
    await click(buttonWithText("Asistente"))
    const input = one<HTMLTextAreaElement>("#template-assistant-message")
    fireEvent.change(input, { target: { value: "Agrega Competencias" } })
    await settle()
    fireEvent.submit(input.closest("form")!)
    await settle()
    const sent = vi.mocked(sendTemplateAssistantMessage).mock.calls[0]![1]
    expect(sent.sections.map((section) => section.key)).toEqual(["descripcion"])
    return sent.version
  }

  it("solo al editar ofrece el asistente, que pone la propuesta en el editor sin guardarla", async () => {
    vi.mocked(getTemplateAssistant).mockImplementation(async () => {
      const version = vi.mocked(sendTemplateAssistantMessage).mock.calls[0]?.[1].version
      return {
        available: true,
        locked: false,
        suggestions: [],
        messages: version
          ? [{ id: "a-1", role: "asistente", status: "completado", result: "propuesta", content: "Propongo Competencias.", error: null, created_at: "2026-10-31T10:00:00Z", proposal: { id: "p-1", status: "pendiente", changes: proposal(version).changes, draft_version: version } }]
          : [],
      }
    })
    await mountPage()
    const version = await askAssistant()
    vi.mocked(getTemplateAssistantProposal).mockResolvedValue(proposal(version))

    await click(buttonWithText("Aplicar", one("[data-proposal]")))

    expect(applyTemplateAssistantProposal).toHaveBeenCalledWith("p-1")
    const changed = [...body().querySelectorAll<HTMLElement>("[data-changed]")]
    expect(changed).toHaveLength(1)
    expect(changed[0]!.textContent).toContain("Cambió")
    const field = changed[0]!.getAttribute("data-field")
    expect(field).not.toBeNull()
    expect(one<HTMLTextAreaElement>(`[data-field="${field}"] [data-field-label] textarea`).value).toBe("Competencias")
    expect(getTemplate).toHaveBeenCalledTimes(1)
    expect(body().querySelector('[aria-label="Cinta de edición de la plantilla"] [data-unsaved]')).not.toBeNull()
  })

  it("no aplica una propuesta si el borrador cambió después del pedido", async () => {
    vi.mocked(getTemplateAssistant).mockImplementation(async () => {
      const version = vi.mocked(sendTemplateAssistantMessage).mock.calls[0]?.[1].version
      return {
        available: true,
        locked: false,
        suggestions: [],
        messages: version
          ? [{ id: "a-1", role: "asistente", status: "completado", result: "propuesta", content: "Listo.", error: null, created_at: "2026-10-31T10:00:00Z", proposal: { id: "p-1", status: "pendiente", changes: ["Uno."], draft_version: version } }]
          : [],
      }
    })
    vi.mocked(getTemplateAssistantProposal).mockResolvedValue(proposal("otra:1"))
    await mountPage()
    await askAssistant()

    await click(buttonWithText("Aplicar", one("[data-proposal]")))

    expect(applyTemplateAssistantProposal).not.toHaveBeenCalled()
    expect(body().querySelector("[data-changed]")).toBeNull()
  })

  it("lista las secciones con sus campos, incluso el que no tiene nombre", async () => {
    await mountPage()
    await startEditing()

    expect(one<HTMLTextAreaElement>('[data-section="section-1"] [aria-label="Sección Descripción de la asignatura"]').value).toBe("Descripción de la asignatura")
    expect(one<HTMLTextAreaElement>('[data-field="field-1"] [data-field-label] textarea').value).toBe("Descripción")
    expect(body().querySelectorAll("[data-field-editor]")).toHaveLength(2)
    expect(body().querySelector('[aria-label="Nombre del campo Campo sin nombre"]')).toBeNull()
    expect(body().querySelector("[data-sheet], .template-sheet")).not.toBeNull()
  })

  it("al editar no hay título ni barra de encabezado: la cinta lleva volver, «Ver como docente» y el tema en «Más»", async () => {
    await mountPage()
    expect(one('[data-tour="page-header"]').className).not.toContain("hidden")
    expect(one("h1").textContent).toBe("Plantilla de sílabo")
    await startEditing()

    expect(one('[data-tour="page-header"]').className).toContain("hidden")
    expect(body().querySelector('header[aria-label="Herramientas de la plantilla"]')).toBeNull()
    const ribbon = one("[data-template-ribbon]")
    expect(ribbon.className).toContain("top-0")
    expect(ribbon.querySelector('button[aria-label="Volver a la vista"]')).not.toBeNull()
    const actions = one('[data-template-ribbon] [role="group"][aria-label="Acciones de la plantilla"]')
    expect(buttons(actions).map((button) => button.textContent?.trim())).toEqual(["Más", "Vista previa", "Ver como docente", "Guardar"])
    expect(buttons(body()).filter((button) => button.textContent?.trim() === "Ver como docente")).toHaveLength(1)
    expect(body().querySelector('button[aria-label^="Tema visual"]')).toBeNull()

    fireEvent.keyDown(buttonWithText("Más", actions)!, { key: "Enter" })
    await settle()
    expect([...body().querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim())).toEqual(["Editar JSON", "Tema oscuro"])
    fireEvent.keyDown(body().querySelector('[role="menu"]')!, { key: "Escape" })
    await settle()

    await click(ribbon.querySelector('button[aria-label="Volver a la vista"]'))
    expect(body().querySelector("[data-template-ribbon]")).toBeNull()
    expect(one('[data-tour="page-header"]').className).not.toContain("hidden")
  })

  it("no tiene pestañas ni «Personalizar plantilla» y conserva los logos fijos", async () => {
    await mountPage()

    expect(body().querySelector('[role="tab"]')).toBeNull()
    expect(body().textContent).not.toContain("Personalizar plantilla")
    expect(body().textContent).not.toContain("Vista previa")
    expect(one("[data-sheet]").textContent).not.toContain("Cambiar logo")
    expect(body().querySelector('input[type="file"]')).toBeNull()
    expect(one("[data-sheet] h2").classList.contains("template-sheet-title")).toBe(true)
    expect(body().querySelector('[data-field="field-1"] .template-sheet-box')).toBeNull()
  })

  it("pone la hoja directo sobre el fondo de la página, sin contenedor gris", async () => {
    await mountPage()

    const region = one('[aria-label="Constructor visual de la plantilla del sílabo"]')
    expect(body().querySelector(".template-stage")).toBeNull()
    expect([...region.classList].some((name) => /^(bg-|rounded|p-|px-|py-)/.test(name))).toBe(false)
    const scrollRegion = one('[aria-label="Hoja 1 de la plantilla con desplazamiento horizontal"]')
    expect(scrollRegion.classList.contains("overflow-x-auto")).toBe(true)
    expect(scrollRegion.getAttribute("tabindex")).toBe("0")
    const sheetArea = scrollRegion.parentElement!
    expect(region.contains(sheetArea)).toBe(true)
    expect([...sheetArea.classList].some((name) => /^(bg-|rounded|p-|px-|py-)/.test(name))).toBe(false)
    expect(one("[data-sheet]").parentElement).toBe(scrollRegion)
  })

  it("avisa que reanudar adapta los sílabos si la plantilla cambió durante la pausa", async () => {
    vi.mocked(getTemplate).mockResolvedValue({ ...payload, templateChangedDuringPause: true })
    await mountPage()

    expect(body().textContent).toContain("Al reanudar el proceso, los sílabos de este período se adaptan a la plantilla")
  })

  it("sincroniza una mutación sin desmontar el constructor", async () => {
    vi.mocked(getTemplate).mockReset()
    vi.mocked(getTemplate)
      .mockResolvedValueOnce(payload)
      .mockResolvedValueOnce({ ...payload, template: { ...payload.template!, titleBlock: { text: "OTRO TÍTULO" } } })
    await mountPage()

    const editor = one('[aria-label="Constructor visual de la plantilla del sílabo"]')
    act(() => {
      window.dispatchEvent(new CustomEvent("silabos:template-changed"))
    })
    await settle()

    expect(getTemplate).toHaveBeenCalledTimes(2)
    expect(one('[aria-label="Constructor visual de la plantilla del sílabo"]')).toBe(editor)
    expect(body().textContent).toContain("OTRO TÍTULO")
  })

  it("bloquea los cambios con un proceso abierto y lo explica", async () => {
    vi.mocked(getTemplate).mockResolvedValue({ ...payload, processLock: "Hay un proceso abierto" })
    await mountPage()

    expect(body().textContent).toContain("Edición bloqueada")
    expect(body().textContent).not.toContain("la plantilla no se puede cambiar")
    expect(buttonWithText("Nueva sección")).toBeUndefined()
    expect(buttonWithText("Editar")!.disabled).toBe(true)
  })

  it("crea sola la plantilla vacía si no existe y muestra solo el título y los logos", async () => {
    vi.mocked(getTemplate)
      .mockReset()
      .mockResolvedValueOnce({ processLock: null, template: null })
      .mockResolvedValueOnce({ ...payload, template: { ...payload.template!, sections: [] } })
    vi.mocked(createTemplate).mockReset().mockResolvedValue({ message: "Plantilla vacía creada.", template_id: "template-1" })

    await mountPage()

    expect(createTemplate).toHaveBeenCalledTimes(1)
    expect(one("[data-sheet] h2").textContent).toBe("PROGRAMA DE ASIGNATURA (SÍLABO)")
    expect(body().querySelectorAll("[data-sheet] header img")).toHaveLength(2)
    expect(body().querySelector("[data-section]")).toBeNull()
    expect(body().textContent).not.toContain("Esta hoja está en blanco")
    expect(body().querySelector('button[aria-label="Restablecer a plantilla oficial"]')).toBeNull()
    expect(body().querySelector('button[aria-label="Borrar la plantilla"]')).toBeNull()
    expect(body().querySelector('button[aria-label="Exportar JSON"]')).toBeNull()
    expect(body().querySelector('button[aria-label="Editar JSON"]')).toBeNull()
  })

  it("abre el JSON de la plantilla desde el menú «Más»", async () => {
    vi.mocked(getTemplateJson).mockReset().mockResolvedValue({ version: 2, sections: [] })
    await mountPage()

    expect(body().querySelector("[data-more-menu]")).toBeNull()
    await startEditing()

    const advanced = buttons(one("[data-template-ribbon]")).find((item) => item.textContent?.trim() === "Más")
    expect(advanced).toBeTruthy()
    fireEvent.keyDown(advanced!, { key: "Enter" })
    await settle()
    await click(body().querySelector('[role="menuitem"]'))

    expect(body().textContent).toContain("Plantilla como JSON")
    expect(getTemplateJson).toHaveBeenCalledWith("template-1")
  })
})
