import { fireEvent, render } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { extendProcessDeadline, type SyllabusProcess } from "@/api/processes"
import type { DatePicker as RealDatePicker } from "@/components/DatePicker"
import { DeadlineExtensionDialog } from "@/components/domain/syllabus/DeadlineExtensionDialog"
import { flush } from "@/test/render"

type PickerProps = ComponentProps<typeof RealDatePicker>

const stubs = vi.hoisted(() => ({ sliding: false, picker: null as PickerProps | null }))

vi.mock("@/api/processes", () => ({ extendProcessDeadline: vi.fn() }))

vi.mock("@/components/DatePicker", () => ({
  DatePicker: (props: PickerProps) => {
    stubs.picker = props
    return <input id={props.id} value={props.value ?? ""} aria-required={props.required ? "true" : undefined} onChange={(event) => props.onValueChange?.(event.target.value)} />
  },
}))

vi.mock("@/components/domain/FormModal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/domain/FormModal")>()
  type Props = ComponentProps<typeof actual.FormModal>

  return {
    FormModal: (props: Props) => {
      if (!stubs.sliding) return <actual.FormModal {...props} />
      const close = (): void => props.onOpenChange?.(false)
      const children = props.children as ReactNode | ((slot: { close: () => void }) => ReactNode)

      return <div data-modal data-state={props.open ? "open" : "closed"}>{typeof children === "function" ? children({ close }) : children}</div>
    },
  }
})

const process = (extensionsUsed = 0, state: SyllabusProcess["state"] = "abierto"): SyllabusProcess => ({
  id: "process-1",
  name: "Octubre-Febrero 2026-2027",
  state,
  template: "Plantilla institucional de sílabo",
  period_id: "period-1",
  period_name: "Octubre-Febrero 2026-2027",
  starts_at: "2026-10-01",
  due_at: "2026-11-20",
  convocations_count: 1,
  configurable: false,
  deletable: true,
  extensions_used: extensionsUsed,
  extensions_max: 2,
  extension_limit_on: "2027-02-26",
  extension_block_reason: null,
})

const submitButton = (): HTMLButtonElement => document.body.querySelector<HTMLButtonElement>('button[type="submit"]')!
const submit = async (): Promise<void> => {
  fireEvent.submit(document.body.querySelector<HTMLFormElement>("form")!)
  await flush()
}
const chooseDate = async (value: string): Promise<void> => {
  fireEvent.change(document.body.querySelector<HTMLInputElement>("#extension-due")!, { target: { value } })
  await flush()
}

const mountDialog = (value = process()) => {
  const onSaved = vi.fn()
  const view = render(<DeadlineExtensionDialog process={value} open onOpenChange={vi.fn()} onSaved={onSaved} />)

  return { ...view, onSaved }
}

const mountControlled = (value = process()) => {
  const onSaved = vi.fn()
  const view = (open: boolean) => <DeadlineExtensionDialog process={value} open={open} onOpenChange={(next) => rendered.rerender(view(next))} onSaved={onSaved} />
  const rendered = render(view(true))

  return { ...rendered, onSaved, setOpen: (open: boolean) => rendered.rerender(view(open)) }
}

describe("DeadlineExtensionDialog", () => {
  beforeEach(() => {
    vi.mocked(extendProcessDeadline).mockReset().mockResolvedValue({ message: "Plazo prorrogado." })
  })

  afterEach(() => {
    stubs.sliding = false
    stubs.picker = null
    document.body.innerHTML = ""
  })

  it("extends only the delivery deadline without asking for a stage", async () => {
    const { unmount, onSaved } = mountDialog()
    await flush()

    expect(document.body.textContent).toContain("Nueva fecha límite de entrega")
    expect(document.body.textContent).not.toContain("Etapa")

    await chooseDate("2027-02-15")
    expect(document.body.querySelector("#extension-reason")).toBeNull()

    await submit()

    expect(extendProcessDeadline).toHaveBeenCalledWith("process-1", { due_at: "2027-02-15" })
    expect(onSaved.mock.calls).toEqual([["Plazo prorrogado."]])
    unmount()
  })

  it("al guardar cierra sin borrar la fecha, y la borra al volver a abrir", async () => {
    stubs.sliding = true
    const { container, unmount, setOpen } = mountControlled()
    await flush()
    await chooseDate("2027-02-15")
    await submit()

    expect(container.querySelector("[data-modal]")!.getAttribute("data-state")).toBe("closed")
    expect(stubs.picker!.value).toBe("2027-02-15")
    setOpen(false)
    setOpen(true)
    await flush()
    expect(stubs.picker!.value).toBe("")
    unmount()
  })

  it("dice qué prórroga es de las dos", async () => {
    const first = mountDialog(process(0))
    await flush()
    expect(document.body.textContent).toContain("Prórroga 1 de 2")
    first.unmount()
    document.body.innerHTML = ""

    const second = mountDialog(process(1))
    await flush()
    expect(document.body.textContent).toContain("Prórroga 2 de 2")
    second.unmount()
  })

  it("no deja elegir después del último día de clases y lo dice", async () => {
    const { unmount } = mountDialog()
    await flush()

    expect(stubs.picker!.maxValue).toBe("2027-02-26")
    expect(document.body.textContent).toContain("Hasta el último día de clases: 26 feb 2027")
    unmount()
  })

  it("en un periodo académico abierto no habla de reabrir", async () => {
    const { unmount } = mountDialog()
    await flush()

    expect(document.body.textContent).not.toContain("se vuelve a abrir")
    expect(submitButton().textContent).toContain("Prorrogar entrega")
    expect(submitButton().dataset.variant).toBeUndefined()
    unmount()
  })

  it("en un periodo académico finalizado avisa que prorrogar la vuelve a abrir y pasa el mensaje del servidor", async () => {
    vi.mocked(extendProcessDeadline).mockResolvedValueOnce({ message: "Plazo prorrogado. El periodo académico se volvió a abrir." })
    const { unmount, onSaved } = mountDialog(process(0, "cerrado"))
    await flush()

    expect(document.body.textContent).toContain("Al prorrogar, el periodo académico se vuelve a abrir con la nueva fecha")
    expect(submitButton().textContent).toContain("Prorrogar y reabrir")
    await chooseDate("2027-02-15")
    await submit()

    expect(extendProcessDeadline).toHaveBeenCalledWith("process-1", { due_at: "2027-02-15" })
    expect(onSaved.mock.calls).toEqual([["Plazo prorrogado. El periodo académico se volvió a abrir."]])
    unmount()
  })

  it("si la plantilla cambió tras finalizar, reenvía directo con confirmar_rehacer, sin frase", async () => {
    vi.mocked(extendProcessDeadline)
      .mockRejectedValueOnce(new ApiError("La plantilla cambió después de finalizar el periodo académico.", 422, {}, {
        code: "plantilla_cambiada",
        counts: { sin_iniciar: 1, borrador: 2, en_revision: 1, correccion_solicitada: 0, aprobado: 3 },
      }))
      .mockResolvedValueOnce({ message: "Plazo prorrogado. El periodo académico se volvió a abrir." })
    const { unmount, onSaved } = mountDialog(process(0, "cerrado"))
    await flush()
    await chooseDate("2027-02-15")
    await submit()

    expect(document.body.querySelector("#extension-template-confirm")).toBeNull()
    expect(extendProcessDeadline).toHaveBeenNthCalledWith(1, "process-1", { due_at: "2027-02-15" })
    expect(extendProcessDeadline).toHaveBeenNthCalledWith(2, "process-1", { due_at: "2027-02-15", confirmar_rehacer: true })
    expect(onSaved.mock.calls).toEqual([["Plazo prorrogado. El periodo académico se volvió a abrir."]])
    unmount()
  })

  it("si hay cambios pendientes, reenvía directo con confirmar_cambios", async () => {
    vi.mocked(extendProcessDeadline)
      .mockRejectedValueOnce(new ApiError("Hubo cambios.", 422, {}, {
        code: "cambios_pendientes",
        counts: { to_draft: 2, restarted: 0, to_coordination: 1 },
      }))
      .mockResolvedValueOnce({ message: "Plazo prorrogado. El periodo académico se volvió a abrir." })
    const { unmount, onSaved } = mountDialog(process(0, "cerrado"))
    await flush()
    await chooseDate("2027-02-15")
    await submit()

    expect(extendProcessDeadline).toHaveBeenNthCalledWith(2, "process-1", { due_at: "2027-02-15", confirmar_cambios: true })
    expect(onSaved.mock.calls).toEqual([["Plazo prorrogado. El periodo académico se volvió a abrir."]])
    unmount()
  })

  it("si cambiaron la plantilla y otros datos, un solo reenvío manda las dos marcas", async () => {
    vi.mocked(extendProcessDeadline)
      .mockRejectedValueOnce(new ApiError("La plantilla cambió.", 422, {}, {
        code: "plantilla_cambiada",
        counts: { sin_iniciar: 0, borrador: 1, en_revision: 0, correccion_solicitada: 0, aprobado: 1 },
        pending_counts: { to_draft: 0, restarted: 1, to_coordination: 0 },
      }))
      .mockResolvedValueOnce({ message: "Plazo prorrogado. El periodo académico se volvió a abrir." })
    const { unmount } = mountDialog(process(0, "cerrado"))
    await flush()
    await chooseDate("2027-02-15")
    await submit()

    expect(extendProcessDeadline).toHaveBeenCalledTimes(2)
    expect(extendProcessDeadline).toHaveBeenNthCalledWith(2, "process-1", { due_at: "2027-02-15", confirmar_rehacer: true, confirmar_cambios: true })
    unmount()
  })

  it("si el servidor sigue pidiendo confirmación, no reenvía sin fin", async () => {
    vi.mocked(extendProcessDeadline).mockRejectedValue(new ApiError("Hubo cambios.", 422, {}, {
      code: "cambios_pendientes",
      counts: { to_draft: 1, restarted: 0, to_coordination: 0 },
    }))
    const { unmount, onSaved } = mountDialog(process(0, "cerrado"))
    await flush()
    await chooseDate("2027-02-15")
    await submit()

    expect(extendProcessDeadline).toHaveBeenCalledTimes(3)
    expect(onSaved).not.toHaveBeenCalled()
    unmount()
  })
})
