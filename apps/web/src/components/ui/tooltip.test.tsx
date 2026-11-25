import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const Host = ({ onClick }: { onClick: () => void }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick}>
          Botón
        </button>
      </TooltipTrigger>
      <TooltipContent>Qué hace</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

const press = (button: HTMLElement, ms: number): void => {
  act(() => {
    button.dispatchEvent(
      new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true })
    )
  })
  act(() => {
    vi.advanceTimersByTime(ms)
  })
  act(() => {
    button.dispatchEvent(
      new PointerEvent("pointerup", { pointerType: "touch", bubbles: true })
    )
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
  })
}

describe("Tooltip en pantallas táctiles", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("hover: none"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("un toque corto hace la acción y no muestra el tooltip", () => {
    const onClick = vi.fn()
    render(<Host onClick={onClick} />)

    press(screen.getByRole("button", { name: "Botón" }), 50)

    expect(onClick).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain("Qué hace")
  })

  it("mantener pulsado muestra qué es y no ejecuta la acción", () => {
    const onClick = vi.fn()
    render(<Host onClick={onClick} />)

    press(screen.getByRole("button", { name: "Botón" }), 600)

    expect(onClick).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Qué hace")
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const content = document.querySelector('[data-slot="tooltip-content"]')
    expect(
      content === null || content.getAttribute("data-state") === "closed"
    ).toBe(true)
  })
})
