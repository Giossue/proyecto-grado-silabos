import { fireEvent, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { SyllabusProcess } from "@/api/processes"
import { ConvocationOptionsDialog } from "@/components/domain/syllabus/ConvocationOptionsDialog"

vi.mock("@/components/ui/dialog", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>

  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div data-dialog>{children}</div> : null),
    DialogClose: passthrough,
    DialogContent: passthrough,
    DialogFooter: ({ children }: { children?: ReactNode }) => <div data-footer>{children}</div>,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
    DialogDescription: passthrough,
  }
})

const process = (state: SyllabusProcess["state"], blockReason: string | null = null): SyllabusProcess => ({
  id: "process-1",
  name: "Octubre-Enero 2026-2027",
  state,
  template: "Plantilla institucional de sílabo",
  period_id: "period-1",
  period_name: "Octubre-Enero 2026-2027",
  starts_at: "2026-10-01",
  due_at: "2026-10-20",
  convocations_count: 1,
  configurable: state === "pausado",
  deletable: state !== "cerrado",
  extensions_used: blockReason ? 2 : 0,
  extensions_max: 2,
  extension_limit_on: "2027-03-01",
  extension_block_reason: blockReason,
})

const mountDialog = (state: SyllabusProcess["state"], blockReason: string | null = null) => {
  const onAction = vi.fn()
  const onOpenChange = vi.fn()
  const view = render(
    <ConvocationOptionsDialog
      open
      onOpenChange={onOpenChange}
      onAction={onAction}
      row={{
        id: "period-1", code: "Octubre-Enero 2026-2027", starts_on: "2026-10-01", ends_on: "2027-03-01",
        teaching_weeks: 16, status: "proximo", status_label: "Próximo", institutional_process: null, lock_reason: null,
        process: process(state, blockReason),
      }}
    />,
  )

  return { ...view, onAction, onOpenChange }
}

type Mounted = ReturnType<typeof mountDialog>

const footerButtons = (view: Mounted) => [...view.container.querySelectorAll("[data-footer] button")]
const options = (view: Mounted) => [...view.container.querySelectorAll<HTMLButtonElement>("ul button")]
const optionLabel = (item: Element): string => item.querySelector(".font-medium")!.textContent ?? ""
const labels = (view: Mounted): string[] => options(view).map(optionLabel)
const option = (view: Mounted, label: string) => options(view).find((item) => optionLabel(item) === label)

describe("ConvocationOptionsDialog", () => {
  it("lista cada opción con lo que hace; Finalizar y Eliminar van al final, separadas y en rojo; el pie solo tiene Cancelar", () => {
    const view = mountDialog("abierto")

    expect(labels(view)).toEqual(["Pausar", "Prorrogar plazo", "Finalizar", "Eliminar"])
    expect(option(view, "Pausar")!.textContent).toContain("Nadie edita, envía ni revisa hasta que lo reanude")
    expect(option(view, "Eliminar")!.className).toContain("text-destructive")
    expect(option(view, "Pausar")!.className).not.toContain("text-destructive")
    expect(footerButtons(view).map((item) => item.textContent)).toEqual(["Cancelar"])

    fireEvent.click(option(view, "Eliminar")!)
    expect(view.onAction.mock.calls).toEqual([["eliminar"]])
    expect(view.onOpenChange.mock.calls).toEqual([[false]])
  })

  it("ofrece eliminar con el periodo académico abierto o pausado", () => {
    expect(labels(mountDialog("abierto"))).toContain("Eliminar")
    expect(labels(mountDialog("pausado"))).toContain("Eliminar")
  })

  it("un periodo académico cerrado no ofrece eliminar", () => {
    expect(labels(mountDialog("cerrado"))).not.toContain("Eliminar")
  })

  it("la acción manual se llama Finalizar, abierta o pausada, y el botón del pie dice Cancelar", () => {
    const view = mountDialog("abierto")
    expect(footerButtons(view).at(-1)?.textContent).toBe("Cancelar")
    expect(labels(view)).toContain("Finalizar")
    expect(labels(view)).not.toContain("Cerrar")
    expect(labels(mountDialog("pausado"))).toContain("Finalizar")
  })

  it("ofrece prorrogar mientras queden prórrogas", () => {
    expect(option(mountDialog("abierto"), "Prorrogar plazo")!.disabled).toBe(false)
  })

  it("sin prórrogas disponibles desactiva prorrogar y muestra el motivo", () => {
    const view = mountDialog("pausado", "El plazo ya llega al último día de clases (01/03/2027).")

    expect(option(view, "Prorrogar plazo")!.disabled).toBe(true)
    expect(view.container.querySelector("#option-effect-prorrogar")!.textContent).toBe("El plazo ya llega al último día de clases (01/03/2027)")
  })

  it("un periodo académico cerrado no ofrece finalizar", () => {
    expect(labels(mountDialog("cerrado"))).not.toContain("Finalizar")
  })

  it("un periodo académico finalizado ofrece prorrogar el plazo para reabrirlo", () => {
    const view = mountDialog("cerrado")
    const extend = option(view, "Prorrogar plazo")!

    expect(labels(view)).toEqual(["Prorrogar plazo"])
    expect(extend.disabled).toBe(false)
    fireEvent.click(extend)
    expect(view.onAction.mock.calls).toEqual([["prorrogar"]])
  })

  it("un periodo académico finalizado que no se puede reabrir desactiva prorrogar y muestra el motivo", () => {
    const view = mountDialog("cerrado", "Hay otro periodo académico en curso; finalícelo o elimínelo antes de reabrir este.")

    expect(option(view, "Prorrogar plazo")!.disabled).toBe(true)
    expect(view.container.querySelector("#option-effect-prorrogar")!.textContent).toBe("Hay otro periodo académico en curso; finalícelo o elimínelo antes de reabrir este")
  })
})
