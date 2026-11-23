import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CurriculumActions } from "@/components/domain/academic/CurriculumActions"
import { renderWithProviders } from "@/test/render"

describe("CurriculumActions", () => {
  it("deshabilita la configuración mientras la malla está bloqueada", () => {
    const onConfigure = vi.fn()
    renderWithProviders(
      <CurriculumActions curriculum={{ id: "curriculum-1", cycle_count: 8, editable: true, lock_reason: "Convocatoria activa" }} onConfigure={onConfigure} />,
    )

    const button = screen.getByRole("button", { name: "Configurar ciclos" })
    expect(button.textContent).toBe("")
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(onConfigure).not.toHaveBeenCalled()
  })

  it("sin bloqueo abre la configuración", () => {
    const onConfigure = vi.fn()
    renderWithProviders(<CurriculumActions curriculum={{ id: "curriculum-1", cycle_count: 8, editable: true, lock_reason: null }} onConfigure={onConfigure} />)

    fireEvent.click(screen.getByRole("button", { name: "Configurar ciclos" }))
    expect(onConfigure).toHaveBeenCalledTimes(1)
  })
})
