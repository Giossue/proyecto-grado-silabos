import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TemplatePayload } from "@/api/template"
import { body, chooseEditability, click, mountBuilder, selectField, settle } from "@/components/domain/configuration/templateBuilderTesting"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

vi.mock("@/api/template")

type Template = NonNullable<TemplatePayload["template"]>
const plain: DocumentNode = { type: "doc", content: [{ type: "paragraph" }] }
const fixed: DocumentNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto fijo" }] }] }
const template = (limit?: number): Template => ({
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  sections: [{ id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [
    { id: "f1", key: "descripcion", label: "Descripción", quien_llena: "carrera", content: plain, ...(limit ? { max_length: limit } : {}) },
    { id: "f2", key: "etica", label: "Ética", quien_llena: "institucional", content: fixed },
  ] }],
})

const tool = () => body().querySelector<HTMLButtonElement>("[data-field-limit-tool]")!
const type = async (value: string) => {
  fireEvent.change(body().querySelector<HTMLInputElement>("[data-field-limit-input]")!, { target: { value } })
  await settle()
}
const responsible = async (choice: "Editable" | "No editable") => {
  await chooseEditability(choice)
}

describe("Límite de caracteres en el editor de la plantilla", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("con un campo editable elegido, «Límite de caracteres» pone el límite y lo muestra bajo el campo", async () => {
    const { payload } = await mountBuilder({ template: template() })
    expect(body().querySelector("[data-field-limit-tool]")).toBeNull()
    await selectField("f1")
    expect(tool().disabled).toBe(false)
    await click(tool())
    for (const wrong of ["", "0", "50001", "cien"]) {
      await type(wrong)
      await click(body().querySelector("[data-field-limit-apply]"))
      expect(body().querySelector("[data-field-limit-error]")!.textContent).toContain("Escriba un número entre 1 y 50 000")
    }
    expect(payload().sections[0]!.fields[0]).not.toHaveProperty("max_length")
    await type("500")
    await click(body().querySelector("[data-field-limit-apply]"))

    expect(payload().sections[0]!.fields[0]!.max_length).toBe(500)
    expect(body().querySelector('[data-field-limit="f1"]')!.textContent).toBe("Hasta 500 caracteres")
  })

  it("«Quitar límite» lo quita y un campo no editable no admite límite", async () => {
    const { payload } = await mountBuilder({ template: template(800) })
    expect(body().querySelector('[data-field-limit="f1"]')!.textContent).toBe("Hasta 800 caracteres")
    await selectField("f2")
    expect(body().querySelector("[data-field-limit-tool]")).toBeNull()

    await selectField("f1")
    await click(tool())
    expect(body().querySelector<HTMLInputElement>("[data-field-limit-input]")!.value).toBe("800")
    await click(body().querySelector("[data-field-limit-remove]"))

    expect(payload().sections[0]!.fields[0]).not.toHaveProperty("max_length")
    expect(body().querySelector('[data-field-limit="f1"]')).toBeNull()
    expect(payload().sections[0]!.fields[1]).not.toHaveProperty("max_length")
  })

  it("al volver No editable un campo con límite se le quita el límite", async () => {
    const { payload } = await mountBuilder({ template: template(800) })
    await selectField("f1")
    await responsible("No editable")

    expect(payload().sections[0]!.fields[0]!.quien_llena).toBe("institucional")
    expect(payload().sections[0]!.fields[0]).not.toHaveProperty("max_length")
    expect(body().querySelector('[data-field-limit="f1"]')).toBeNull()

    await responsible("Editable")
    expect(payload().sections[0]!.fields[0]!.quien_llena).toBe("carrera")
  })
})
