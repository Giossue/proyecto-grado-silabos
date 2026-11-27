import { act, fireEvent, render } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DatePicker as RealDatePicker } from "@/components/DatePicker"
import { SyllabusProcessDialog } from "@/components/domain/syllabus/SyllabusProcessDialog"
import { sessionState } from "@/state/session"
import { flush } from "@/test/render"

type PickerProps = ComponentProps<typeof RealDatePicker>

const stubs = vi.hoisted(() => ({
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

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ""
  sessionState.clear()
  stubs.pickers.clear()
})

const PERIOD_ID = "01a1c5ba-2222-7000-8000-999999999999"
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

  it("valida el formulario vacío en el navegador y no abre la confirmación ni llama al servidor", async () => {
    api.createProcess.mockReset()
    const { unmount } = render(<SyllabusProcessDialog open onOpenChange={vi.fn()} template={null} periods={[]} period={{ id: "period-1", codigo: "2026-2027", starts_on: "2026-09-22", ends_on: "2027-01-02" }} />)
    await flush()
    fireEvent.submit(document.querySelector("form")!)
    await flush()

    expect(document.body.textContent).toContain("El campo fecha de inicio es obligatorio")
    expect(document.body.textContent).toContain("El campo fecha límite es obligatorio")
    expect(document.body.textContent).toContain("El campo proceso de sílabos debe ser un UUID válido")
    expect(document.body.textContent).not.toContain("los sílabos parten del proyecto de carrera de cada materia")
    expect(api.createProcess).not.toHaveBeenCalled()

    unmount()
  })

  it("al enviar el formulario abre el periodo directo, sin frase", async () => {
    api.createProcess.mockReset().mockResolvedValue({ message: "Proceso de sílabos abierto." })
    const { unmount } = render(<SyllabusProcessDialog open onOpenChange={vi.fn()} template={null} periods={[]} period={{ id: PERIOD_ID, codigo: "2026-2027", starts_on: "2026-09-22", ends_on: "2027-01-02" }} />)
    await flush()
    act(() => stubs.pickers.get("process-starts")!.onValueChange!("2026-10-01"))
    act(() => stubs.pickers.get("process-due")!.onValueChange!("2026-10-20"))
    await flush()
    expect(document.body.textContent).toContain("Una vez abierto, sus fechas no se pueden editar")
    fireEvent.submit(document.querySelector("form")!)
    await flush()

    expect(document.body.querySelector("#process-open-confirm")).toBeNull()
    expect(api.createProcess).toHaveBeenCalledExactlyOnceWith({ period_id: PERIOD_ID, starts_at: "2026-10-01", due_at: "2026-10-20" })

    unmount()
  })
})
