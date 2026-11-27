import { fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as templateApi from "@/api/template"
import type { TemplatePayload } from "@/api/template"
import { body, byLabel, byText, chooseFiller, chooseMenuItem, click, menuItems, mountBuilder, press, selectField, selectSection, settle } from "@/components/domain/configuration/templateBuilderTesting"
import { emptyDocument, type FieldResponsible } from "@/types/configuration"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

vi.mock("@/api/template")

type Template = NonNullable<TemplatePayload["template"]>
const field = (id: string, label: string, quien_llena: FieldResponsible = "carrera") => ({ id, key: id, label, quien_llena, content: emptyDocument() })
const template: Template = {
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  layout: { margin_cm: 1.5, title_font_size: 14, section_font_size: 11, body_font_size: 11 },
  layoutOptions: { margins: [{ value: 1.5, label: "1,5 cm" }], title_sizes: [{ value: 14, label: "14 pt" }], section_sizes: [{ value: 11, label: "11 pt" }], body_sizes: [{ value: 11, label: "11 pt" }] },
  sections: [
    { id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [field("f1", "Primero"), field("f2", "Segundo", "institucional")] },
    { id: "s2", key: "dos", title: "Dos", orientation: "portrait", fields: [] },
  ],
}
const presets = [
  { key: "identificacion", field_key: "asignatura", label: "Datos de identificación", quien_llena: "institucional" as FieldResponsible, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Dato" }] }] } as DocumentNode },
]
const variables = [{ key: "nombre_facultad", label: "Nombre de la facultad", sample: "Ciencias" }]

const ribbon = (): HTMLElement => body().querySelector<HTMLElement>("[data-template-ribbon]")!
const tabs = (): string[] => [...ribbon().querySelectorAll('[role="tab"]')].map((tab) => tab.textContent!.trim())
const tab = (name: string): HTMLElement | undefined => [...ribbon().querySelectorAll<HTMLElement>('[role="tab"]')].find((item) => item.textContent?.trim() === name)
const openTab = async (name: string): Promise<void> => {
  fireEvent.mouseDown(tab(name)!)
  await settle()
}
const activePanel = (): HTMLElement => ribbon().querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]')!
const groups = (element: HTMLElement): string[] => [...element.querySelectorAll("[data-ribbon-group]")].map((group) => group.getAttribute("aria-label")!)
const captions = (element: HTMLElement): string[] => [...element.querySelectorAll("[data-ribbon-caption]")].map((caption) => caption.textContent!.trim())
const panel = (): HTMLElement | null => body().querySelector<HTMLElement>("[data-template-panel]")
const saved = () => vi.mocked(templateApi.importTemplateJson).mock.calls[0]![1] as templateApi.TemplateDraftPayload

describe("TemplateVisualBuilder: cinta con pestañas fija arriba y menú «Más»", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.mocked(templateApi.importTemplateJson).mockResolvedValue({ message: "ok" })
    vi.mocked(templateApi.getTemplateAiPermissions).mockResolvedValue({ fields: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("muestra las pestañas Inicio, Insertar y Diseño con sus grupos rotulados", async () => {
    await mountBuilder({ template, presets, variables })

    expect(ribbon().querySelector('[role="tablist"]')!.getAttribute("aria-label")).toBe("Pestañas de la cinta")
    expect(tabs()).toEqual(["Inicio", "Insertar", "Diseño"])
    expect(tab("Inicio")!.getAttribute("aria-selected")).toBe("true")
    expect(groups(activePanel())).toEqual(["Deshacer", "Fuente", "Párrafo"])
    expect(captions(activePanel())).toEqual(["Deshacer", "Fuente", "Párrafo"])
    for (const label of ["Deshacer", "Rehacer", "Negrita", "Cursiva", "Subrayado", "Color del texto", "Centrar", "Lista con viñetas", "Lista numerada"]) {
      expect(activePanel().querySelector(`button[aria-label="${label}"]`)).not.toBeNull()
    }

    await openTab("Insertar")
    expect(groups(activePanel())).toEqual(["Tablas", "Respuesta del docente", "Contenido"])
    expect([...activePanel().querySelectorAll("button")].map((button) => button.textContent!.trim()).filter(Boolean)).toEqual(["Tabla", "Tabla repetible", "Dato automático", "Contenido predefinido"])
    expect(activePanel().querySelector('button[aria-label="Tipo de respuesta"]')).not.toBeNull()

    await openTab("Diseño")
    expect(groups(activePanel())).toEqual(["Página", "Fuente"])
    expect([...activePanel().querySelectorAll("button")].map((button) => button.textContent!.trim())).toEqual(["Página", "Fuente"])
    expect(activePanel().querySelector("#template-layout-margin_cm")).toBeNull()
    fireEvent.click(byText("button", "Página")!)
    await settle()
    expect(activePanel().querySelector("#template-layout-margin_cm")).not.toBeNull()
  })

  it("la pestaña Campo se abre sola al elegir un campo y reúne nombre, si se puede editar, reglas y acciones", async () => {
    await mountBuilder({ template, presets })
    expect(tabs()).not.toContain("Campo")
    expect(ribbon().querySelector("[data-contextual-slot]")!.textContent).toBe("Seleccione un campo")

    await selectField("f1")
    expect(tabs()).toEqual(["Inicio", "Insertar", "Diseño", "Campo"])
    expect(tab("Campo")!.getAttribute("aria-selected")).toBe("true")
    expect(groups(activePanel())).toEqual(["Nombre", "¿Quién lo llena?", "Asistente del docente", "Reglas", "Organizar"])
    expect(activePanel().querySelector<HTMLInputElement>("[data-field-name-input]")!.value).toBe("Primero")
    expect([...activePanel().querySelectorAll("[data-field-filler] [data-filler]")].map((item) => item.textContent!.trim())).toEqual(["Nadie (texto fijo)", "Coordinación", "Solo el docente"])
    expect(activePanel().querySelector('[data-filler="carrera"]')!.getAttribute("data-state")).toBe("on")
    expect(activePanel().querySelector("[data-field-limit-tool]")!.textContent).toBe("Límite de caracteres")
    expect(activePanel().querySelector("[data-field-condition-tool]")).toBeNull()
    for (const label of ["Subir el campo Primero", "Bajar el campo Primero", "Duplicar el campo Primero", "Mover el campo Primero a otra sección", "Eliminar el campo Primero"]) {
      expect(activePanel().querySelector(`button[aria-label="${label}"]`)).not.toBeNull()
    }
    expect(ribbon().textContent).not.toContain("¿Se puede editar?")
    expect(ribbon().textContent).not.toContain("Ponerle nombre")

    await selectSection("Uno")
    expect(tabs()).toEqual(["Inicio", "Insertar", "Diseño", "Sección"])
    expect(groups(activePanel())).toEqual(["Orientación", "Organizar"])

    fireEvent.pointerDown(body())
    await settle()
    expect(tabs()).toEqual(["Inicio", "Insertar", "Diseño"])
    expect(tab("Inicio")!.getAttribute("aria-selected")).toBe("true")
  })

  it("un campo No editable sin respuestas antes no muestra reglas, y sin tablas repetibles no hay grupo de tablas", async () => {
    await mountBuilder({ template, presets })
    await selectField("f2")
    expect(groups(activePanel())).toEqual(["Nombre", "¿Quién lo llena?", "Asistente del docente", "Organizar"])
    expect(activePanel().querySelector('[data-filler="institucional"]')!.getAttribute("data-state")).toBe("on")
    expect(activePanel().querySelector("[data-field-limit-tool]")).toBeNull()
    expect(activePanel().querySelector("[data-field-condition-tool]")).toBeNull()
    expect(ribbon().textContent).not.toContain("Tablas repetibles")
    expect(body().textContent).not.toContain("Este campo no tiene tablas repetibles")
  })

  it("la pestaña elegida se mantiene al seguir en el mismo campo y el hueco de la pestaña contextual está reservado", async () => {
    await mountBuilder({ template, presets })
    const slot = ribbon().querySelector("[data-contextual-slot]")!
    await selectField("f1")
    expect(ribbon().querySelector("[data-contextual-slot]")).toBe(slot)
    await openTab("Insertar")
    await selectField("f1")
    expect(tab("Insertar")!.getAttribute("aria-selected")).toBe("true")
    await selectField("f2")
    expect(tab("Campo")!.getAttribute("aria-selected")).toBe("true")
  })

  it("las pestañas se recorren con el teclado", async () => {
    await mountBuilder({ template, presets })
    tab("Inicio")!.focus()
    fireEvent.keyDown(tab("Inicio")!, { key: "ArrowRight" })
    await settle()
    expect(document.activeElement).toBe(tab("Insertar"))
    expect(tab("Insertar")!.getAttribute("aria-selected")).toBe("true")
  })

  it("no hay panel lateral: las opciones del campo solo están en la cinta, que es una banda fija arriba", async () => {
    await mountBuilder({ template, presets })
    await selectField("f1")
    expect(panel()).toBeNull()
    expect(body().querySelector('[aria-label="Opciones del campo"]')).toBeNull()
    expect(body().querySelectorAll("[data-field-filler]")).toHaveLength(1)
    expect(ribbon().className).toContain("sticky")
    expect(ribbon().className).toContain("top-0")
    expect(ribbon().className).not.toContain("shadow")
    expect(ribbon().className).not.toContain("rounded")
  })

  it("la pestaña Campo cambia nombre, si se puede editar y el límite, y se guarda igual que antes", async () => {
    await mountBuilder({ template, presets })
    await selectField("f1")

    await click(activePanel().querySelector("[data-field-limit-tool]"))
    fireEvent.change(body().querySelector<HTMLInputElement>("[data-field-limit-input]")!, { target: { value: "300" } })
    await settle()
    await click(body().querySelector("[data-field-limit-apply]"))
    expect(body().querySelector('[data-field-limit="f1"]')!.textContent).toBe("Hasta 300 caracteres")

    fireEvent.change(activePanel().querySelector<HTMLInputElement>("[data-field-name-input]")!, { target: { value: "Primero bis" } })
    await settle()
    await chooseFiller("Nadie (texto fijo)")
    await click(byText("button", "Guardar"))
    expect(saved().sections[0]!.fields[0]).toEqual({ key: "f1", label: "Primero bis", quien_llena: "institucional", content: emptyDocument() })
    expect(saved().sections[0]!.fields[1]).toEqual({ key: "f2", label: "Segundo", quien_llena: "institucional", content: emptyDocument() })
  })

  it("arriba quedan Vista previa y Guardar; «Editar JSON» y lo técnico van en «Más»", async () => {
    await mountBuilder({ template, presets })
    const actions = ribbon().querySelector<HTMLElement>('[role="group"][aria-label="Acciones de la plantilla"]')!
    expect([...actions.querySelectorAll("button")].map((button) => button.textContent!.trim())).toEqual(["Más", "Vista previa", "Guardar"])
    expect(ribbon().querySelector('button[aria-label="Volver a la vista"]')!.getAttribute("data-tour")).toBe("template-back")
    expect(byText("button", "Editar JSON")).toBeUndefined()
    expect(byLabel("Opciones avanzadas")).toBeNull()
    expect(byText("button", "Más")!.getAttribute("data-tour")).toBe("template-more")

    await press(byText("button", "Más"))
    expect(menuItems().map((item) => item.textContent!.trim())).toEqual(["Editar JSON", "Tema oscuro"])
  })

  it("la sección vacía no pone el punto para agregar un campo dentro de un párrafo", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await mountBuilder({ template, presets })

    const empty = body().querySelector<HTMLElement>("[data-empty-section]")!
    expect(empty.textContent).toContain("Sección sin campos.")
    expect(empty.tagName).not.toBe("P")
    expect(body().querySelector("p [data-insert-point]")).toBeNull()
    expect(errors.mock.calls.map((call) => String(call[0])).filter((message) => message.includes("descendant of <p>"))).toEqual([])
  })

  it("al abrir «Editar JSON» desde «Más» el foco queda en el diálogo y no en un elemento oculto", async () => {
    vi.mocked(templateApi.getTemplateJson).mockResolvedValue({ version: 1, sections: [] })
    await mountBuilder({ template, presets })
    const blocked: string[] = []
    const setAttribute = Element.prototype.setAttribute
    vi.spyOn(Element.prototype, "setAttribute").mockImplementation(function (this: Element, name: string, value: string) {
      if (name === "aria-hidden" && value === "true" && document.activeElement && this.contains(document.activeElement)) blocked.push(document.activeElement.textContent?.trim() ?? "")
      setAttribute.call(this, name, value)
    })

    await press(byText("button", "Más"))
    await chooseMenuItem("Editar JSON")

    expect(blocked).toEqual([])
    const focused = document.activeElement!
    expect(focused.closest('[role="dialog"]')).not.toBeNull()
    expect(focused.closest('[aria-hidden="true"]')).toBeNull()
    expect(byText("button", "Más")!.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it("«Contenido predefinido» de Insertar aplica el contenido como antes", async () => {
    await mountBuilder({ template, presets })
    await selectField("f1")
    await openTab("Insertar")

    await press(byLabel("Contenido predefinido"))
    await chooseMenuItem("Datos de identificación")
    await click(byText("button", "Guardar"))

    expect(saved().sections[0]!.fields[0]).toMatchObject({ key: "f1", label: "Primero", quien_llena: "institucional" })
    expect(JSON.stringify(saved().sections[0]!.fields[0]!.content)).toContain("Dato")
  })

  it("Inicio se activa con un campo elegido y «Tabla» de Insertar pone la tabla en ese campo", async () => {
    const { payload } = await mountBuilder({ template, presets })
    await selectField("f1")
    expect(byLabel("Negrita")!.disabled).toBe(false)
    await openTab("Insertar")
    await press(byLabel("Tabla"))
    await chooseMenuItem("Insertar tabla")
    expect(JSON.stringify(payload().sections[0]!.fields[0]!.content)).toContain('"type":"table"')
  })
})
