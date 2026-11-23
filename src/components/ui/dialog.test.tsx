import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type HarnessProps = { onOpenChange: (open: boolean) => void }

const Harness = ({ onOpenChange }: HarnessProps) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogTitle>Editar</DialogTitle>
      <input aria-label="Nombre" />
    </DialogContent>
  </Dialog>
)

const WithHeader = ({ onOpenChange }: HarnessProps) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Docente</DialogTitle>
      </DialogHeader>
      <input aria-label="Nombre" />
    </DialogContent>
  </Dialog>
)

const dialogInput = () =>
  document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!

const closeButtons = () =>
  document.body.querySelectorAll<HTMLButtonElement>(
    '[data-slot="dialog-close-x"]'
  )

describe("DialogContent", () => {
  afterEach(cleanup)

  it("cierra con Escape aunque el foco esté en un campo sin cambios", () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    const input = dialogInput()
    input.focus()

    fireEvent.keyDown(input, { key: "Escape" })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("no cierra con Escape si hay cambios sin guardar", () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    const input = dialogInput()
    input.focus()
    fireEvent.input(input, { target: { value: "Borrador" } })

    fireEvent.keyDown(input, { key: "Escape" })

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("ofrece una X para cerrar arriba a la derecha", () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    const close = closeButtons()[0]!
    expect(close.textContent).toContain("Cerrar")

    fireEvent.click(close)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each([
    ["sin encabezado", Harness],
    ["con encabezado", WithHeader],
  ])("%s, la X va en la misma línea del título y hay una sola", (_name, Component) => {
    const onOpenChange = vi.fn()
    render(<Component onOpenChange={onOpenChange} />)

    const closes = closeButtons()
    expect(closes).toHaveLength(1)
    expect(
      closes[0]!
        .closest('[data-slot="dialog-title-row"]')
        ?.querySelector('[data-slot="dialog-title"]')?.textContent
    ).toMatch(/Editar|Docente/)

    fireEvent.click(closes[0]!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each([
    ["sin encabezado", Harness],
    ["con encabezado", WithHeader],
  ])("la X %s muestra el tooltip «Cerrar»", (_name, Component) => {
    render(<Component onOpenChange={vi.fn()} />)
    const close = closeButtons()[0]!
    expect(close.getAttribute("aria-label")).toBe("Cerrar")

    act(() => {
      close.focus()
    })

    expect(
      document.body.querySelector('[data-slot="tooltip-content"]')?.textContent
    ).toContain("Cerrar")
  })

  it("al abrir, el foco va al primer campo y no a la X del título", () => {
    render(<WithHeader onOpenChange={vi.fn()} />)

    expect(document.activeElement?.getAttribute("aria-label")).toBe("Nombre")
  })
})

describe("DialogHeader", () => {
  afterEach(cleanup)

  it("centra el título, pero las listas de la descripción van a la izquierda", () => {
    const { container } = render(
      <DialogHeader>
        <ul>
          <li>Uno</li>
        </ul>
      </DialogHeader>
    )
    const classes = (container.firstElementChild as HTMLElement).classList

    expect(classes).toContain("text-center")
    expect(classes).toContain("[&_ul]:text-left")
    expect(classes).toContain("[&_ol]:text-left")
  })
})
