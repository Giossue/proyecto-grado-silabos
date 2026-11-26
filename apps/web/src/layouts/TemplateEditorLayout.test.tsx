import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TemplateEditorLayout } from "./TemplateEditorLayout"

describe("TemplateEditorLayout", () => {
  it("pinta el editor a pantalla completa sobre el fondo atenuado", () => {
    render(
      <TemplateEditorLayout>
        <p>Editor de la plantilla</p>
      </TemplateEditorLayout>,
    )

    const frame = screen.getByText("Editor de la plantilla").parentElement!
    expect(frame.className).toContain("min-h-dvh")
    expect(frame.className).toContain("bg-muted/30")
  })
})
