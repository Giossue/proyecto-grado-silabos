import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TemplatePayload } from "@/api/template"
import { TemplateFieldContent } from "@/components/domain/configuration/TemplateFieldContent"
import { body, chooseFiller, mountBuilder, selectField } from "@/components/domain/configuration/templateBuilderTesting"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

vi.mock("@/api/template")

type Template = NonNullable<TemplatePayload["template"]>
const plain: DocumentNode = { type: "doc", content: [{ type: "paragraph" }] }
const template: Template = {
  id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
  sections: [{ id: "s1", key: "uno", title: "Uno", orientation: "portrait", fields: [
    { id: "f1", key: "descripcion", label: "Descripción", quien_llena: "carrera", content: plain, max_length: 80 },
    { id: "f2", key: "conducta", label: "Conducta", quien_llena: "carrera", teacher_only: true, content: plain },
  ] }],
}
const checked = (): string => body().querySelector('[data-field-filler] [data-state="on"]')!.textContent!.trim()

describe("«¿Quién lo llena?» en el editor de la plantilla", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("la etiqueta del campo dice quién lo llena", () => {
    for (const [field, label] of [[template.sections[0]!.fields[0]!, "Coordinación"], [template.sections[0]!.fields[1]!, "Solo el docente"], [{ ...template.sections[0]!.fields[0]!, quien_llena: "institucional" as const }, "Nadie (texto fijo)"]] as const) {
      const view = render(<TemplateFieldContent field={field} />)
      expect(view.container.querySelector("[data-field-responsible]")!.textContent).toBe(label)
      view.unmount()
    }
  })

  it("marca la opción guardada y envía la lista de campos que llena solo el docente", async () => {
    const { payload } = await mountBuilder({ template })
    expect(payload().teacher_fields).toEqual(["conducta"])
    await selectField("f2")
    expect(checked()).toBe("Solo el docente")
    await selectField("f1")
    expect(checked()).toBe("Coordinación")

    await chooseFiller("Solo el docente")
    expect(checked()).toBe("Solo el docente")
    expect(payload().teacher_fields).toEqual(["descripcion", "conducta"])
    expect(payload().sections[0]!.fields[0]).toEqual({ key: "descripcion", label: "Descripción", quien_llena: "carrera", content: plain, max_length: 80 })
  })

  it("«Coordinación» y «Nadie (texto fijo)» sacan el campo de la lista del docente", async () => {
    const { payload } = await mountBuilder({ template })
    await selectField("f2")
    await chooseFiller("Coordinación")
    expect(payload().teacher_fields).toEqual([])
    expect(payload().sections[0]!.fields[1]!.quien_llena).toBe("carrera")
    await chooseFiller("Solo el docente")
    await chooseFiller("Nadie (texto fijo)")
    expect(payload().teacher_fields).toEqual([])
    expect(payload().sections[0]!.fields[1]!.quien_llena).toBe("institucional")
  })

  it("una propuesta del asistente no cambia quién llena los campos que sigue llenando alguien", async () => {
    const { payload, handle } = await mountBuilder({ template })
    const sections = payload().sections
    act(() => handle.current!.applyProposal({ id: "p", status: "pendiente", draft_version: "v", changes: [], changed: { sections: [], fields: [] }, sections }))
    expect(payload().teacher_fields).toEqual(["conducta"])
  })
})
