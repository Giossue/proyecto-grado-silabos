import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { CoordinatorReplacementConfirm } from "@/components/domain/identity/CoordinatorReplacementConfirm"
import { flush, renderWithProviders } from "@/test/render"

const style = document.createElement("style")
style.textContent = '[data-state="closed"] { animation-name: exit; }'

describe("CoordinatorReplacementConfirm", () => {
  beforeAll(() => document.head.append(style))
  afterAll(() => style.remove())

  it("mientras se cierra sigue mostrando el aviso, y al abrir otro lo reemplaza", async () => {
    const handlers = { processing: false, onConfirm: vi.fn(), onCancel: vi.fn() }
    const view = renderWithProviders(<CoordinatorReplacementConfirm message="La carrera ya tiene como coordinador a JUAN." {...handlers} />)
    await flush()
    expect(document.body.textContent).toContain("La carrera ya tiene como coordinador a JUAN.")

    view.rerender(<CoordinatorReplacementConfirm message={null} {...handlers} />)
    await flush()
    expect(document.body.textContent).toContain("La carrera ya tiene como coordinador a JUAN.")

    view.rerender(<CoordinatorReplacementConfirm message="La carrera ya tiene como coordinador a LUIS." {...handlers} />)
    await flush()
    expect(document.body.textContent).toContain("La carrera ya tiene como coordinador a LUIS.")
    expect(document.body.textContent).not.toContain("JUAN")
  })
})
