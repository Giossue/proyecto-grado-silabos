import { fireEvent, render } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import type { DatePicker as RealDatePicker } from "@/components/DatePicker"
import { ConvocationPeriodDialog } from "@/components/domain/syllabus/ConvocationPeriodDialog"
import { flush } from "@/test/render"

type PickerProps = ComponentProps<typeof RealDatePicker>

const api = vi.hoisted(() => ({ createAcademicRecord: vi.fn(), createProcess: vi.fn() }))
vi.mock("@/api/academic", async (importOriginal) => ({ ...(await importOriginal<object>()), createAcademicRecord: api.createAcademicRecord }))
vi.mock("@/api/processes", async (importOriginal) => ({ ...(await importOriginal<object>()), createProcess: api.createProcess }))

vi.mock("@/components/DatePicker", () => ({
  DatePicker: (props: PickerProps) => (
    <input data-date-picker data-min={props.minValue ?? ""} id={props.id} value={props.value ?? ""} aria-required={props.required ? "true" : undefined} onChange={(event) => props.onValueChange?.(event.target.value)} />
  ),
}))

afterEach(() => {
  document.body.innerHTML = ""
  vi.clearAllMocks()
})

const pickers = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>("[data-date-picker]")]
const choose = (picker: HTMLInputElement, value: string): void => {
  fireEvent.change(picker, { target: { value } })
}
const submitForm = async (): Promise<void> => {
  fireEvent.submit(document.querySelector("form")!)
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

const heading = (): [string, string] => {
  const dialog = document.querySelector('[role="dialog"]')!
  return [dialog.querySelector('[data-slot="dialog-title"]')!.textContent!, dialog.querySelector('[data-slot="dialog-description"]')!.textContent!]
}
const PERIOD_STEP: [string, string] = ["Periodo lectivo", "Elija cuándo empiezan y terminan las clases"]
const DRAFTING_STEP: [string, string] = ["Elaboración de sílabos", "Elija cuándo empieza la elaboración y hasta cuándo se entrega"]

describe("ConvocationPeriodDialog", () => {
  it("«Fin de clases» no admite días anteriores a hoy ni al inicio, aunque las clases ya hayan empezado", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date())
    const { unmount } = await mountDialog()
    const [starts, ends] = pickers()
    expect(ends!.dataset.min).toBe(today)

    choose(starts!, "2020-03-02")
    await flush()
    expect(pickers()[1]!.dataset.min).toBe(today)

    choose(starts!, "2099-03-02")
    await flush()
    expect(pickers()[1]!.dataset.min).toBe("2099-03-02")
    expect(pickers()[0]!.dataset.min).toBe("")
    unmount()
  })

  it("el título y la descripción del modal cambian con el paso, sin repetirlos dentro del formulario", async () => {
    const { unmount } = await mountDialog()
    expect(heading()).toEqual(PERIOD_STEP)
    expect(document.querySelector("form")!.textContent).not.toContain("Periodo lectivo")
    expect(document.querySelector("form")!.textContent).not.toContain("la etiqueta se genera")

    const [starts, ends] = pickers()
    choose(starts!, "2026-10-05")
    choose(ends!, "2027-02-26")
    await flush()
    await submitForm()
    expect(heading()).toEqual(DRAFTING_STEP)
    expect(document.querySelector("form")!.textContent).not.toContain("Elaboración de sílabos")
    expect(document.querySelector("form")!.textContent).not.toContain("Elija cuándo")
    unmount()
  })

  it("con más de 52 semanas lo avisa en el primer paso y no deja avanzar; con 52 avanza", async () => {
    const { unmount } = await mountDialog()
    const [starts, ends] = pickers()
    const next = (): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Siguiente"))!
    choose(starts!, "2026-10-05")
    choose(ends!, "2027-10-04")
    await flush()
    expect(document.body.textContent).toContain("Serían 53 semanas")
    expect(document.body.textContent).toContain("El período no puede superar 52 semanas calendario")
    expect(next().disabled).toBe(true)
    await submitForm()
    expect(document.body.textContent).toContain("Periodo lectivo")

    choose(ends!, "2027-10-01")
    await flush()
    expect(document.body.textContent).not.toContain("no puede superar")
    expect(next().disabled).toBe(false)
    await submitForm()
    expect(document.body.textContent).toContain("Elaboración de sílabos")
    unmount()
  })

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
    expect(heading()).toEqual(PERIOD_STEP)
    expect(step().className).not.toMatch(/animate-in|slide-in|convocation-step/)

    const [starts, ends] = pickers()
    choose(starts!, "2026-10-05")
    choose(ends!, "2027-02-26")
    await flush()
    await submitForm()
    expect(heading()).toEqual(DRAFTING_STEP)
    expect(step().className).toContain("animate-in")
    expect(step().className).toContain("slide-in-from-right-8")

    const back = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Atrás")!
    fireEvent.click(back)
    await flush()
    expect(heading()).toEqual(PERIOD_STEP)
    expect(step().className).toContain("slide-in-from-left-8")
    unmount()
  })

  it("si la apertura falla, el reintento no vuelve a crear el periodo", async () => {
    api.createAcademicRecord.mockResolvedValue({ message: "Registro institucional creado.", id: "p1" })
    api.createProcess.mockRejectedValueOnce(new ApiError("Error", 422, { process: ["Ya hay un periodo académico en curso."] })).mockResolvedValueOnce({ message: "Periodo académico abierto." })
    const { unmount, onSaved } = await mountDialog()
    await fillSteps()
    await submitForm()
    expect(document.body.textContent).toContain("El periodo ya quedó creado")
    await submitForm()

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
    await submitForm()

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
    await submitForm()

    expect(api.createAcademicRecord).toHaveBeenLastCalledWith("periodo", { starts_on: "2026-10-05", ends_on: "2027-02-26" })
    unmount()
  })

  it("al enviar el segundo paso abre el periodo directo, sin frase", async () => {
    const { unmount } = await mountDialog()
    await fillSteps()
    expect(document.body.textContent).toContain("Al abrirlo, el periodo y sus fechas ya no se pueden editar")
    await submitForm()

    expect(document.querySelector("#convocation-open-confirm")).toBeNull()
    expect(api.createAcademicRecord).toHaveBeenCalledTimes(1)
    expect(api.createProcess).toHaveBeenCalledTimes(1)
    unmount()
  })
})
