import { act, fireEvent, render } from "@testing-library/react"
import type { ComponentType, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CoordinationConvocation } from "@/api/dashboard"
import { ConvocationActions } from "@/components/domain/syllabus/ConvocationActions"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/convocations", () => ({ transitionConvocation: vi.fn() }))

const stubs = vi.hoisted(() => ({ fading: false, close: null as ((open: boolean) => void) | null, opened: null as ((message: string, id: string) => void) | null }))

vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/dialog")>()
  const passthrough = <P extends { children?: ReactNode },>(Original: ComponentType<P>) =>
    function Passthrough(props: P) {
      return stubs.fading ? <div>{props.children}</div> : <Original {...props} />
    }
  function Dialog(props: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }) {
    if (!stubs.fading) return <actual.Dialog {...props} />
    stubs.close = props.onOpenChange ?? null
    return <div data-modal data-state={props.open ? "open" : "closed"}>{props.children}</div>
  }

  return {
    ...actual,
    Dialog,
    DialogContent: passthrough(actual.DialogContent),
    DialogHeader: passthrough(actual.DialogHeader),
    DialogTitle: passthrough(actual.DialogTitle),
    DialogDescription: passthrough(actual.DialogDescription),
    DialogFooter: passthrough(actual.DialogFooter),
    DialogClose: passthrough(actual.DialogClose),
  }
})

vi.mock("@/components/domain/syllabus/ConvocationOpeningDialog", () => ({
  ConvocationOpeningDialog: (props: { onOpened?: (message: string, id: string) => void }) => {
    stubs.opened = props.onOpened ?? null
    return <div />
  },
}))

afterEach(() => {
  document.body.innerHTML = ""
  stubs.fading = false
  stubs.close = null
  stubs.opened = null
  vi.useRealTimers()
})

const openConvocation: CoordinationConvocation = { process_id: "p-1", period: "2026-2027", convocation_id: "c-1", can_open: false, state: "abierto", process_open: true }

describe("ConvocationActions", () => {
  it("al pausar avisa que tampoco se revisan los sílabos enviados", async () => {
    const { container, unmount } = renderWithProviders(<ConvocationActions convocation={openConvocation} />)

    fireEvent.click(container.querySelector("button")!)
    await flush()

    const text = document.body.textContent ?? ""
    expect(text).toContain("Coordinación y Biblioteca no podrán revisar sus sílabos")
    expect(text).not.toContain("la revisión de lo enviado continúa")
    unmount()
  })

  it("al cerrar, el modal de pausar sigue mostrando su contenido mientras se desvanece", async () => {
    stubs.fading = true
    const { container } = renderWithProviders(<ConvocationActions convocation={openConvocation} />)

    fireEvent.click(container.querySelector("button")!)
    act(() => stubs.close?.(false))
    await flush()

    const modal = container.querySelector("[data-modal]")!
    expect(modal.getAttribute("data-state")).toBe("closed")
    expect(modal.textContent).toContain("Pausar el periodo académico")
  })

  it("avisa que abrió el periodo académico cuando el modal de apertura terminó de cerrarse", async () => {
    vi.useFakeTimers()
    stubs.fading = true
    const onChanged = vi.fn()
    render(<ConvocationActions convocation={{ process_id: "p-1", period: "2026-2027", convocation_id: null, can_open: true, state: null, process_open: true }} onChanged={onChanged} />)

    await act(async () => {
      stubs.opened?.("Periodo académico abierto.", "c-1")
      await Promise.resolve()
    })
    expect(onChanged).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(onChanged.mock.calls).toEqual([["Periodo académico abierto."]])
  })
})
