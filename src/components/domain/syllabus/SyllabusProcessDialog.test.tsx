import { act, fireEvent, render } from "@testing-library/react"
import type { ComponentProps, ComponentType, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DatePicker as RealDatePicker } from "@/components/DatePicker"
import { SyllabusProcessDialog } from "@/components/domain/syllabus/SyllabusProcessDialog"
import { sessionState } from "@/state/session"
import { typeConfirmation } from "@/test/confirmPhrase"
import { flush } from "@/test/render"

type PickerProps = ComponentProps<typeof RealDatePicker>

const stubs = vi.hoisted(() => ({
  fading: false,
  handlers: new WeakMap<Element, (open: boolean) => void>(),
  pickers: new Map<string, PickerProps>(),
}))

const api = vi.hoisted(() => ({ createProcess: vi.fn() }))
vi.mock("@/api/processes", async (importOriginal) => ({ ...(await importOriginal<object>()), createProcess: api.createProcess }))

vi.mock("@/components/DatePicker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/DatePicker")>()

  return {
    DatePicker: (props: PickerProps) => {
      stubs.pickers.set(props.id, props)
      return <actual.DatePicker {...props} />
    },
  }
})

vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/dialog")>()
  const passthrough = <P extends { children?: ReactNode },>(Original: ComponentType<P>) =>
    function Passthrough(props: P) {
      return stubs.fading ? <div>{props.children}</div> : <Original {...props} />
    }
  function Dialog(props: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }) {
    if (!stubs.fading) return <actual.Dialog {...props} />
    return (
      <div
        data-modal
        data-state={props.open ? "open" : "closed"}
        ref={(element) => {
          if (element && props.onOpenChange) stubs.handlers.set(element, props.onOpenChange)
        }}
      >
        {props.children}
      </div>
    )
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
    DialogTrigger: passthrough(actual.DialogTrigger),
  }
})

const emitOpen = (modal: Element, open: boolean): void => act(() => stubs.handlers.get(modal)?.(open))

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ""
  sessionState.clear()
  stubs.fading = false
  stubs.pickers.clear()
})

const period = { id: "period-1", codigo: "Septiembre-Enero 2026-2027", starts_on: "2026-09-22", ends_on: "2027-01-02" }

describe("syllabus process dates", () => {
  it("requires the administrator to choose dates instead of copying the period dates", async () => {
    const view = (open: boolean) => <SyllabusProcessDialog open={open} onOpenChange={vi.fn()} template={null} periods={[]} period={period} />
    const { rerender, unmount } = render(view(false))

    rerender(view(true))
    await flush()

    expect([...stubs.pickers.keys()]).toEqual(["process-starts", "process-due"])
    expect(stubs.pickers.get("process-starts")!.value).toBe("")
    expect(stubs.pickers.get("process-due")!.value).toBe("")
    expect([...stubs.pickers.values()].every((picker) => picker.required)).toBe(true)

    unmount()
  })

  it("limits the dates to the day published by the server", async () => {
    sessionState.replace({
      user: { id: "user-1", name: "Administración", email: "admin@silabos.test", email_verified: true, can_edit_identity: true },
      active_role: null,
      available_roles: [],
      institution: { today: "2026-10-21", timezone: "America/Guayaquil" },
    })

    const { unmount } = render(<SyllabusProcessDialog open onOpenChange={vi.fn()} template={null} periods={[]} period={period} />)
    await flush()

    expect(stubs.pickers.get("process-starts")!.minValue).toBe("2026-10-21")
    expect(stubs.pickers.get("process-due")!.minValue).toBe("2026-10-21")

    unmount()
  })

  it("confirma la apertura solo después de escribir la frase", async () => {
    api.createProcess.mockResolvedValue({ message: "Convocatoria abierta." })
    const { unmount } = render(<SyllabusProcessDialog open onOpenChange={vi.fn()} template={null} periods={[]} period={{ id: "period-1", codigo: "2026-2027", starts_on: "2026-09-22", ends_on: "2027-01-02" }} />)
    await flush()
    fireEvent.submit(document.querySelector("form")!)
    await flush()

    const confirm = (): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].reverse().find((button) => button.textContent?.includes("Abrir convocatoria"))!
    expect(document.body.textContent).toContain("los sílabos parten del proyecto de carrera de cada materia")
    expect(confirm().disabled).toBe(true)
    typeConfirmation("process-open-confirm", "abrir")
    await flush()
    expect(confirm().disabled).toBe(true)
    typeConfirmation("process-open-confirm", "Abrir convocatoria")
    await flush()
    expect(confirm().disabled).toBe(false)
    fireEvent.click(confirm())
    await flush()
    expect(api.createProcess).toHaveBeenCalledOnce()

    unmount()
  })

  it("la frase de confirmación se borra al volver a abrir, no al cerrar", async () => {
    stubs.fading = true
    const { container, unmount } = render(<SyllabusProcessDialog open onOpenChange={vi.fn()} template={null} periods={[]} period={{ id: "period-1", codigo: "Septiembre-Enero 2026-2027" }} />)
    await flush()
    const modal = [...container.querySelectorAll("[data-modal]")].at(-1)!
    emitOpen(modal, true)
    await flush()
    typeConfirmation("process-open-confirm", "abrir convocatoria")
    await flush()
    emitOpen(modal, false)
    await flush()

    expect(modal.getAttribute("data-state")).toBe("closed")
    expect(document.body.querySelector<HTMLInputElement>("#process-open-confirm")!.value).toBe("abrir convocatoria")
    emitOpen(modal, true)
    await flush()
    expect(document.body.querySelector<HTMLInputElement>("#process-open-confirm")!.value).toBe("")

    unmount()
  })
})
