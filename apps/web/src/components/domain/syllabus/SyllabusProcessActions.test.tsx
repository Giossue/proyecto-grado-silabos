import { act, fireEvent, render } from "@testing-library/react"
import { createRef, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { deleteProcess, getProcessImpact, transitionProcess, type SyllabusProcess } from "@/api/processes"
import { SyllabusProcessActions, type SyllabusProcessActionsHandle } from "@/components/domain/syllabus/SyllabusProcessActions"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { flush } from "@/test/render"

type ExtensionProps = { open?: boolean; process: SyllabusProcess; onSaved?: (message: string) => void }

const stubs = vi.hoisted(() => ({
  fading: false,
  handlers: new WeakMap<Element, (open: boolean) => void>(),
  extension: null as ExtensionProps | null,
}))

vi.mock("@/api/processes", () => ({
  deleteProcess: vi.fn(),
  getProcessImpact: vi.fn(),
  transitionProcess: vi.fn(),
}))

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

vi.mock("@/components/ui/dialog", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  const Dialog = ({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }) => {
    if (!stubs.fading) return open ? <div data-dialog>{children}</div> : null
    return (
      <div
        data-modal
        data-state={open ? "open" : "closed"}
        ref={(element) => {
          if (element && onOpenChange) stubs.handlers.set(element, onOpenChange)
        }}
      >
        {children}
      </div>
    )
  }

  return {
    Dialog,
    DialogClose: passthrough,
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
  }
})

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

const mountActions = (value = process(), fading = false) => {
  stubs.fading = fading
  const onCompleted = vi.fn()
  const ref = createRef<SyllabusProcessActionsHandle>()
  const view = render(<SyllabusProcessActions ref={ref} process={value} onCompleted={onCompleted} />)
  const run = (key: Parameters<SyllabusProcessActionsHandle["run"]>[0]): void => act(() => ref.current!.run(key))

  return { ...view, onCompleted, run }
}

type Mounted = ReturnType<typeof mountActions>

const menuItems = (view: Mounted) => [...view.container.querySelectorAll<HTMLButtonElement>(".menu-item")]
const menuItem = (view: Mounted, label: string) => menuItems(view).find((item) => item.textContent?.includes(label))
const buttonWith = (view: Mounted, label: string) => [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(label))
const dialog = (view: Mounted) => view.container.querySelector("[data-dialog]")!
const type = async (selector: string, value: string): Promise<void> => {
  fireEvent.change(document.querySelector(selector)!, { target: { value } })
  await flush()
}
const submitDialog = async (view: Mounted): Promise<void> => {
  fireEvent.submit(view.container.querySelector("[data-dialog] form")!)
  await flush()
}
const emitOpen = (modal: Element, open: boolean): void => act(() => stubs.handlers.get(modal)?.(open))

describe("SyllabusProcessActions", () => {
  afterEach(() => {
    vi.useRealTimers()
    stubs.fading = false
    stubs.extension = null
  })

  beforeEach(() => {
    vi.mocked(deleteProcess).mockReset().mockResolvedValue({ message: "Periodo académico eliminado." })
    vi.mocked(getProcessImpact).mockReset().mockResolvedValue({
      syllabi: { sin_iniciar: 12, borrador: 3, en_revision: 5, correccion_solicitada: 0, aprobado: 2 },
      total: 22,
    })
    vi.mocked(transitionProcess).mockReset()
  })

  it("antes de eliminar muestra cuántos sílabos se borran y pide el mensaje y la frase", async () => {
    vi.useFakeTimers()
    const view = mountActions(openProcess())

    const remove = menuItem(view, "Eliminar")
    expect(remove).toBeDefined()
    fireEvent.click(remove!)
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(getProcessImpact).toHaveBeenCalledWith("process-1")
    expect(dialog(view).textContent).toContain("incluso los enviados y aprobados")
    expect([...dialog(view).querySelectorAll("tbody tr")].map((row) => row.textContent)).toEqual(["Sin iniciar12", "Borrador3", "En revisión5", "Corrección solicitada0", "Aprobado2", "Total22"])
    expect(dialog(view).querySelector('label[for="process-delete-message"]')!.textContent).toContain("Mensaje para docentes, coordinación y biblioteca")

    const confirm = (): HTMLButtonElement => buttonWith(view, "Eliminar periodo académico")!
    expect(confirm().disabled).toBe(true)
    fireEvent.change(document.querySelector("#process-delete-confirm")!, { target: { value: "eliminar periodo" } })
    expect(confirm().disabled).toBe(true)
    fireEvent.change(document.querySelector("#process-delete-message")!, { target: { value: "   " } })
    expect(confirm().disabled).toBe(true)
    fireEvent.change(document.querySelector("#process-delete-message")!, { target: { value: "  Se abrirá otra con las fechas correctas.  " } })
    expect(confirm().disabled).toBe(false)
    fireEvent.click(confirm())
    await act(async () => {
      await Promise.resolve()
    })

    expect(deleteProcess).toHaveBeenCalledWith("process-1", { mensaje: "Se abrirá otra con las fechas correctas." })
    expect(view.onCompleted).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(view.onCompleted.mock.calls).toEqual([["Periodo académico eliminado."]])
  })

  it("al cerrar, el modal de pausar sigue mostrando su contenido mientras se desvanece", async () => {
    const view = mountActions({ ...process(), state: "abierto" }, true)

    fireEvent.click(menuItem(view, "Pausar")!)
    const transition = view.container.querySelectorAll("[data-modal]")[0]!
    expect(transition.getAttribute("data-state")).toBe("open")
    emitOpen(transition, false)
    await flush()

    expect(transition.getAttribute("data-state")).toBe("closed")
    expect(transition.textContent).toContain("Pausar el periodo académico")
    expect(transition.textContent).toContain("Se detienen los envíos")
  })

  it("el mensaje y la frase de eliminar se borran al volver a abrir, no al cerrar", async () => {
    const view = mountActions(openProcess(), true)

    view.run("eliminar")
    await flush()
    await type("#process-delete-message", "Fechas equivocadas")
    await type("#process-delete-confirm", "eliminar periodo")
    const removal = view.container.querySelectorAll("[data-modal]")[1]!
    emitOpen(removal, false)
    await flush()

    expect(removal.getAttribute("data-state")).toBe("closed")
    expect(document.querySelector<HTMLTextAreaElement>("#process-delete-message")!.value).toBe("Fechas equivocadas")
    expect(document.querySelector<HTMLInputElement>("#process-delete-confirm")!.value).toBe("eliminar periodo")
    expect(removal.querySelectorAll("tbody tr")).not.toHaveLength(0)

    view.run("eliminar")
    await flush()
    expect(document.querySelector<HTMLTextAreaElement>("#process-delete-message")!.value).toBe("")
    expect(document.querySelector<HTMLInputElement>("#process-delete-confirm")!.value).toBe("")
  })

  it("muestra el error del mensaje que devuelve el servidor", async () => {
    vi.mocked(deleteProcess).mockRejectedValueOnce(new ApiError("Datos inválidos.", 422, { mensaje: ["El mensaje no puede pasar de 1000 caracteres."] }))
    const view = mountActions(pausedProcess())

    view.run("eliminar")
    await flush()
    await type("#process-delete-message", "Mensaje")
    await type("#process-delete-confirm", "eliminar periodo")
    fireEvent.click(buttonWith(view, "Eliminar periodo académico")!)
    await flush()

    expect(dialog(view).textContent).toContain("El mensaje no puede pasar de 1000 caracteres")
    expect(view.onCompleted).not.toHaveBeenCalled()
  })

  it("sin el conteo de sílabos no deja eliminar", async () => {
    vi.mocked(getProcessImpact).mockRejectedValueOnce(new ApiError("Sin conexión.", 500))
    const view = mountActions(openProcess())

    view.run("eliminar")
    await flush()
    await type("#process-delete-message", "Mensaje")
    await type("#process-delete-confirm", "eliminar periodo")

    expect(dialog(view).textContent).toContain("No se pudo saber cuántos sílabos se borran")
    expect(buttonWith(view, "Eliminar periodo académico")!.disabled).toBe(true)
  })

  it("finaliza el periodo académico tras ver lo que queda sin aprobar y escribir la frase", async () => {
    vi.mocked(transitionProcess).mockResolvedValue({ message: "Periodo académico cerrado." })
    const view = mountActions(openProcess())

    expect(menuItems(view).some((item) => item.textContent?.includes("Cerrar"))).toBe(false)
    const finish = menuItem(view, "Finalizar")
    expect(finish).toBeDefined()
    fireEvent.click(finish!)
    await flush()

    expect(getProcessImpact).toHaveBeenCalledWith("process-1")
    const text = dialog(view).textContent
    expect(text).toContain("Finalizar el periodo académico")
    expect(text).toContain("ya no se editan, envían, revisan ni firman")
    expect(text).toContain("un cambio de docente no los borra")
    expect(text).toContain("Puede volver a abrirlo con una prórroga mientras no hayan terminado las clases")
    expect(text).not.toContain("no se deshace")
    expect(text).toContain("Lo que no esté aprobado quedará solo para consulta")
    expect([...dialog(view).querySelectorAll("tbody tr")].map((row) => row.textContent)).toEqual(["Sin iniciar12", "Borrador3", "En revisión5", "Total20"])

    const confirm = (): HTMLButtonElement => view.container.querySelector<HTMLButtonElement>('[data-dialog] button[type="submit"]')!
    expect(confirm().textContent).toContain("Finalizar")
    expect(confirm().disabled).toBe(true)
    await type("#process-transition-confirm", "Cerrar periodo")
    expect(confirm().disabled).toBe(true)
    await submitDialog(view)
    expect(transitionProcess).not.toHaveBeenCalled()
    await type("#process-transition-confirm", "Finalizar periodo")
    expect(confirm().disabled).toBe(false)
    await submitDialog(view)

    expect(transitionProcess).toHaveBeenCalledWith("process-1", "cerrar", undefined)
    expect(view.onCompleted.mock.calls).toEqual([["Periodo académico cerrado."]])
  })

  it("con todo aprobado lo dice al finalizar, sin tabla", async () => {
    vi.mocked(getProcessImpact).mockResolvedValueOnce({
      syllabi: { sin_iniciar: 0, borrador: 0, en_revision: 0, correccion_solicitada: 0, aprobado: 7 },
      total: 7,
    })
    const view = mountActions(pausedProcess())

    view.run("cerrar")
    await flush()

    expect(dialog(view).textContent).toContain("Todos los sílabos están aprobados")
    expect(dialog(view).textContent).not.toContain("Lo que no esté aprobado")
    expect(dialog(view).querySelector("table")).toBeNull()
  })

  it("sin el conteo de sílabos no deja finalizar", async () => {
    vi.mocked(getProcessImpact).mockReturnValueOnce(new Promise(() => {}))
    const view = mountActions(openProcess())

    view.run("cerrar")
    await flush()
    await type("#process-transition-confirm", "finalizar periodo")

    expect(view.container.querySelector<HTMLButtonElement>('[data-dialog] button[type="submit"]')!.disabled).toBe(true)
  })

  it("avisa si no pudo saber lo que queda sin aprobar y no deja finalizar", async () => {
    vi.mocked(getProcessImpact).mockRejectedValueOnce(new ApiError("Sin conexión.", 500))
    const view = mountActions(openProcess())

    view.run("cerrar")
    await flush()
    await type("#process-transition-confirm", "finalizar periodo")

    expect(dialog(view).textContent).toContain("No se pudo saber cuántos sílabos quedan sin aprobar")
    expect(view.container.querySelector<HTMLButtonElement>('[data-dialog] button[type="submit"]')!.disabled).toBe(true)
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

  it("shows the state counts and requires explicit confirmation before rebuilding", async () => {
    vi.mocked(transitionProcess)
      .mockRejectedValueOnce(new ApiError("La plantilla cambió.", 422, {}, {
        code: "plantilla_cambiada",
        counts: { sin_iniciar: 1, borrador: 2, en_revision: 1, correccion_solicitada: 0, aprobado: 1 },
      }))
      .mockResolvedValueOnce({ message: "Proceso reanudado. Los envíos vuelven a admitirse." })
    const view = mountActions(pausedProcess())

    fireEvent.click(menuItems(view)[0]!)
    await flush()
    await submitDialog(view)

    expect(dialog(view).textContent).toContain("Borrador")
    expect(dialog(view).textContent).toContain("Corrección solicitada")
    expect(view.container.querySelector('[data-dialog] button[type="submit"]')!.textContent).toContain("Reanudar y adaptar sílabos")
    await submitDialog(view)
    expect(transitionProcess).toHaveBeenCalledTimes(1)
    await type("#process-transition-confirm", "adaptar silabos")
    await submitDialog(view)

    expect(transitionProcess).toHaveBeenNthCalledWith(1, "process-1", "reanudar", undefined)
    expect(transitionProcess).toHaveBeenNthCalledWith(2, "process-1", "reanudar", { confirmar_rehacer: true })
    expect(view.onCompleted.mock.calls).toEqual([["Proceso reanudado. Los envíos vuelven a admitirse."]])
  })
})
