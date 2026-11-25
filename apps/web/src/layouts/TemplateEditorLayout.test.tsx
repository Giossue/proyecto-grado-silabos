import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TemplateEditorLayout } from "./TemplateEditorLayout"

vi.mock("@/components/domain/PurgeConfirmationDialog", () => ({ PurgeConfirmationDialog: () => <div data-purge-confirmation /> }))

describe("TemplateEditorLayout", () => {
  it("pinta el editor a pantalla completa sobre el fondo atenuado, con la confirmación de purga", () => {
    const { container } = render(
      <TemplateEditorLayout>
        <p>Editor de la plantilla</p>
      </TemplateEditorLayout>,
    )

    const frame = screen.getByText("Editor de la plantilla").parentElement!
    expect(frame.className).toContain("min-h-dvh")
    expect(frame.className).toContain("bg-muted/30")
    expect(container.querySelector("[data-purge-confirmation]")).not.toBeNull()
  })
})
