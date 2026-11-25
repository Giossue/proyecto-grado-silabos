import { act, fireEvent, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { deleteAcademicRecord } from "@/api/academic"
import { ApiError } from "@/api/client"
import { ConvocationRowActions } from "@/components/domain/syllabus/ConvocationRowActions"
import type { ConvocationRow } from "@/components/domain/syllabus/convocationRows"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { flush } from "@/test/render"

const stubs = vi.hoisted(() => ({ saved: null as ((message: string) => void) | null }))

vi.mock("@/api/academic", () => ({ deleteAcademicRecord: vi.fn() }))

vi.mock("@/components/domain/TableActionsMenu", () => ({
  TableActionsMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({ disabled, onSelect, children }: { disabled?: boolean; onSelect?: (event: Event) => void; children?: ReactNode }) => (
    <button type="button" className="menu-item" disabled={disabled} onClick={(event) => onSelect?.(event.nativeEvent)}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/dialog", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>

  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div data-dialog>{children}</div> : null),
    DialogClose: passthrough,
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
  }
})

vi.mock("@/components/domain/syllabus/SyllabusProcessActions", () => ({ SyllabusProcessActions: () => null }))

vi.mock("@/components/domain/syllabus/SyllabusProcessDialog", () => ({
  SyllabusProcessDialog: (props: { onSaved?: (message: string) => void }) => {
    stubs.saved = props.onSaved ?? null
    return <div />
  },
}))

const period = (lockReason: string | null = null): ConvocationRow => ({
  id: "period-1",
  code: "Octubre-Enero 2026-2027",
  starts_on: "2026-10-01",
  ends_on: "2027-03-01",
  teaching_weeks: 16,
  status: "proximo",
  status_label: "Próximo",
  institutional_process: null,
  lock_reason: lockReason,
  process: null,
})

const mountActions = (row = period()) => {
  const onChanged = vi.fn()
  const view = render(<ConvocationRowActions row={row} onChanged={onChanged} />)

  return { ...view, onChanged }
}

type Mounted = ReturnType<typeof mountActions>

const menuItem = (view: Mounted, label: string) => [...view.container.querySelectorAll<HTMLButtonElement>(".menu-item")].find((item) => item.textContent?.includes(label))
const confirmButton = (view: Mounted, label: string) => [...view.container.querySelectorAll<HTMLButtonElement>("[data-dialog] button")].find((item) => item.textContent?.includes(label))

describe("ConvocationRowActions", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    vi.clearAllMocks()
    vi.useRealTimers()
    stubs.saved = null
  })

  it("avisa que eliminó el período cuando el modal terminó de cerrarse", async () => {
    vi.useFakeTimers()
    vi.mocked(deleteAcademicRecord).mockResolvedValue({ message: "Periodo eliminado." } as never)
    const view = mountActions()
    fireEvent.click(menuItem(view, "Eliminar periodo")!)
    fireEvent.click(confirmButton(view, "Eliminar periodo")!)
    await act(async () => {
      await Promise.resolve()
    })

    expect(view.container.querySelector("[data-dialog]")).toBeNull()
    expect(view.onChanged).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(view.onChanged.mock.calls).toEqual([["Periodo eliminado."]])

    view.unmount()
  })

  it("avisa que abrió la convocatoria cuando el formulario terminó de cerrarse", async () => {
    vi.useFakeTimers()
    const view = mountActions()
    await act(async () => {
      stubs.saved?.("Convocatoria abierta.")
      await Promise.resolve()
    })

    expect(view.onChanged).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(view.onChanged.mock.calls).toEqual([["Convocatoria abierta."]])

    view.unmount()
  })

  it("explica que al eliminar el período no se borran materias, paralelos ni docentes", async () => {
    const view = mountActions()
    const remove = menuItem(view, "Eliminar periodo")
    expect(remove).toBeDefined()
    fireEvent.click(remove!)
    await flush()

    const text = view.container.querySelector("[data-dialog]")!.textContent
    expect(text).toContain("sus fechas y sus semanas lectivas")
    expect(text).toContain("no se borran")
    expect(text).toContain("Si el período ya tiene una convocatoria, el sistema no permitirá eliminarlo")

    view.unmount()
  })

  it("un período con convocatoria muestra el motivo y no ofrece eliminarlo", () => {
    const view = mountActions(period("Convocatoria cerrada"))

    expect(view.container.textContent).toContain("Convocatoria cerrada")
    expect(menuItem(view, "Eliminar periodo")).toBeUndefined()

    view.unmount()
  })

  it("avisa cuando el servidor rechaza la eliminación", async () => {
    vi.mocked(deleteAcademicRecord).mockRejectedValue(
      new ApiError("Este período ya tiene una convocatoria con su historial, por eso no se puede eliminar.", 422, {
        record: ["Este período ya tiene una convocatoria con su historial, por eso no se puede eliminar."],
      }),
    )
    const view = mountActions()
    fireEvent.click(menuItem(view, "Eliminar periodo")!)
    await flush()

    fireEvent.click(confirmButton(view, "Eliminar periodo")!)
    await flush()

    expect(view.container.textContent).toContain("ya tiene una convocatoria con su historial")
    expect(deleteAcademicRecord).toHaveBeenCalledWith("periodo", "period-1")

    view.unmount()
  })
})
