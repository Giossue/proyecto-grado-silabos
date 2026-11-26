import { act, fireEvent, render } from "@testing-library/react"
import { createRef, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { deleteProcess, transitionProcess, type SyllabusProcess } from "@/api/processes"
import { SyllabusProcessActions, type SyllabusProcessActionsHandle } from "@/components/domain/syllabus/SyllabusProcessActions"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { toast } from "@/lib/toast"
import { flush } from "@/test/render"

type ExtensionProps = { open?: boolean; process: SyllabusProcess; onSaved?: (message: string) => void }

const stubs = vi.hoisted(() => ({
  extension: null as ExtensionProps | null,
}))

vi.mock("@/api/processes", () => ({
  deleteProcess: vi.fn(),
  transitionProcess: vi.fn(),
}))

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

vi.mock("@/components/domain/TableActionsMenu", () => ({
  TableActionsMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({ disabled, onSelect, children }: { disabled?: boolean; onSelect?: (event: Event) => void; children?: ReactNode }) => (
    <button type="button" className="menu-item" disabled={disabled} onClick={(event) => onSelect?.(event.nativeEvent)}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <div />,
}))

vi.mock("@/components/domain/syllabus/DeadlineExtensionDialog", () => ({
  DeadlineExtensionDialog: (props: ExtensionProps) => {
    stubs.extension = props
    return null
  },
}))

const process = (): SyllabusProcess => ({
  id: "process-1",
  name: "Septiembre-Enero 2026-2027",
  state: "cerrado",
  template: "Plantilla institucional de sílabo",
  period_id: "period-1",
  period_name: "Septiembre-Enero 2026-2027",
  starts_at: "2026-09-22T05:00:00Z",
  due_at: "2027-01-03T04:59:59Z",
  convocations_count: 1,
  configurable: false,
  deletable: false,
  extensions_used: 0,
  extensions_max: 2,
  extension_limit_on: "2027-02-26",
  extension_block_reason: null,
})

const pausedProcess = () => ({ ...process(), state: "pausado" as const, deletable: true })
const openProcess = () => ({ ...process(), state: "abierto" as const, deletable: true })

const mountActions = (value = process()) => {
  const onCompleted = vi.fn()
  const ref = createRef<SyllabusProcessActionsHandle>()
  const view = render(<SyllabusProcessActions ref={ref} process={value} onCompleted={onCompleted} />)
  const run = (key: Parameters<SyllabusProcessActionsHandle["run"]>[0]): void => act(() => ref.current!.run(key))

  return { ...view, onCompleted, run }
}

type Mounted = ReturnType<typeof mountActions>

const menuItems = (view: Mounted) => [...view.container.querySelectorAll<HTMLButtonElement>(".menu-item")]
const menuItem = (view: Mounted, label: string) => menuItems(view).find((item) => item.textContent?.includes(label))

describe("SyllabusProcessActions", () => {
  afterEach(() => {
    vi.useRealTimers()
    stubs.extension = null
  })

  beforeEach(() => {
    vi.mocked(deleteProcess).mockReset().mockResolvedValue({ message: "Periodo académico eliminado." })
    vi.mocked(transitionProcess).mockReset()
  })

  it("elimina el periodo académico al primer clic, sin modal ni mensaje", async () => {
    const view = mountActions(openProcess())

    fireEvent.click(menuItem(view, "Eliminar")!)
    await flush()

    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    expect(deleteProcess).toHaveBeenCalledWith("process-1")
    expect(view.onCompleted.mock.calls).toEqual([["Periodo académico eliminado."]])
  })

  it("si el servidor rechaza eliminar lo avisa", async () => {
    vi.mocked(deleteProcess).mockRejectedValueOnce(new ApiError("Datos inválidos.", 422, { process: ["Un periodo académico cerrado no se elimina: queda como historial."] }))
    const view = mountActions(pausedProcess())

    view.run("eliminar")
    await flush()

    expect(toast.error).toHaveBeenCalledWith("Un periodo académico cerrado no se elimina: queda como historial")
    expect(view.onCompleted).not.toHaveBeenCalled()
  })

  it("pausar se aplica al primer clic, sin modal", async () => {
    vi.mocked(transitionProcess).mockResolvedValue({ message: "Proceso pausado." })
    const view = mountActions(openProcess())

    fireEvent.click(menuItem(view, "Pausar")!)
    await flush()

    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    expect(transitionProcess).toHaveBeenCalledWith("process-1", "pausar")
    expect(view.onCompleted.mock.calls).toEqual([["Proceso pausado."]])
  })

  it("si el servidor rechaza el cambio de estado lo avisa", async () => {
    vi.mocked(transitionProcess).mockRejectedValueOnce(new ApiError("No se puede pausar.", 422))
    const view = mountActions(openProcess())

    fireEvent.click(menuItem(view, "Pausar")!)
    await flush()

    expect(toast.error).toHaveBeenCalledWith("No se puede pausar")
    expect(view.onCompleted).not.toHaveBeenCalled()
  })

  it("finaliza el periodo académico al primer clic, sin modal ni frase", async () => {
    vi.mocked(transitionProcess).mockResolvedValue({ message: "Periodo académico cerrado." })
    const view = mountActions(openProcess())

    expect(menuItems(view).some((item) => item.textContent?.includes("Cerrar"))).toBe(false)
    fireEvent.click(menuItem(view, "Finalizar")!)
    await flush()

    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    expect(transitionProcess).toHaveBeenCalledWith("process-1", "cerrar")
    expect(view.onCompleted.mock.calls).toEqual([["Periodo académico cerrado."]])
  })

  it("un periodo académico pausado también ofrece finalizar", () => {
    const view = mountActions(pausedProcess())
    expect(menuItems(view).some((item) => item.textContent?.includes("Finalizar"))).toBe(true)
  })

  it("un periodo académico cerrado no ofrece finalizar ni eliminar", () => {
    const view = mountActions()
    expect(menuItems(view).some((item) => item.textContent?.includes("Finalizar"))).toBe(false)
    expect(menuItems(view).some((item) => item.textContent?.includes("Eliminar"))).toBe(false)
  })

  it("un periodo académico finalizado ofrece prorrogar el plazo para reabrirlo", () => {
    const view = mountActions()
    const extend = menuItem(view, "Prorrogar plazo")

    expect(extend).toBeDefined()
    expect(extend!.disabled).toBe(false)
    fireEvent.click(extend!)
    expect(stubs.extension!.open).toBe(true)
    expect(stubs.extension!.process).toMatchObject({ id: "process-1", state: "cerrado" })
  })

  it("un periodo académico finalizado que no se puede reabrir desactiva prorrogar y dice por qué", () => {
    const view = mountActions({ ...process(), extension_block_reason: "Hay otro periodo académico en curso; finalícelo o elimínelo antes de reabrir este." })
    const extend = menuItem(view, "Prorrogar plazo")

    expect(extend?.disabled).toBe(true)
    expect(extend?.textContent).toContain("Hay otro periodo académico en curso; finalícelo o elimínelo antes de reabrir este")
    expect(extend?.textContent).not.toContain("reabrir esta.")
  })

  it("tras prorrogar avisa con el mensaje del servidor cuando el panel ya se cerró", async () => {
    vi.useFakeTimers()
    const view = mountActions()

    view.run("prorrogar")
    await act(async () => {
      stubs.extension!.onSaved?.("Plazo prorrogado. El periodo académico se volvió a abrir.")
      await Promise.resolve()
    })

    expect(view.onCompleted).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(view.onCompleted.mock.calls).toEqual([["Plazo prorrogado. El periodo académico se volvió a abrir."]])
  })

  it("ofrece prorrogar mientras queden prórrogas", () => {
    const view = mountActions(openProcess())

    expect(menuItem(view, "Prorrogar plazo")?.disabled).toBe(false)
  })

  it("sin prórrogas disponibles desactiva prorrogar y dice por qué", () => {
    const view = mountActions({ ...openProcess(), extensions_used: 2, extension_block_reason: "Ya se usaron las 2 prórrogas de este periodo académico." })
    const extend = menuItem(view, "Prorrogar plazo")

    expect(extend?.disabled).toBe(true)
    expect(extend?.textContent).toContain("Ya se usaron las 2 prórrogas de este periodo académico")
  })

  it("un periodo académico en curso ofrece eliminar aunque tenga sílabos enviados", () => {
    const view = mountActions(openProcess())

    expect(menuItems(view).some((item) => item.textContent?.includes("Eliminar"))).toBe(true)
    expect(view.container.textContent).not.toContain("No se puede eliminar")
  })

  it("resuming after a template change resends with confirmar_rehacer, without a dialog", async () => {
    vi.mocked(transitionProcess)
      .mockRejectedValueOnce(new ApiError("La plantilla cambió.", 422, {}, {
        code: "plantilla_cambiada",
        counts: { sin_iniciar: 1, borrador: 2, en_revision: 1, correccion_solicitada: 0, aprobado: 1 },
      }))
      .mockResolvedValueOnce({ message: "Proceso reanudado. Los envíos vuelven a admitirse." })
    const view = mountActions(pausedProcess())

    view.run("reanudar")
    await flush()

    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    expect(transitionProcess).toHaveBeenNthCalledWith(1, "process-1", "reanudar")
    expect(transitionProcess).toHaveBeenNthCalledWith(2, "process-1", "reanudar", { confirmar_rehacer: true })
    expect(view.onCompleted.mock.calls).toEqual([["Proceso reanudado. Los envíos vuelven a admitirse."]])
  })
})
