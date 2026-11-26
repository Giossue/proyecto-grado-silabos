import { act, fireEvent, render } from "@testing-library/react"
import type { ComponentProps, ComponentType, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import type { DatePicker as RealDatePicker } from "@/components/DatePicker"
import { ConvocationPeriodDialog } from "@/components/domain/syllabus/ConvocationPeriodDialog"
import { typeConfirmation } from "@/test/confirmPhrase"
import { flush } from "@/test/render"

type PickerProps = ComponentProps<typeof RealDatePicker>

const stubs = vi.hoisted(() => ({ fading: false, handlers: new WeakMap<Element, (open: boolean) => void>() }))

const api = vi.hoisted(() => ({ createAcademicRecord: vi.fn(), createProcess: vi.fn() }))
vi.mock("@/api/academic", async (importOriginal) => ({ ...(await importOriginal<object>()), createAcademicRecord: api.createAcademicRecord }))
vi.mock("@/api/processes", async (importOriginal) => ({ ...(await importOriginal<object>()), createProcess: api.createProcess }))

vi.mock("@/components/DatePicker", () => ({
  DatePicker: (props: PickerProps) => (
    <input data-date-picker id={props.id} value={props.value ?? ""} aria-required={props.required ? "true" : undefined} onChange={(event) => props.onValueChange?.(event.target.value)} />
  ),
}))

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

afterEach(() => {
  document.body.innerHTML = ""
  vi.clearAllMocks()
  stubs.fading = false
})

const pickers = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>("[data-date-picker]")]
const choose = (picker: HTMLInputElement, value: string): void => {
  fireEvent.change(picker, { target: { value } })
}
const submitForm = async (): Promise<void> => {
  fireEvent.submit(document.querySelector("form")!)
  await flush()
}
const confirmSubmit = async (): Promise<void> => {
  await submitForm()
  typeConfirmation("convocation-open-confirm", "abrir periodo")
  await flush()
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].reverse().find((button) => button.textContent?.includes("Abrir periodo académico"))
  fireEvent.click(confirm!)
  await flush()
}
const fillSteps = async (): Promise<void> => {
  const [starts, ends] = pickers()
  choose(starts!, "2026-10-05")
  choose(ends!, "2027-02-26")
  await flush()
  await submitForm()
  const [opens, due] = pickers()
  choose(opens!, "2026-10-06")
  choose(due!, "2026-10-30")
  await flush()
}
const mountDialog = async () => {
  const onSaved = vi.fn()
  const view = render(<ConvocationPeriodDialog open onOpenChange={vi.fn()} onSaved={onSaved} />)
  await flush()

  return { ...view, onSaved }
}
const emitOpen = (modal: Element, open: boolean): void => act(() => stubs.handlers.get(modal)?.(open))

describe("ConvocationPeriodDialog", () => {
  it("pide el periodo primero, no avanza sin fechas y luego pide la elaboración", async () => {
    const { unmount } = await mountDialog()
    let current = pickers()
    expect(current).toHaveLength(2)
    expect(current.every((picker) => picker.getAttribute("aria-required") === "true")).toBe(true)
    expect(current.every((picker) => picker.value === "")).toBe(true)
    await submitForm()
    expect(pickers()).toHaveLength(2)
    expect(document.body.textContent).toContain("Periodo lectivo")

    choose(current[0]!, "2026-10-05")
    choose(current[1]!, "2027-02-26")
    await flush()
    await submitForm()
    current = pickers()
    expect(current).toHaveLength(2)
    expect(document.body.textContent).toContain("Elaboración de sílabos")
    expect(current.every((picker) => picker.value === "")).toBe(true)
    unmount()
  })

  it("el primer paso aparece quieto al abrir y solo se desliza al cambiar de paso", async () => {
    const { unmount } = await mountDialog()
    const step = (): HTMLElement => document.querySelector<HTMLElement>('[data-slot="field-set"]')!
    expect(step().textContent).toContain("Periodo lectivo")
    expect(step().className).not.toMatch(/animate-in|slide-in|convocation-step/)

    const [starts, ends] = pickers()
    choose(starts!, "2026-10-05")
    choose(ends!, "2027-02-26")
    await flush()
    await submitForm()
    expect(step().textContent).toContain("Elaboración de sílabos")
    expect(step().className).toContain("animate-in")
    expect(step().className).toContain("slide-in-from-right-8")

    const back = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Atrás")!
    fireEvent.click(back)
    await flush()
    expect(step().textContent).toContain("Periodo lectivo")
    expect(step().className).toContain("slide-in-from-left-8")
    unmount()
  })

  it("si la apertura falla, el reintento no vuelve a crear el periodo", async () => {
    api.createAcademicRecord.mockResolvedValue({ message: "Registro institucional creado.", id: "p1" })
    api.createProcess.mockRejectedValueOnce(new ApiError("Error", 422, { process: ["Ya hay un periodo académico en curso."] })).mockResolvedValueOnce({ message: "Periodo académico abierto." })
    const { unmount, onSaved } = await mountDialog()
    await fillSteps()
    await confirmSubmit()
    expect(document.body.textContent).toContain("El periodo ya quedó creado")
    await confirmSubmit()

    expect(api.createAcademicRecord).toHaveBeenCalledTimes(1)
    expect(api.createProcess).toHaveBeenCalledTimes(2)
    expect(onSaved.mock.calls[0]).toEqual(["Periodo académico abierto."])
    unmount()
  })

  it("crea el periodo y abre el periodo académico con el id devuelto", async () => {
    api.createAcademicRecord.mockResolvedValue({ message: "Registro institucional creado.", id: "p1" })
    api.createProcess.mockResolvedValue({ message: "Periodo académico abierto." })
    const { unmount, onSaved } = await mountDialog()
    await fillSteps()
    await confirmSubmit()

    expect(api.createProcess).toHaveBeenCalledWith({ period_id: "p1", starts_at: "2026-10-06", due_at: "2026-10-30" })
    expect(onSaved.mock.calls[0]).toEqual(["Periodo académico abierto."])
    unmount()
  })

  it("muestra las semanas entre las fechas sin permitir editarlas", async () => {
    api.createAcademicRecord.mockResolvedValue({ message: "Registro institucional creado.", id: "p1" })
    api.createProcess.mockResolvedValue({ message: "Periodo académico abierto." })
    const { unmount } = await mountDialog()
    const [starts, ends] = pickers()
    choose(starts!, "2026-10-05")
    choose(ends!, "2027-02-26")
    await flush()
    expect(document.querySelector("#convocation-period-weeks")).toBeNull()
    expect(document.body.textContent).toContain("Serían 21 semanas de clase entre las fechas")
    await fillSteps()
    await confirmSubmit()

    expect(api.createAcademicRecord).toHaveBeenLastCalledWith("periodo", { starts_on: "2026-10-05", ends_on: "2027-02-26" })
    unmount()
  })

  it("la frase de confirmación se borra al volver a abrir, no al cerrar", async () => {
    stubs.fading = true
    const { container, unmount } = render(<ConvocationPeriodDialog open onOpenChange={vi.fn()} />)
    await flush()
    const modal = [...container.querySelectorAll("[data-modal]")].at(-1)!
    emitOpen(modal, true)
    await flush()
    typeConfirmation("convocation-open-confirm", "abrir periodo")
    await flush()
    emitOpen(modal, false)
    await flush()

    expect(modal.getAttribute("data-state")).toBe("closed")
    expect(document.body.querySelector<HTMLInputElement>("#convocation-open-confirm")!.value).toBe("abrir periodo")
    emitOpen(modal, true)
    await flush()
    expect(document.body.querySelector<HTMLInputElement>("#convocation-open-confirm")!.value).toBe("")

    unmount()
  })
})
