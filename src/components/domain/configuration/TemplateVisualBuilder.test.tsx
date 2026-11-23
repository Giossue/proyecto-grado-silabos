import { act, fireEvent, render } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as templateApi from "@/api/template"
import { ApiError } from "@/api/client"
import type { TemplatePayload } from "@/api/template"
import { TemplateVisualBuilder, type TemplateVisualBuilderHandle } from "@/components/domain/configuration/TemplateVisualBuilder"
import { body, byLabel, byText, chooseMenuItem, click, menuItems, mountBuilder, press, selectField, selectSection, settle, startEditing, typeInto } from "@/components/domain/configuration/templateBuilderTesting"
import { emptyDocument, type FieldResponsible } from "@/types/configuration"
import type { DocumentNode } from "@/lib/templateDocument"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { TemplateDefinitionPayload } from "@/lib/blocks/types"
import definition from "@/test/fixtures/template-definition.json"
import { typeConfirmation } from "@/test/confirmPhrase"
import { templateEditorState } from "@/state/templateEditor"

vi.mock("@/api/template")

type Template = NonNullable<TemplatePayload["template"]>
const field = (id: string, label: string, quien_llena: FieldResponsible = "carrera") => ({ id, key: id, label, quien_llena, content: emptyDocument() })
const template: Template = {
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  sections: [
    { id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [field("f1", "Primero"), field("f2", "Segundo", "institucional")] },
    { id: "s2", key: "dos", title: "Dos", orientation: "portrait", fields: [] },
  ],
}

const presets = [
  { key: "identificacion" as const, field_key: "asignatura", label: "Datos de identificación", quien_llena: "institucional" as FieldResponsible, content: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Dato" }] }] }] }] }] } as DocumentNode },
  { key: "planificacion" as const, field_key: "unidades", label: "Unidades", quien_llena: "carrera" as FieldResponsible, content: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Dato" }] }] }] }] }] } as DocumentNode },
]
const advancedItems = async (): Promise<string[]> => {
  await press(byLabel("Opciones avanzadas"))
  return menuItems().map((item) => item.textContent!.trim())
}
const responsibleMenu = async (label: string, choice: string): Promise<void> => {
  await press(byLabel(`Si se puede editar el campo ${label}`))
  await chooseMenuItem(choice)
}

const keepClosingDialogs = (): void => {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = real(element, pseudo)
    return new Proxy(style, { get: (target, key) => (key === "animationName" && element.getAttribute("data-state") === "closed" ? "exit" : Reflect.get(target, key)) })
  })
}
const closingDialog = (): HTMLElement | null => body().querySelector<HTMLElement>('[role="dialog"][data-state="closed"]')

describe("TemplateVisualBuilder", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.mocked(templateApi.importTemplateJson).mockResolvedValue({ message: "ok" })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("muestra cada sección y cada campo editables sobre la hoja, sin modales", async () => {
    await mountBuilder({ template, presets })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(body().querySelector<HTMLTextAreaElement>('[aria-label="Sección Uno"]')!.value).toBe("Uno")
    expect(body().querySelector<HTMLTextAreaElement>('[aria-label="Nombre del campo Primero"]')!.value).toBe("Primero")
    expect(body().querySelectorAll("[data-field-editor]")).toHaveLength(2)
    expect(body().querySelector('[role="dialog"]')).toBeNull()
    expect(body().querySelector('[aria-label="Contenido de Primero"]')).toBeTruthy()
  })

  const save = async () => { await click(byText("button", "Guardar")) }
  const saved = () => vi.mocked(templateApi.importTemplateJson).mock.calls[0]![1] as { version: number; sections: Array<{ key: string; title: string; orientation: string; fields: Array<{ key: string; label: string; quien_llena: string; content: unknown }> }> }

  it("no guarda nada mientras se edita: solo al pulsar Guardar", async () => {
    await mountBuilder({ template, presets })
    await typeInto("Nombre del campo Primero", "Primer campo")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
    await save()
    expect(templateApi.importTemplateJson).toHaveBeenCalledTimes(1)
    expect(templateApi.importTemplateJson).toHaveBeenCalledWith("t1", expect.objectContaining({ version: 1 }))
    expect(saved().sections[0]!.fields[0]).toMatchObject({ key: "f1", label: "Primer campo", quien_llena: "carrera" })
  })

  it("aplica márgenes y tamaños del diseño a la hoja y los guarda con la plantilla", async () => {
    const options = { margins: [{ value: 1.5, label: "1,5 cm" }, { value: 2.5, label: "2,5 cm" }], title_sizes: [{ value: 14, label: "14 pt" }], section_sizes: [{ value: 11, label: "11 pt" }], body_sizes: [{ value: 11, label: "11 pt" }, { value: 12, label: "12 pt" }] }
    const designed = { ...template, layout: { margin_cm: 1.5, title_font_size: 14, section_font_size: 11, body_font_size: 11 }, layoutOptions: options }
    const { handle } = await mountBuilder({ template: designed, presets }, { edit: false })
    expect(body().querySelector<HTMLElement>("[data-sheet]")!.style.getPropertyValue("--document-margin")).toBe("1.5cm")
    await startEditing(handle)
    expect(byLabel("Diseño")).toBeNull()
    expect(byLabel("Listas")).toBeNull()
    expect(await advancedItems()).toContain("Diseño")
    await chooseMenuItem("Diseño")
    expect(body().querySelector('[role="dialog"]')!.textContent).toContain("Márgenes y tamaños del documento")
    expect(body().querySelector("#template-layout-margin_cm")).toBeTruthy()
    const choose = async (id: string, label: string) => {
      await press(body().querySelector(`#${id}`))
      await press([...body().querySelectorAll('[role="option"]')].find((option) => option.textContent?.trim() === label))
    }
    await choose("template-layout-margin_cm", "2,5 cm")
    await choose("template-layout-body_font_size", "12 pt")
    expect(body().querySelector<HTMLElement>("[data-sheet]")!.style.getPropertyValue("--document-margin")).toBe("2.5cm")
    expect(body().querySelector<HTMLElement>("[data-sheet]")!.style.getPropertyValue("--document-body-size")).toBe("12pt")
    await click(byText("button", "Cerrar"))
    await save()
    expect((saved() as unknown as { layout: unknown }).layout).toEqual({ margin_cm: 2.5, title_font_size: 14, section_font_size: 11, body_font_size: 12 })
  })

  it("Guardar queda deshabilitado mientras no haya cambios", async () => {
    await mountBuilder({ template, presets })
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(true)
    await typeInto("Nombre del campo Primero", "X")
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(false)
  })

  it("avisa que hay cambios sin guardar y deja de avisar al cancelar", async () => {
    const { handle, onDirty } = await mountBuilder({ template, presets })
    expect(body().textContent).not.toContain("Sin guardar")
    await typeInto("Nombre del campo Primero", "Cambiado")
    expect(body().textContent).toContain("Sin guardar")
    expect(onDirty).toHaveBeenLastCalledWith(true)
    act(() => handle.current!.leave())
    await settle()
    await click(byText("button", "Volver y descartar cambios"))
    expect(onDirty).toHaveBeenLastCalledWith(false)
  })

  it("Ctrl+S guarda mientras se edita, pero solo si hay cambios", async () => {
    await mountBuilder({ template, presets })
    fireEvent.keyDown(document, { key: "s", ctrlKey: true })
    await settle()
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
    await typeInto("Nombre del campo Primero", "Cambiado")
    fireEvent.keyDown(document, { key: "s", ctrlKey: true })
    await settle()
    expect(templateApi.importTemplateJson).toHaveBeenCalledTimes(1)
  })

  it("permite cambiar el título del documento y lo envía al guardar", async () => {
    await mountBuilder({ template, presets })
    await typeInto("Título del documento", "SÍLABO UEB")
    await save()
    expect(templateApi.importTemplateJson).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: "SÍLABO UEB" }))
  })

  it("volver pide confirmar, descarta los cambios y vuelve a la vista", async () => {
    const { handle } = await mountBuilder({ template, presets })
    await typeInto("Nombre del campo Primero", "Cambiado")
    act(() => handle.current!.leave())
    await settle()
    expect(body().textContent).toContain("Hay cambios sin guardar")
    await click(byText("button", "Volver y descartar cambios"))
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
    expect(body().querySelector("[data-template-ribbon]")).toBeNull()
    expect(body().textContent).not.toContain("Cambiado")
  })

  it("la cinta queda fija: sin selección no ofrece formato ni herramientas del campo", async () => {
    await mountBuilder({ template, presets })
    expect(body().querySelector("[data-template-ribbon]")).toBeTruthy()
    expect(body().querySelector<HTMLButtonElement>('[aria-label="Negrita"]')!.disabled).toBe(true)
    expect(body().querySelector('[aria-label="Si se puede editar el campo Primero"]')).toBeNull()
    expect(body().querySelector('[data-field="f1"] [role="toolbar"]')).toBeNull()
    await selectField("f1")
    expect(body().querySelector<HTMLButtonElement>('[aria-label="Negrita"]')!.disabled).toBe(false)
    expect(body().querySelector('[aria-label="Si se puede editar el campo Primero"]')).toBeTruthy()
    expect(body().querySelector('[data-field="f1"] [role="toolbar"]')).toBeNull()
  })

  it("la cinta ofrece el tipo de respuesta en un campo editable y no en uno No editable", async () => {
    await mountBuilder({ template, presets })
    expect(body().querySelector<HTMLButtonElement>('[aria-label="Tipo de respuesta"]')!.disabled).toBe(true)
    await selectField("f1")
    expect(body().querySelector<HTMLButtonElement>('[aria-label="Tipo de respuesta"]')!.disabled).toBe(false)
    await selectField("f2")
    expect(body().querySelector<HTMLButtonElement>('[aria-label="Tipo de respuesta"]')!.disabled).toBe(true)
  })

  it("cambia si el campo se puede editar desde la cinta y lo guarda con el botón", async () => {
    await mountBuilder({ template, presets })
    await selectField("f1")
    expect(body().querySelector('[aria-label="Si se puede editar el campo Primero"]')!.textContent).toContain("Editable")
    await responsibleMenu("Primero", "No editable")
    await save()
    expect(saved().sections[0]!.fields[0]!.quien_llena).toBe("institucional")
  })

  it("aplica una plantilla lista: solo copia su contenido y quién lo llena al campo", async () => {
    await mountBuilder({ template, presets })
    await selectField("f1")
    await press(byLabel("Si se puede editar el campo Primero"))
    await click(menuItems().find((item) => item.textContent?.trim() === "Plantilla"))
    await chooseMenuItem("Datos de identificación")
    await save()
    expect(saved().sections[0]!.fields[0]).toMatchObject({ key: "f1", label: "Primero", quien_llena: "institucional" })
    expect(JSON.stringify(saved().sections[0]!.fields[0]!.content)).toContain("Dato")
  })

  it("el campo con contenido de plantilla se sigue editando como cualquier otro", async () => {
    await mountBuilder({ template, presets })
    await selectField("f1")
    await press(byLabel("Si se puede editar el campo Primero"))
    await click(menuItems().find((item) => item.textContent?.trim() === "Plantilla"))
    await chooseMenuItem("Datos de identificación")
    expect(body().querySelector<HTMLTextAreaElement>('[aria-label="Nombre del campo Primero"]')!.disabled).toBe(false)
    expect(body().querySelector('[aria-label="Ayuda del campo Primero"]')).toBeNull()
  })

  it("agrega el campo vacío donde se pasó el cursor, sin llamar al servidor hasta guardar", async () => {
    await mountBuilder({ template, presets })
    const points = [...body().querySelectorAll<HTMLElement>("[data-insert-point] button")].filter((element) => element.textContent?.trim() === "Agregar campo")
    await click(points[1])
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
    await save()
    expect(saved().sections[0]!.fields.map((item) => item.key)).toEqual(["f1", "campo", "f2"])
    expect(saved().sections[0]!.fields[1]).toMatchObject({ quien_llena: "carrera", label: "", content: emptyDocument() })
  })

  it("agrega una sección «Nueva sección» y avisa del cambio al guardar", async () => {
    const { onChanged } = await mountBuilder({ template, presets })
    await click(body().querySelector('[aria-label="Nueva sección"]'))
    await save()
    expect(saved().sections.map((item) => item.title)).toContain("Nueva sección")
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it("renombra la sección y cambia su orientación", async () => {
    await mountBuilder({ template, presets })
    await typeInto("Sección Uno", "Uno bis")
    await selectSection("Uno bis")
    await click(body().querySelector('[aria-label="Orientación de la sección Uno bis"]'))
    await save()
    expect(saved().sections[0]).toMatchObject({ title: "Uno bis", orientation: "landscape" })
  })

  it("reordena secciones y campos subiendo y bajando", async () => {
    await mountBuilder({ template, presets })
    await selectField("f2")
    await click(body().querySelector('[aria-label="Subir el campo Segundo"]'))
    expect(body().querySelector<HTMLButtonElement>('[aria-label="Subir el campo Segundo"]')!.disabled).toBe(true)
    await selectSection("Uno")
    await click(body().querySelector('[aria-label="Bajar la sección Uno"]'))
    expect(body().querySelector<HTMLButtonElement>('[aria-label="Subir la sección Uno"]')!.disabled).toBe(false)
    await save()
    expect(saved().sections.map((item) => item.key)).toEqual(["dos", "uno"])
    expect(saved().sections[1]!.fields.map((item) => item.key)).toEqual(["f2", "f1"])
  })

  it("elimina campos y secciones solo tras confirmar", async () => {
    await mountBuilder({ template, presets })
    await selectField("f1")
    await click(body().querySelector('[aria-label="Eliminar el campo Primero"]'))
    expect(body().querySelector('[aria-label="Nombre del campo Primero"]')).not.toBeNull()
    await click(byText("button", "Eliminar"))
    expect(body().querySelector('[aria-label="Nombre del campo Primero"]')).toBeNull()
    await selectSection("Uno")
    await click(body().querySelector('[aria-label="Eliminar la sección Uno"]'))
    expect(body().textContent).toContain("con sus 1 campos")
    await click(byText("button", "Eliminar"))
    await save()
    expect(saved().sections.map((item) => item.key)).toEqual(["dos"])
  })

  it("muestra el mensaje del servidor cuando no se pudo guardar y sigue en edición", async () => {
    vi.mocked(templateApi.importTemplateJson).mockRejectedValue(new ApiError("Hay un proceso abierto: pause la convocatoria", 409))
    await mountBuilder({ template, presets })
    await typeInto("Nombre del campo Primero", "X")
    await save()
    expect(body().textContent).toContain("Hay un proceso abierto: pause la convocatoria")
    expect(byText("button", "Guardar")).toBeTruthy()
  })

  it("con un proceso abierto no deja entrar a editar", async () => {
    const { handle } = await mountBuilder({ template, presets, processLock: "proceso" })
    act(() => handle.current!.askEdit())
    await settle()
    expect(byText("button", "Continuar")).toBeUndefined()
    expect(body().querySelector('[aria-label="Sección Uno"]')).toBeNull()
  })

  it("empieza en vista y solo muestra los controles de edición tras pulsar Editar", async () => {
    const { handle } = await mountBuilder({ template, presets }, { edit: false })
    expect(body().querySelector('[aria-label="Sección Uno"]')).toBeNull()
    expect(body().textContent).toContain("Uno")
    await startEditing(handle)
    expect(body().querySelector('[aria-label="Sección Uno"]')).not.toBeNull()
    expect(byText("button", "Guardar")).toBeTruthy()
    expect(byText("button", "Cancelar")).toBeFalsy()
  })

  it("al editar pide la pantalla completa y la suelta al volver", async () => {
    const { handle, onEditing } = await mountBuilder({ template, presets }, { edit: false })
    expect(templateEditorState.open.value).toBe(false)
    await startEditing(handle)
    expect(templateEditorState.open.value).toBe(true)
    expect(onEditing).toHaveBeenLastCalledWith(true)
    act(() => handle.current!.leave())
    await settle()
    expect(templateEditorState.open.value).toBe(false)
  })

  it("dibuja la tabla de identificación sin subtitular los campos sin nombre", async () => {
    const table: DocumentNode = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content: [{ type: "text", text: "FACULTAD: CIENCIAS" }] }] }] }] }] }
    const official: Template = { ...template, sections: [{ id: "s1", key: "identificacion", title: "Identificación Institucional", orientation: "portrait", fields: [{ ...field("a", "", "institucional"), content: table }] }] }
    await mountBuilder({ template: official })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(body().querySelector('[data-field="a"] table')?.textContent).toContain("FACULTAD: CIENCIAS")
    expect(body().querySelector('[aria-label="Nombre del campo Campo sin nombre"]')).toBeNull()
    await selectField("a")
    await press(byLabel("Si se puede editar el campo Campo sin nombre"))
    await chooseMenuItem("Ponerle nombre")
    expect(body().querySelector<HTMLTextAreaElement>('[aria-label="Nombre del campo Campo sin nombre"]')!.value).toBe("")
  })

  it("en la vista muestra el título y los logos sin controles de edición", async () => {
    await mountBuilder({ template, logos: { institution: "/institution.png", faculty: "/faculty.png", institution_size: { width: 120, height: 40 }, faculty_size: { width: 120, height: 40 } } }, { edit: false })
    expect(body().querySelector("h2")?.textContent).toBe("SÍLABO")
    expect(body().querySelectorAll("header img")).toHaveLength(2)
    expect(body().textContent).not.toContain("Editar título")
    expect(body().textContent).not.toContain("Cambiar logo")
  })

  it("las listas (unidades y semanas) ya no se configuran desde la plantilla", async () => {
    setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, {})
    await mountBuilder({ template, presets })
    expect(await advancedItems()).not.toContain("Listas")
    expect(body().textContent).not.toContain("Empieza con")
  })

  it("al eliminar una sección, el modal sigue diciendo qué sección mientras se cierra", async () => {
    keepClosingDialogs()
    await mountBuilder({ template, presets })
    await selectSection("Uno")
    await click(body().querySelector('[aria-label="Eliminar la sección Uno"]'))
    await click([...body().querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"] button')].find((element) => element.textContent?.trim() === "Eliminar"))

    const closing = [...body().querySelectorAll<HTMLElement>('[role="dialog"][data-state="closed"]')].find((element) => element.textContent?.includes("Eliminar"))!
    expect(closing.textContent).toContain("Eliminar sección")
    expect(closing.textContent).toContain("Se quitará «Uno» con sus 2 campos")
  })

  it("la frase para editar se borra al volver a abrir el aviso, no mientras se cierra", async () => {
    keepClosingDialogs()
    const handle = createRef<TemplateVisualBuilderHandle>()
    render(<TemplateVisualBuilder ref={handle} template={template} presets={presets} />)
    await settle()
    act(() => handle.current!.askEdit())
    await settle()
    typeConfirmation("template-edit-confirm", "editar plantilla")
    await settle()
    await click(byText("button", "Cancelar"))

    expect(closingDialog()?.querySelector<HTMLInputElement>("#template-edit-confirm")?.value).toBe("editar plantilla")
    act(() => handle.current!.askEdit())
    await settle()
    expect(body().querySelector<HTMLInputElement>('[role="dialog"][data-state="open"] #template-edit-confirm')?.value).toBe("")
  })
})
