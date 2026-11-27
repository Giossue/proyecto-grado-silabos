import { act, fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import * as templateApi from "@/api/template"
import type { TemplatePayload } from "@/api/template"
import { body, byLabel, byText, chooseFiller, click, mountBuilder, selectField, settle } from "@/components/domain/configuration/templateBuilderTesting"
import { toast } from "@/lib/toast"
import { emptyDocument, type FieldResponsible } from "@/types/configuration"

vi.mock("@/api/template")
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PROTECTED = "Tiene datos de estudiantes con discapacidad"
const UNSAVED = "Guarde la plantilla para activarlo"
const NOBODY = "Nadie lo llena: la IA no lo lee"

type Template = NonNullable<TemplatePayload["template"]>
const field = (id: string, key: string, label: string, quien_llena: FieldResponsible = "carrera") => ({ id, key, label, quien_llena, content: emptyDocument() })
const template: Template = {
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  sections: [{ id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [
    field("f1", "descripcion", "Descripción"),
    field("f2", "asignatura", "Identificación"),
    field("f3", "evaluacion", "Evaluación", "institucional"),
    field("f4", "campo", "Anexo"),
  ] }],
}

let allowed: Set<string>
const entries = (): templateApi.TemplateAiPermission[] => template.sections[0]!.fields.map((item) => {
  const blocked = item.id === "f2" ? `${PROTECTED}.` : item.id === "f3" ? `${NOBODY}.` : null
  return { id: item.id, key: item.key, readable: blocked === null && allowed.has(item.id), blocked_reason: blocked }
})

const switches = (): HTMLButtonElement[] => [...body().querySelectorAll<HTMLButtonElement>('[role="switch"]')]
const aiSwitch = (): HTMLButtonElement => switches()[0]!
const checked = (): string | null => aiSwitch().getAttribute("aria-checked")
const description = (): string => (aiSwitch().getAttribute("aria-describedby") ?? "").split(" ").map((id) => (id ? (document.getElementById(id)?.textContent ?? "") : "")).join(" ").trim()
const state = () => ({ checked: checked(), disabled: aiSwitch().disabled, description: description() })
const ribbonGroups = (): string[] => [...body().querySelectorAll('[role="tabpanel"][data-state="active"] [data-ribbon-group]')].map((group) => group.getAttribute("aria-label")!)

describe("«La IA puede leerlo» en el editor de la plantilla", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    allowed = new Set(["f1"])
    vi.mocked(templateApi.getTemplateAiPermissions).mockImplementation(async () => ({ fields: entries() }))
    vi.mocked(templateApi.setTemplateAiPermission).mockImplementation(async (_templateId, fieldId, readable) => {
      if (readable) allowed.add(fieldId)
      else allowed.delete(fieldId)
      return { message: readable ? "La IA ya puede leer este campo." : "La IA ya no lee este campo.", field: entries().find((item) => item.id === fieldId)! }
    })
  })

  it("pone un solo interruptor junto a «¿Quién lo llena?» con lo que guarda el servidor", async () => {
    await mountBuilder({ template })
    await selectField("f1")

    expect(switches()).toHaveLength(1)
    expect(body().querySelector(`label[for="${aiSwitch().id}"]`)!.textContent).toBe("La IA puede leerlo")
    expect(ribbonGroups().slice(0, 3)).toEqual(["Nombre", "¿Quién lo llena?", "Asistente del docente"])
    expect(state()).toEqual({ checked: "true", disabled: false, description: "" })
    expect(templateApi.getTemplateAiPermissions).toHaveBeenCalledWith("t1")

    await selectField("f4")
    expect(state()).toEqual({ checked: "false", disabled: false, description: "" })
  })

  it("se guarda al instante, sin «Guardar» ni cambios pendientes en la plantilla", async () => {
    const builder = await mountBuilder({ template })
    await selectField("f4")

    await click(aiSwitch())
    expect(templateApi.setTemplateAiPermission).toHaveBeenLastCalledWith("t1", "f4", true)
    expect(checked()).toBe("true")
    expect(toast.success).toHaveBeenLastCalledWith("La IA ya puede leer este campo.")

    await click(aiSwitch())
    expect(templateApi.setTemplateAiPermission).toHaveBeenLastCalledWith("t1", "f4", false)
    expect(checked()).toBe("false")

    expect(templateApi.importTemplateJson).not.toHaveBeenCalled()
    expect(byText("button", "Guardar")!.hasAttribute("disabled")).toBe(true)
    expect(builder.onDirty).not.toHaveBeenCalled()
    expect(builder.onChanged).not.toHaveBeenCalled()
  })

  it("mientras guarda no admite otro cambio y, si el servidor lo rechaza, avisa y queda como estaba", async () => {
    let fail: (reason: unknown) => void = () => undefined
    vi.mocked(templateApi.setTemplateAiPermission).mockImplementation(() => new Promise((_resolve, reject) => {
      fail = reject
    }))
    await mountBuilder({ template })
    await selectField("f4")

    await click(aiSwitch())
    expect(aiSwitch().disabled).toBe(true)

    await act(async () => fail(new ApiError("No se pudo", 422, { readable: ["Este campo está bloqueado."] })))
    await settle()
    expect(toast.error).toHaveBeenCalledWith("Este campo está bloqueado")
    expect(state()).toEqual({ checked: "false", disabled: false, description: "" })
  })

  it.each([
    ["f2", PROTECTED],
    ["f3", NOBODY],
  ])("deja apagado y sin uso el campo bloqueado %s, con el motivo", async (id, reason) => {
    allowed = new Set(["f2", "f3"])
    await mountBuilder({ template })
    await selectField(id)

    expect(state()).toEqual({ checked: "false", disabled: true, description: reason })
    fireEvent.click(aiSwitch())
    await settle()
    expect(templateApi.setTemplateAiPermission).not.toHaveBeenCalled()
  })

  it("sigue a «¿Quién lo llena?» del borrador y pide guardar cuando la plantilla guardada todavía dice «Nadie»", async () => {
    await mountBuilder({ template })
    await selectField("f1")
    await chooseFiller("Nadie (texto fijo)")
    expect(state()).toEqual({ checked: "false", disabled: true, description: NOBODY })

    await selectField("f3")
    await chooseFiller("Coordinación")
    expect(state()).toEqual({ checked: "false", disabled: true, description: UNSAVED })
  })

  it("no deja activar un campo que todavía no se guarda, ni aunque repita la clave de uno borrado", async () => {
    allowed = new Set(["f4"])
    const builder = await mountBuilder({ template })
    await selectField("f4")
    await click(byLabel("Duplicar el campo Anexo"))
    expect(state()).toEqual({ checked: "false", disabled: true, description: UNSAVED })
    expect(builder.payload().new_fields).toEqual(["campo_2"])
    expect(templateApi.setTemplateAiPermission).not.toHaveBeenCalled()
  })

  it("al guardar dice qué claves son de campos nuevos, para que no hereden el permiso de uno borrado", async () => {
    vi.mocked(templateApi.importTemplateJson).mockResolvedValue({ message: "ok" })
    vi.mocked(templateApi.getTemplateDraftImpact).mockResolvedValue({ affected: false, in_progress: 0, keep: 0, lose: 0, back_to_draft: 0, careers: [] })
    const builder = await mountBuilder({ template })
    expect(builder.payload()).not.toHaveProperty("new_fields")

    await selectField("f4")
    await click(byLabel("Eliminar el campo Anexo"))
    await click(byText('[role="dialog"] button', "Eliminar"))
    await click([...body().querySelectorAll('button[aria-label="Agregar campo"]')].at(-1))
    await click(byText("button", "Guardar"))

    const saved = vi.mocked(templateApi.importTemplateJson).mock.calls[0]![1] as templateApi.TemplateDraftPayload
    expect(saved.sections[0]!.fields.map((item) => item.key)).toEqual(["descripcion", "asignatura", "evaluacion", "campo"])
    expect(saved.new_fields).toEqual(["campo"])
  })

  it("no deja cambiar nada hasta conocer el permiso y, si no carga, ofrece reintentar", async () => {
    vi.mocked(templateApi.getTemplateAiPermissions).mockRejectedValueOnce(new ApiError("Error", 500))
    await mountBuilder({ template })
    await selectField("f1")

    expect(state()).toEqual({ checked: "false", disabled: true, description: "No se pudo cargar el permiso" })
    await click(byText("button", "Reintentar"))
    expect(state()).toEqual({ checked: "true", disabled: false, description: "" })
  })
})
