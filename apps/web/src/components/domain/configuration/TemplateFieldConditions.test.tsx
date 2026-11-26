import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TemplatePayload } from "@/api/template"
import { body, byLabel, click, mountBuilder, press, selectField } from "@/components/domain/configuration/templateBuilderTesting"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

vi.mock("@/api/template")

type Template = NonNullable<TemplatePayload["template"]>
const yesNo = [{ const: "o1", title: "Sí" }, { const: "o2", title: "No" }]
const question = (attrs: Record<string, unknown> = {}): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "¿Usa laboratorio? " }, { type: "response", attrs: { kind: "una", options: yesNo, value: null, ...attrs } as never }] }] })
const plain: DocumentNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Técnicas" }] }] }
const template = (first: DocumentNode, show?: { response: string; options: string[] }): Template => ({
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  sections: [{ id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [
    { id: "f1", key: "pregunta", label: "Pregunta", quien_llena: "carrera", content: first },
    { id: "f2", key: "tecnicas", label: "Técnicas", quien_llena: "carrera", content: plain, ...(show ? { show_if: show } : {}) },
  ] }],
})

describe("Mostrar solo si en el editor de la plantilla", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("con un campo elegido, «Mostrar solo si…» lo condiciona a una respuesta anterior y le da identificador a esa respuesta", async () => {
    const { payload } = await mountBuilder({ template: template(question()) })
    expect(body().querySelector("[data-field-condition-tool]")).toBeNull()
    await selectField("f2")
    await click(body().querySelector("[data-field-condition-tool]"))
    await press(body().querySelector("[data-condition-source]"))
    expect([...body().querySelectorAll('[role="option"]')].map((item) => item.textContent?.trim())).toEqual(["Siempre", "Usa laboratorio"])
    await press(body().querySelectorAll('[role="option"]')[1]!)
    expect(body().querySelector("[data-field-condition-error]")!.textContent).toContain("Elija al menos una opción")
    await click(body().querySelector('[data-condition-option="o1"]'))
    await click(body().querySelector("[data-field-condition-apply]"))

    const fields = payload().sections[0]!.fields
    const id = (fields[0]!.content.content![0]!.content![1]!.attrs as { id: string }).id
    expect(id).toMatch(/^r_[a-z0-9]+$/)
    expect(fields[1]!.show_if).toEqual({ response: id, options: ["o1"] })
    expect(fields[0]).not.toHaveProperty("show_if")
    expect(body().querySelector('[data-field-condition="f2"]')!.textContent).toBe("Se muestra solo si «Usa laboratorio» es Sí")
  })

  it("el primer campo no tiene respuestas anteriores, así que no ofrece «Mostrar solo si», y una condición se quita con «Quitar condición»", async () => {
    const { payload } = await mountBuilder({ template: template(question({ id: "usa_lab" }), { response: "usa_lab", options: ["o1"] }) })
    await selectField("f1")
    expect(body().querySelector("[data-field-condition-tool]")).toBeNull()

    await selectField("f2")
    await click(body().querySelector("[data-field-condition-tool]"))
    await click(body().querySelector("[data-field-condition-remove]"))

    expect(payload().sections[0]!.fields[1]).not.toHaveProperty("show_if")
    expect((payload().sections[0]!.fields[0]!.content.content![0]!.content![1]!.attrs as { id: string }).id).toBe("usa_lab")
  })

  it("un campo duplicado recibe identificadores nuevos en sus respuestas", async () => {
    const { payload } = await mountBuilder({ template: template(question({ id: "usa_lab" })) })
    await selectField("f1")
    await click(byLabel("Duplicar el campo Pregunta"))

    const ids = payload().sections[0]!.fields.map((field) => (field.content.content?.[0]?.content?.[1]?.attrs as { id?: string } | undefined)?.id)
    expect(ids[0]).toBe("usa_lab")
    expect(ids[1]).toMatch(/^r_[a-z0-9]+$/)
  })
})
