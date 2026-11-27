import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import definition from "@silabos/shared/test/fixtures/template-definition.json"
import { flush } from "@/test/render"

const field = (inline: DocumentNode[]): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto" }] }, { type: "paragraph", content: inline }] })
const space = (kind: string): DocumentNode => ({ type: "response", attrs: { kind, options: [{ const: "o1", title: "Aula" }], value: null } })

const offered = async (value: DocumentNode, button: string): Promise<string[]> => {
  setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, {})
  const { container } = render(<FieldResponseEditor id="campo" label="Métodos" template={field([])} value={value} career onValueChange={() => undefined} />)
  await flush()
  await vi.waitFor(() => expect(container.querySelector(button)).not.toBeNull())
  fireEvent.click(container.querySelector(button)!)
  await flush()
  return [...document.querySelectorAll('[role="radio"]')].map((item) => item.textContent!.trim())
}

describe("el engranaje del proyecto de carrera", () => {
  it("ofrece «Texto libre» y «Elegir varias»", async () => {
    expect(await offered(field([]), '[role="toolbar"] button[aria-label="Configurar campo"]')).toEqual(["Texto libre", "Elegir varias"])
  })

  it("lo ya guardado con «Elegir una» sigue saliendo con su tipo para cambiar las opciones", async () => {
    expect(await offered(field([space("una")]), '[role="toolbar"] button[aria-label="Configurar campo"]')).toEqual(["Texto libre", "Elegir una", "Elegir varias"])
  })
})
