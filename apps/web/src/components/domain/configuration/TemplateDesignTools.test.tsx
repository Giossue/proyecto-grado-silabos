import { fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as templateApi from "@/api/template"
import type { TemplatePayload } from "@/api/template"
import { body, byText, click, mountBuilder, press, settle } from "@/components/domain/configuration/templateBuilderTesting"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import { emptyDocument } from "@/types/configuration"
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import definition from "@silabos/shared/test/fixtures/template-definition.json"

vi.mock("@/api/template")

type Template = NonNullable<TemplatePayload["template"]>
const template: Template = {
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  layout: { margin_cm: 1.5, title_font_size: 14, section_font_size: 11, body_font_size: 11 },
  layoutOptions: { margins: [{ value: 1.5, label: "1,5 cm" }, { value: 2, label: "2,0 cm" }], title_sizes: [{ value: 14, label: "14 pt" }], section_sizes: [{ value: 11, label: "11 pt" }], body_sizes: [{ value: 11, label: "11 pt" }] },
  sections: [{ id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [{ id: "f1", key: "f1", label: "Primero", quien_llena: "carrera", content: emptyDocument() }] }],
}

const ribbon = (): HTMLElement => body().querySelector<HTMLElement>("[data-template-ribbon]")!
const openDesign = async (): Promise<void> => {
  fireEvent.mouseDown([...ribbon().querySelectorAll<HTMLElement>('[role="tab"]')].find((item) => item.textContent?.trim() === "Diseño")!)
  await settle()
}
const panel = (): HTMLElement => ribbon().querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]')!
const sheet = (): HTMLElement => body().querySelector<HTMLElement>("[data-sheet]")!
const MENUS: Array<[RegExp, string]> = [[/^(paper|orientation)$/, "Página"], [/^font_family$/, "Fuente"], [/^(line_height|paragraph_spacing_pt|body-alignment|empty_text)$/, "Párrafo"], [/^colors-/, "Colores"], [/^(title|section_title)-/, "Títulos"]]
const openMenu = (label: string): void => {
  const trigger = [...panel().querySelectorAll<HTMLButtonElement>("button[aria-haspopup='dialog']")].find((button) => button.textContent?.trim() === label)!
  if (trigger.getAttribute("aria-expanded") === "true") return
  fireEvent.keyDown(document.activeElement ?? body(), { key: "Escape" })
  fireEvent.click(trigger)
}
const control = <T extends HTMLElement = HTMLInputElement>(id: string): T => {
  const menu = MENUS.find(([pattern]) => pattern.test(id))
  if (menu) openMenu(menu[1])
  return panel().querySelector<T>(`#template-style-${id}`)!
}
const choose = async (id: string, label: string): Promise<void> => {
  await press(control(id))
  await press([...body().querySelectorAll('[role="option"]')].find((option) => option.textContent?.trim() === label))
}
const options = async (id: string): Promise<string[]> => {
  await press(control(id))
  const labels = [...body().querySelectorAll('[role="option"]')].map((option) => option.textContent!.trim())
  fireEvent.keyDown(document.activeElement ?? body(), { key: "Escape" })
  await settle()
  return labels
}
const type = async (id: string, value: string): Promise<void> => {
  fireEvent.change(control(id), { target: { value } })
  await settle()
}
const saved = () => vi.mocked(templateApi.importTemplateJson).mock.calls[0]![1] as templateApi.TemplateDraftPayload

describe("TemplateVisualBuilder: pestaña Diseño", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.mocked(templateApi.importTemplateJson).mockResolvedValue({ message: "ok" })
    setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("agrupa los estilos del documento como Word: Página, Fuente, Párrafo, Colores y Títulos", async () => {
    await mountBuilder({ template, presets: [] })
    await openDesign()

    expect([...panel().querySelectorAll("[data-ribbon-group]")].map((group) => group.getAttribute("aria-label"))).toEqual(["Página", "Fuente", "Párrafo", "Colores", "Títulos"])
    expect(await options("paper")).toEqual(["Carta", "A4", "Oficio"])
    expect(await options("orientation")).toEqual(["Vertical", "Horizontal"])
    expect(await options("font_family")).toEqual(["Arial", "Calibri", "Times New Roman", "Verdana", "Georgia"])
    expect(await options("body-alignment")).toEqual(["Izquierda", "Centrada", "Derecha", "Justificada"])
    expect(control("line_height")).toMatchObject({ type: "number", min: "1", max: "3" })
    expect(control("paragraph_spacing_pt")).toMatchObject({ type: "number", min: "0", max: "36" })
    expect(control("empty_text").maxLength).toBe(120)
    expect(control("title-text").maxLength).toBe(180)
    for (const key of ["text", "title", "table_header_background", "table_header_text", "table_border", "empty_text"]) expect(control(`colors-${key}`).type).toBe("color")
    openMenu("Página")
    expect(panel().querySelector("#template-layout-margin_cm")).not.toBeNull()
    openMenu("Fuente")
    expect(panel().querySelector("#template-layout-title_font_size")).not.toBeNull()
  })

  it("muestra cada cambio en la hoja al momento", async () => {
    await mountBuilder({ template, presets: [] })
    await openDesign()

    await choose("paper", "A4")
    await choose("font_family", "Georgia")
    await choose("body-alignment", "Justificada")
    await type("line_height", "1.5")
    await type("paragraph_spacing_pt", "12")
    await type("colors-title", "#aa0000")
    openMenu("Títulos")
    await click(panel().querySelector('button[aria-label="Cursiva del título"]'))
    await click(panel().querySelector('button[aria-label="Negrita de los títulos de sección"]'))
    await choose("section_title-alignment", "Centrada")

    expect(sheet().style.getPropertyValue("--document-page-width")).toBe("210mm")
    expect(sheet().style.getPropertyValue("--document-font")).toMatch(/^Georgia,/)
    expect(sheet().style.getPropertyValue("--document-line-height")).toBe("1.5")
    expect(sheet().style.getPropertyValue("--document-paragraph-spacing")).toBe("12pt")
    expect(sheet().style.getPropertyValue("--document-title-color")).toBe("#AA0000")
    expect(sheet().style.textAlign).toBe("justify")
    expect(body().querySelector<HTMLElement>("[data-sheet] .template-sheet-title")!.style.fontStyle).toBe("italic")
    const heading = body().querySelector<HTMLElement>("[data-sheet] [data-section-title]")!
    expect(heading.style.fontWeight).toBe("400")
    expect(heading.style.textAlign).toBe("center")
  })

  it("solo acepta interlineado y espacio dentro del rango permitido", async () => {
    await mountBuilder({ template, presets: [] })
    await openDesign()

    await type("line_height", "4")
    await type("paragraph_spacing_pt", "-2")

    expect(sheet().style.getPropertyValue("--document-line-height")).toBe("1.15")
    expect(sheet().style.getPropertyValue("--document-paragraph-spacing")).toBe("6pt")
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(true)
  })

  it("guarda los estilos con el borrador y deja sin color el encabezado de tabla si se pide", async () => {
    await mountBuilder({ template, presets: [] })
    await openDesign()

    await choose("orientation", "Horizontal")
    await type("colors-text", "#112233")
    openMenu("Colores")
    await click(panel().querySelector('button[aria-label="Sin color: Texto del encabezado"]'))
    await type("empty_text", "Sin información")
    await type("title-text", "SÍLABO NUEVO")
    await choose("title-alignment", "Derecha")
    await click(byText("button", "Guardar"))

    expect(saved().title).toBe("SÍLABO NUEVO")
    expect(saved().layout).toEqual(template.layout)
    expect(saved().document).toEqual({
      paper: "letter",
      orientation: "landscape",
      font_family: "Arial",
      line_height: 1.15,
      paragraph_spacing_pt: 6,
      colors: { text: "#112233", title: "#2F5496", table_header_background: "#C3D4EA", table_header_text: null, table_border: "#333333", empty_text: "#595959" },
      title: { bold: true, italic: false, alignment: "right" },
      section_title: { bold: true, italic: false, alignment: "left" },
      body: { alignment: "left" },
      empty_text: "Sin información",
    })
  })

  it("sin cambios de diseño guarda el mismo documento que ya tenía", async () => {
    await mountBuilder({ template, presets: [] })
    fireEvent.change(body().querySelector('[aria-label="Nombre del campo Primero"]')!, { target: { value: "Otro" } })
    await settle()
    await click(byText("button", "Guardar"))

    const current = definition.document
    expect(saved().document).toEqual({
      paper: current.paper,
      orientation: current.orientation,
      font_family: current.font_family,
      line_height: current.line_height,
      paragraph_spacing_pt: current.paragraph_spacing_pt,
      colors: current.colors,
      title: { bold: current.title.bold, italic: current.title.italic, alignment: current.title.alignment },
      section_title: current.section_title,
      body: current.body,
      empty_text: current.empty_text,
    })
  })
})
