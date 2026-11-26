import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import * as templateApi from "@/api/template"
import { TemplateJsonDialog } from "@/components/domain/configuration/TemplateJsonDialog"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/template", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/template")>()),
  getTemplateJson: vi.fn(),
  importTemplateJson: vi.fn(),
}))

const sample = { version: 1, sections: [{ key: "uno", title: "Uno", fields: [] }] }
const mountDialog = async (locked = false, unsaved = false) => {
  const onOpenChange = vi.fn()
  const onImported = vi.fn()
  renderWithProviders(<TemplateJsonDialog templateId="t1" locked={locked} unsaved={unsaved} open onOpenChange={onOpenChange} onImported={onImported} />)
  await flush()
  return { onOpenChange, onImported }
}
const area = () => document.body.querySelector<HTMLTextAreaElement>('[aria-label="JSON de la plantilla"]')!
const setText = async (value: string) => {
  fireEvent.change(area(), { target: { value } })
  await flush()
}
const discard = () => document.body.querySelector<HTMLElement>("[data-discard-unsaved]")
const apply = () => [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("Aplicar y reemplazar"))!

describe("TemplateJsonDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(templateApi.getTemplateJson).mockResolvedValue(sample)
    vi.mocked(templateApi.importTemplateJson).mockResolvedValue({ message: "ok" })
  })

  it("carga la plantilla actual como JSON con sangría", async () => {
    await mountDialog()
    expect(templateApi.getTemplateJson).toHaveBeenCalledWith("t1")
    expect(area().value).toBe(JSON.stringify(sample, null, 2))
  })

  it("no envía nada si el JSON tiene un error de sintaxis y lo explica", async () => {
    await mountDialog()
    await setText('{ "version": ')
    fireEvent.click(apply())
    await flush()
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("El JSON no es válido")
  })

  it("aplica el JSON editado, avisa que se importó y cierra", async () => {
    const { onOpenChange, onImported } = await mountDialog()
    const edited = { ...sample, sections: [{ key: "dos", title: "Dos", fields: [] }] }
    await setText(JSON.stringify(edited))
    fireEvent.click(apply())
    await flush()
    expect(templateApi.importTemplateJson).toHaveBeenCalledWith("t1", edited)
    expect(onImported).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it("muestra cada error del servidor con su camino y no cierra", async () => {
    vi.mocked(templateApi.importTemplateJson).mockRejectedValue(new ApiError("Datos inválidos", 422, { "sections.0.fields.1.key": ["La clave está repetida"], "sections.2.orientation": ["No válida"] }))
    const { onImported } = await mountDialog()
    fireEvent.click(apply())
    await flush()
    expect(document.body.textContent).toContain("sections.0.fields.1.key: La clave está repetida")
    expect(document.body.textContent).toContain("sections.2.orientation: No válida")
    expect(document.body.textContent).toContain("no se cambió nada")
    expect(onImported).not.toHaveBeenCalled()
  })

  it("dice que muestra la plantilla guardada y, sin cambios en el editor, no pide confirmar", async () => {
    await mountDialog()
    expect(document.body.textContent).toContain("Muestra la plantilla guardada")
    expect(document.body.textContent).not.toContain("Tiene cambios sin guardar en el editor")
    expect(discard()).toBeNull()
    expect(apply().disabled).toBe(false)
  })

  it("con cambios sin guardar en el editor avisa que se descartan y no aplica hasta confirmarlo", async () => {
    const { onImported } = await mountDialog(false, true)
    expect(document.body.textContent).toContain("Tiene cambios sin guardar en el editor: al aplicar el JSON se descartan.")
    expect(apply().disabled).toBe(true)
    fireEvent.click(apply())
    await flush()
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()

    fireEvent.click(discard()!)
    await flush()
    expect(discard()!.getAttribute("aria-checked")).toBe("true")
    expect(apply().disabled).toBe(false)
    fireEvent.click(apply())
    await flush()
    expect(templateApi.importTemplateJson).toHaveBeenCalledWith("t1", sample)
    expect(onImported).toHaveBeenCalledTimes(1)
  })

  it("bloquea la edición con un proceso abierto", async () => {
    await mountDialog(true)
    expect(area().disabled).toBe(true)
    expect(apply().disabled).toBe(true)
  })
})
