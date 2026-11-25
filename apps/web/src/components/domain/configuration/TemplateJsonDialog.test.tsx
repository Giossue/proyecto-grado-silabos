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
const mountDialog = async (locked = false) => {
  const onOpenChange = vi.fn()
  const onImported = vi.fn()
  renderWithProviders(<TemplateJsonDialog templateId="t1" locked={locked} open onOpenChange={onOpenChange} onImported={onImported} />)
  await flush()
  return { onOpenChange, onImported }
}
const area = () => document.body.querySelector<HTMLTextAreaElement>('[aria-label="JSON de la plantilla"]')!
const setText = async (value: string) => {
  fireEvent.change(area(), { target: { value } })
  await flush()
}
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

  it("bloquea la edición con un proceso abierto", async () => {
    await mountDialog(true)
    expect(area().disabled).toBe(true)
    expect(apply().disabled).toBe(true)
  })
})
