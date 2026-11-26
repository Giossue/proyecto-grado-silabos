import { act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as templateApi from "@/api/template"
import { ApiError } from "@/api/client"
import type { TemplateDraftImpact, TemplatePayload } from "@/api/template"
import { body, byText, click, mountBuilder, typeInto } from "@/components/domain/configuration/templateBuilderTesting"
import { locateDraftProblems, problemCount } from "@/components/domain/configuration/templateDraftProblems"
import { emptyDocument } from "@/types/configuration"

vi.mock("@/api/template")

type Template = NonNullable<TemplatePayload["template"]>
const field = (id: string, label: string) => ({ id, key: id, label, quien_llena: "carrera" as const, content: emptyDocument() })
const template: Template = {
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  sections: [
    { id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [field("f1", "Primero"), field("f2", "Segundo")] },
    { id: "s2", key: "dos", title: "Dos", orientation: "portrait", fields: [field("f3", "Tercero")] },
  ],
}
const impact = (changes: Partial<TemplateDraftImpact> = {}): TemplateDraftImpact => ({ affected: true, in_progress: 5, keep: 4, lose: 1, back_to_draft: 2, careers: [
  { name: "Software", in_progress: 3, keep: 2, lose: 1, back_to_draft: 1 },
  { name: "Agronomía", in_progress: 2, keep: 2, lose: 0, back_to_draft: 1 },
], ...changes })

const mountEditing = () => mountBuilder({ template })
const rename = () => typeInto("Sección Uno", "Uno nuevo")
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe("TemplateVisualBuilder: borrador revisado antes de guardar", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.mocked(templateApi.importTemplateJson).mockResolvedValue({ message: "ok" })
    vi.mocked(templateApi.checkTemplateDraft).mockResolvedValue({ problems: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("antes de guardar avisa cuántos sílabos cambian y guarda solo al confirmar", async () => {
    vi.mocked(templateApi.getTemplateDraftImpact).mockResolvedValue(impact())
    await mountEditing()
    await rename()

    await click(byText("button", "Guardar"))

    expect(templateApi.getTemplateDraftImpact).toHaveBeenCalledWith("t1", expect.objectContaining({ version: 1, title: "SÍLABO", sections: expect.arrayContaining([expect.objectContaining({ key: "uno", title: "Uno nuevo" })]) }))
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
    const dialog = body().querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.textContent).toContain("Sílabos afectados")
    expect(dialog.textContent).toContain("4 sílabos conservan lo escrito")
    expect(dialog.textContent).toContain("1 sílabo pierde lo escrito en algún campo que cambió")
    expect(dialog.textContent).toContain("2 sílabos enviados o aprobados vuelven a borrador")
    expect(dialog.textContent).toContain("Software: 3 sílabos")
    expect(dialog.textContent).toContain("Agronomía: 2 sílabos")

    await click([...dialog.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cancelar"))
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()

    await click(byText("button", "Guardar"))
    await click([...body().querySelectorAll<HTMLElement>('[role="dialog"] button')].find((button) => button.textContent?.trim() === "Guardar"))
    expect(templateApi.importTemplateJson).toHaveBeenCalledTimes(1)
    expect(vi.mocked(templateApi.importTemplateJson).mock.calls[0]![1]).toEqual(vi.mocked(templateApi.getTemplateDraftImpact).mock.calls[0]![1])
  })

  it("si ningún sílabo cambia, guarda directo como siempre", async () => {
    vi.mocked(templateApi.getTemplateDraftImpact).mockResolvedValue(impact({ affected: false, in_progress: 0, keep: 0, lose: 0, back_to_draft: 0, careers: [] }))
    await mountEditing()
    await rename()

    await click(byText("button", "Guardar"))

    expect(templateApi.importTemplateJson).toHaveBeenCalledTimes(1)
    expect(body().querySelector('[role="dialog"]')).toBeNull()
  })

  it.each([
    ["falla la revisión", () => vi.mocked(templateApi.getTemplateDraftImpact).mockRejectedValue(new Error("Tiempo agotado"))],
    ["el servidor no pudo contar", () => vi.mocked(templateApi.getTemplateDraftImpact).mockResolvedValue(impact({ counted: false, message: "No se pudo calcular qué sílabos cambian ahora.", in_progress: 0, keep: 0, lose: 0, back_to_draft: 0, careers: [] }))],
  ])("si %s, pide confirmar sin conteos y deja guardar", async (_case, arrange) => {
    arrange()
    await mountEditing()
    await rename()

    await click(byText("button", "Guardar"))

    const dialog = body().querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.textContent).toContain("No se pudieron contar los sílabos afectados")
    expect(dialog.textContent).toContain("los enviados o aprobados vuelven a borrador")
    expect(dialog.querySelector("[data-impact-lines]")).toBeNull()
    expect(body().querySelector('[role="alert"]')).toBeNull()
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()

    await click([...dialog.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Guardar de todos modos"))
    expect(templateApi.importTemplateJson).toHaveBeenCalledTimes(1)
  })

  it("si el borrador no se puede guardar, muestra el error sin preguntar", async () => {
    vi.mocked(templateApi.getTemplateDraftImpact).mockRejectedValue(new ApiError("Datos inválidos", 422, { "sections.0.title": ["El título de la sección es obligatorio."] }))
    await mountEditing()
    await rename()

    await click(byText("button", "Guardar"))

    expect(body().querySelector('[role="dialog"]')).toBeNull()
    expect(body().querySelector('[role="alert"]')?.textContent).toContain("El título de la sección es obligatorio")
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
  })

  it("marca en vivo cada problema en su campo o sección y lo cuenta en la cinta", async () => {
    vi.mocked(templateApi.checkTemplateDraft).mockResolvedValue({ problems: [
      { path: "sections.0.fields.1.key", message: "La clave del campo «f2» está repetida.", blocking: true },
      { path: "sections.1", message: "La sección «Dos» no tiene campos; agregue al menos uno o quítela.", blocking: false },
    ] })
    await mountEditing()
    vi.mocked(templateApi.checkTemplateDraft).mockClear()
    await rename()
    await advance(799)
    expect(templateApi.checkTemplateDraft).not.toHaveBeenCalled()

    await advance(1)
    await advance(0)

    expect(templateApi.checkTemplateDraft).toHaveBeenCalledWith("t1", expect.objectContaining({ version: 1 }))
    expect(body().querySelector('[data-field-problems="f2"]')?.textContent).toContain("La clave del campo «f2» está repetida.")
    expect(body().querySelector('[data-field="f2"]')?.getAttribute("data-invalid")).toBe("true")
    expect(body().querySelector('[data-field-problems="f1"]')).toBeNull()
    expect(body().querySelector('[data-section-problems="s2"]')?.textContent).toContain("no tiene campos")
    const count = body().querySelector<HTMLElement>("[data-problems]")!
    expect(count.textContent?.trim()).toBe("2 problemas")
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(false)

    await click(count)
    expect(body().querySelector('[data-field="f2"]')?.className).toContain("outline-primary")
  })

  it("muestra la vista previa del borrador sin guardar y vuelve a editar", async () => {
    const sheets = [{ id: "x1", key: "uno", title: "Uno nuevo", orientation: "portrait" as const, fields: [{ id: "y1", key: "f1", label: "Primero", quien_llena: "carrera" as const, content: emptyDocument() }, { id: "y9", key: "formacion_docente", label: "Formación", quien_llena: "carrera" as const, content: emptyDocument() }] }]
    vi.mocked(templateApi.previewTemplateDraft).mockResolvedValue({ sections: [], sheets })
    await mountEditing()
    await rename()

    await click(body().querySelector('button[aria-label="Vista previa"]'))

    expect(templateApi.previewTemplateDraft).toHaveBeenCalledWith("t1", expect.objectContaining({ sections: expect.arrayContaining([expect.objectContaining({ title: "Uno nuevo" })]) }))
    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
    expect([...body().querySelectorAll("h3[data-section-title]")].map((item) => item.textContent?.trim())).toEqual(["Uno nuevo"])
    expect(body().querySelector("[data-section-heading]")).toBeNull()
    expect(body().querySelector('[data-field="y1"]')).toBeTruthy()
    expect(body().querySelector('[data-field="y9"]')).toBeNull()

    await click(body().querySelector('button[aria-label="Volver a editar"]'))
    expect(body().querySelectorAll("[data-section-heading]")).toHaveLength(2)
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(false)
  })
})

describe("locateDraftProblems", () => {
  it("lleva cada ruta del servidor al campo o a la sección del borrador", () => {
    const sent = [{ id: "s1", fields: ["f1", "f2"] }, { id: "s2", fields: [] }]
    const located = locateDraftProblems([
      { path: "sections.0.fields.1.content", message: "a", blocking: true },
      { path: "sections.1.title", message: "b", blocking: true },
      { path: "sections", message: "c", blocking: false },
      { path: "sections.5.fields.0.key", message: "d", blocking: true },
      { path: "title", message: "e", blocking: true },
    ], sent)

    expect(located.map(({ target, id }) => [target, id])).toEqual([["field", "f2"], ["section", "s2"], ["general", undefined], ["general", undefined], ["general", undefined]])
    expect(problemCount(1)).toBe("1 problema")
    expect(problemCount(3)).toBe("3 problemas")
  })
})
