import { act, fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as templateApi from "@/api/template"
import type { TemplatePayload } from "@/api/template"
import { body, byLabel, byText, click, menuItems, mountBuilder, press, selectField, selectSection, settle, typeInto } from "@/components/domain/configuration/templateBuilderTesting"
import { emptyDocument, type FieldResponsible } from "@/types/configuration"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

vi.mock("@/api/template")

type Template = NonNullable<TemplatePayload["template"]>
const text = (value: string): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] })
const field = (id: string, label: string, quien_llena: FieldResponsible = "carrera", content: DocumentNode = emptyDocument()) => ({ id, key: id, label, quien_llena, content })
const template: Template = {
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  sections: [
    { id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [field("f1", "Primero", "institucional", text("Hola")), field("f2", "Segundo")] },
    { id: "s2", key: "dos", title: "Dos", orientation: "portrait", fields: [] },
  ],
}

const drag = async (handle: string, target: Element, clientY: number) => {
  const grip = byLabel(handle)!
  expect(grip.getAttribute("draggable")).toBe("true")
  fireEvent.dragStart(grip)
  fireEvent.dragOver(target, { clientY })
  fireEvent.drop(target, { clientY })
  fireEvent.dragEnd(grip)
  await settle()
}
const shortcut = async (target: EventTarget, key: string, shiftKey = false) => {
  fireEvent.keyDown(target as Element, { key, ctrlKey: true, shiftKey })
  await settle()
}
const save = async () => { await click(byText("button", "Guardar")) }
type Saved = { sections: Array<{ key: string; title: string; fields: Array<{ key: string; label: string; quien_llena: string; content: unknown }> }> }
const saved = () => vi.mocked(templateApi.importTemplateJson).mock.calls[0]![1] as unknown as Saved
const fieldIds = (sectionId: string) => [...body().querySelectorAll(`[data-section="${sectionId}"] [data-field]`)].map((element) => element.getAttribute("data-field"))

describe("TemplateVisualBuilder: estructura", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.mocked(templateApi.importTemplateJson).mockResolvedValue({ message: "ok" })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("duplica el campo debajo con una clave nueva, el mismo contenido y «(copia)» en el nombre", async () => {
    await mountBuilder({ template })
    await selectField("f1")
    await click(byLabel("Duplicar el campo Primero"))
    await save()
    const fields = saved().sections[0]!.fields
    expect(fields.map((item) => item.key)).toEqual(["f1", "f1_2", "f2"])
    expect(fields[1]).toMatchObject({ label: "Primero (copia)", quien_llena: "institucional", content: text("Hola") })
  })

  it("duplica la sección con todos sus campos y claves nuevas", async () => {
    await mountBuilder({ template })
    await selectSection("Uno")
    await click(byLabel("Duplicar la sección Uno"))
    await save()
    const sections = saved().sections
    expect(sections.map((item) => item.key)).toEqual(["uno", "uno_2", "dos"])
    expect(sections[1]!.title).toBe("Uno (copia)")
    expect(sections[1]!.fields.map((item) => item.key)).toEqual(["f1_2", "f2_2"])
    expect(sections[1]!.fields.map((item) => item.label)).toEqual(["Primero", "Segundo"])
  })

  it("mueve el campo al final de otra sección desde «Mover a…»", async () => {
    await mountBuilder({ template })
    await selectField("f1")
    await press(byLabel("Mover el campo Primero a otra sección"))
    const items = menuItems()
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Dos"])
    await click(items[0])
    await save()
    expect(saved().sections[0]!.fields.map((item) => item.key)).toEqual(["f2"])
    expect(saved().sections[1]!.fields.map((item) => item.key)).toEqual(["f1"])
  })

  it("arrastra un campo para reordenarlo dentro de su sección", async () => {
    await mountBuilder({ template })
    await drag("Arrastrar el campo Segundo", body().querySelector('[data-field="f1"]')!, 0)
    expect(fieldIds("s1")).toEqual(["f2", "f1"])
  })

  it("arrastra un campo a otra sección", async () => {
    await mountBuilder({ template })
    await drag("Arrastrar el campo Primero", body().querySelector('[data-section="s2"]')!, 0)
    expect(fieldIds("s1")).toEqual(["f2"])
    expect(fieldIds("s2")).toEqual(["f1"])
  })

  it("arrastra una sección para cambiar su orden", async () => {
    await mountBuilder({ template })
    await drag("Arrastrar la sección Dos", body().querySelector('[data-section="s1"]')!, 0)
    await save()
    expect(saved().sections.map((item) => item.key)).toEqual(["dos", "uno"])
  })

  it("deshace y rehace cambios de estructura con la cinta y con el teclado", async () => {
    await mountBuilder({ template })
    await selectField("f1")
    await click(byLabel("Duplicar el campo Primero"))
    expect(fieldIds("s1")).toHaveLength(3)
    await click(byLabel("Deshacer"))
    expect(fieldIds("s1")).toEqual(["f1", "f2"])
    await click(byLabel("Rehacer"))
    expect(fieldIds("s1")).toHaveLength(3)
    await shortcut(body(), "z")
    expect(fieldIds("s1")).toEqual(["f1", "f2"])
    await shortcut(body(), "z", true)
    expect(fieldIds("s1")).toHaveLength(3)
    await shortcut(body(), "z")
    await shortcut(body(), "y")
    expect(fieldIds("s1")).toHaveLength(3)
  })

  it("junta en un solo paso lo que se escribe seguido en un título", async () => {
    await mountBuilder({ template })
    await typeInto("Sección Uno", "Uno b")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    await typeInto("Sección Uno b", "Uno bis")
    await shortcut(body(), "z")
    expect(body().querySelector<HTMLTextAreaElement>('[aria-label="Sección Uno"]')!.value).toBe("Uno")
  })

  it("Ctrl+Z dentro del texto de un campo deshace el texto, no la estructura", async () => {
    await mountBuilder({ template })
    await selectField("f1")
    await click(byLabel("Duplicar el campo Primero"))
    await shortcut(body().querySelector('[aria-label="Contenido de Primero"]')!, "z")
    expect(fieldIds("s1")).toHaveLength(3)
  })

  it("al deshacer hasta lo guardado ya no hay cambios sin guardar", async () => {
    await mountBuilder({ template })
    await typeInto("Sección Uno", "Otra")
    await selectSection("Otra")
    await click(byLabel("Orientación de la sección Otra"))
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(false)
    await shortcut(body(), "z")
    await shortcut(body(), "z")
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(true)
    expect(body().querySelector("[data-unsaved]")).toBeNull()
  })

  it("tras deshacer, la selección no apunta a lo que ya no existe", async () => {
    await mountBuilder({ template })
    await selectField("f1")
    await click(byLabel("Duplicar el campo Primero"))
    expect(byLabel("Duplicar el campo Primero (copia)")).toBeTruthy()
    await shortcut(body(), "z")
    expect(body().textContent).toContain("Seleccione un campo")
  })

  it("sube y baja campos y secciones como antes, y se puede deshacer", async () => {
    await mountBuilder({ template })
    await selectField("f2")
    await click(byLabel("Subir el campo Segundo"))
    expect(fieldIds("s1")).toEqual(["f2", "f1"])
    expect(byLabel("Subir el campo Segundo")!.disabled).toBe(true)
    await selectSection("Uno")
    await click(byLabel("Bajar la sección Uno"))
    expect(byLabel("Subir la sección Uno")!.disabled).toBe(false)
    await shortcut(body(), "z")
    await shortcut(body(), "z")
    expect(fieldIds("s1")).toEqual(["f1", "f2"])
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(true)
  })

  it("con un proceso abierto los controles nuevos quedan deshabilitados", async () => {
    const builder = await mountBuilder({ template })
    await selectField("f1")
    await click(byLabel("Duplicar el campo Primero"))
    await builder.rerender({ processLock: "proceso" })
    expect(byLabel("Duplicar el campo Primero (copia)")!.disabled).toBe(true)
    expect(byLabel("Mover el campo Primero (copia) a otra sección")!.disabled).toBe(true)
    expect(byLabel("Arrastrar el campo Primero")!.getAttribute("draggable")).toBe("false")
    expect(byLabel("Arrastrar el campo Primero")!.disabled).toBe(true)
    expect(byLabel("Deshacer")!.disabled).toBe(true)
    await shortcut(body(), "z")
    expect(fieldIds("s1")).toHaveLength(3)
  })
})
