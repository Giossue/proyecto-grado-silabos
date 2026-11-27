import { act, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"
import { buttonNamed, keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { CurriculumCanvas } from "@/components/domain/academic/curriculum/CurriculumCanvas"
import { layoutMoves, useCurriculumDraft } from "@/components/domain/academic/curriculum/useCurriculumDraft"
import { ApiError } from "@/api/client"
import { toast } from "@/lib/toast"
import { laneStart, subjectStep } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { flush, renderWithProviders } from "@/test/render"
import type { CurriculumBuilderSubject } from "@/types/academic"

type FlowNode = {
  id: string
  type?: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  extent?: [[number, number], [number, number]]
}
type FlowProps = Record<string, unknown> & { nodes: FlowNode[]; children?: ReactNode }

const flow = vi.hoisted(() => ({ props: null as unknown as Record<string, unknown> }))
const { updateSubjectLayout, createSubjectRequirement, deleteSubjectRequirement } = vi.hoisted(() => ({ updateSubjectLayout: vi.fn(), createSubjectRequirement: vi.fn(), deleteSubjectRequirement: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock("@/api/career-academics", () => ({
  updateSubjectLayout,
  createSubjectRequirement,
  deleteSubjectRequirement,
  createCareerRecord: vi.fn(),
  updateCareerRecord: vi.fn(),
  deleteCurriculumSubject: vi.fn(),
}))
vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    flow.props = props
    return <div data-flow>{props.children as ReactNode}</div>
  },
  ControlButton: ({ children, ...rest }: Record<string, unknown>) => (
    <button type="button" {...rest}>
      {children as ReactNode}
    </button>
  ),
  NodeChangeset: class {
    toArray(): unknown[] {
      return []
    }
    applyTo<T>(nodes: T): T {
      return nodes
    }
  },
  useReactFlow: () => ({ screenToFlowPosition: (point: unknown) => point }),
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
  ConnectionMode: { Loose: "loose", Strict: "strict" },
  MarkerType: { ArrowClosed: "arrowclosed" },
}))

const props = (): FlowProps => flow.props as FlowProps
const nodes = (): FlowNode[] => props().nodes
const node = (id: string): FlowNode => nodes().find((item) => item.id === id)!
const call = async (name: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await (props()[name] as (...values: unknown[]) => unknown)(...args)
  })
}

const subject = (id: string, position: number): CurriculumBuilderSubject => ({
  id,
  code: `SW-${id}`,
  name: `Materia ${id}`,
  cycle: 1,
  position,
  organization_unit: null,
  organization_unit_label: null,
  modality: null,
  modality_label: null,
  credits: null,
  total_hours: null,
  active: true,
  generates_syllabus: true,
  system_values: {},
  display_fields: [],
})

type HarnessProps = Omit<Parameters<typeof CurriculumCanvas>[0], "draft"> & { onSaved?: (message: string) => void; onFailed?: () => void }

/** The canvas with the draft the page gives it, and the two buttons the page puts in its header. */
function Canvas({ onSaved = () => undefined, onFailed = () => undefined, ...canvas }: HarnessProps) {
  const draft = useCurriculumDraft({ curriculumId: canvas.curriculum.id, subjects: canvas.subjects, requirements: canvas.requirements, onSaved, onFailed })

  return (
    <>
      <button type="button" data-dirty={String(draft.dirty)} onClick={() => void draft.save()}>
        Guardar cambios
      </button>
      <button type="button" onClick={draft.discard}>
        Descartar
      </button>
      <CurriculumCanvas {...canvas} draft={draft} />
    </>
  )
}

const dirty = (): boolean => buttonNamed("Guardar cambios")!.getAttribute("data-dirty") === "true"
const press = async (name: string): Promise<void> => {
  fireEvent.click(buttonNamed(name)!)
  await flush()
}
const order = (): string[] =>
  nodes()
    .filter((item) => item.type === "subject")
    .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x)
    .map((item) => item.id)
const edges = (): { id: string; style: { strokeDasharray?: string } }[] => props().edges as { id: string; style: { strokeDasharray?: string } }[]
const twoCycles = (): CurriculumBuilderSubject[] => [subject("a", 0), subject("b", 1), { ...subject("d", 0), cycle: 2 }]
const dragFirstToLast = async (): Promise<void> => {
  const dragged = { ...node("a"), position: { x: laneStart + 2 * subjectStep, y: 32 } }
  await call("onNodeDrag", {}, dragged, [dragged])
  await call("onNodeDragStop", {}, dragged, [])
  await flush()
}
const menuMove = async (id: string, action: "onMoveLeft" | "onMoveRight"): Promise<void> => {
  await act(async () => {
    ;(node(id).data[action] as () => void)()
  })
  await flush()
}

const baseProps = (overrides: Partial<HarnessProps> = {}): HarnessProps => ({
  career: { id: "career", name: "Software", modality: null },
  curriculum: { id: "career", cycle_count: 2, editable: true, lock_reason: null },
  editing: true,
  fixedFields: [],
  fixedFieldTotals: [],
  subjects: [subject("a", 0), subject("b", 1), subject("c", 2)],
  requirements: [],
  organizationUnits: [],
  modalityOptions: [],
  onChanged: vi.fn(),
  ...overrides,
})

describe("CurriculumCanvas", () => {
  beforeEach(() => {
    updateSubjectLayout.mockReset().mockResolvedValue({ message: "Posición actualizada." })
    createSubjectRequirement.mockReset().mockResolvedValue({ message: "Prerrequisito agregado." })
    deleteSubjectRequirement.mockReset()
    vi.mocked(toast.error).mockReset()
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("previsualiza el nuevo orden dentro del ciclo y no lo envía hasta guardar", async () => {
    renderWithProviders(<Canvas {...baseProps()} />)
    expect(node("cycle-1").data).not.toHaveProperty("unit")
    expect(node("add-subject-1").position.x).toBeGreaterThan(node("c").position.x + 274)
    const bounds = node("a").extent
    expect(bounds?.[1][0]).toBeGreaterThan(node("c").position.x + 274)
    expect(bounds?.[1][1]).toBeGreaterThan(bounds?.[0][1] ?? 0)
    const addNode = node("add-subject-1")
    const dragged = { ...node("a"), position: { x: laneStart + 2 * subjectStep, y: 238 + 48 } }

    await call("onNodeDrag", {}, dragged, [dragged])
    expect(node("b").position.x).toBe(laneStart)
    expect(node("c").position.x).toBe(laneStart + subjectStep)
    expect(node("a").position.y).toBe(32)

    await call("onNodeDrag", {}, { ...dragged, position: { ...dragged.position, y: -200 } }, [])
    expect(node("a").position.y).toBe(32)

    await call("onNodeDragStop", {}, { ...dragged, position: { x: laneStart, y: 32 } }, [])
    await flush()
    expect(updateSubjectLayout).not.toHaveBeenCalled()
    expect(order()).toEqual(["b", "c", "a"])
    expect(dirty()).toBe(true)

    await press("Guardar cambios")
    expect(updateSubjectLayout.mock.calls).toEqual([["career", { subject_id: "a", cycle: 1, position: 2 }]])

    await call("onNodeClick", {}, addNode)
    await flush()
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Agregar materia")
  })

  it("solo permite modificar nodos y relaciones dentro del modo de edición autorizado", async () => {
    const view = renderWithProviders(<Canvas {...baseProps({ editing: false, curriculum: { id: "career", cycle_count: 1, editable: true, lock_reason: null }, subjects: [subject("a", 0)] })} />)

    expect(nodes().some((item) => item.id === "add-subject-1")).toBe(false)
    expect(node("a").data.editable).toBe(false)
    expect(props().nodesDraggable).toBe(false)
    await call("onNodeDragStop", {}, { id: "a", type: "subject", position: { x: 0, y: 0 }, data: {} }, [])
    await flush()
    expect(updateSubjectLayout).not.toHaveBeenCalled()

    view.rerender(<Canvas {...baseProps({ editing: true, curriculum: { id: "career", cycle_count: 1, editable: true, lock_reason: null }, subjects: [subject("a", 0)] })} />)
    expect(nodes().some((item) => item.id === "add-subject-1")).toBe(true)
    expect(node("a").data.editable).toBe(true)

    view.rerender(<Canvas {...baseProps({ editing: true, curriculum: { id: "career", cycle_count: 1, editable: false, lock_reason: "Periodo académico activo" }, subjects: [subject("a", 0)] })} />)
    expect(nodes().some((item) => item.id === "add-subject-1")).toBe(false)
    expect(node("a").data.editable).toBe(false)
  })

  it("las conexiones son solo prerrequisitos: van de la salida de una materia a la entrada de otra", () => {
    renderWithProviders(<Canvas {...baseProps({ subjects: [subject("a", 0), subject("b", 1)] })} />)

    // In loose mode the library snaps an id-less pair of handles to the bottom one, even when pointing at the top one
    expect(props().connectionMode).toBe("strict")
  })

  it("mueve una materia y abre la elección de relación desde el menú, sin arrastrar", async () => {
    renderWithProviders(<Canvas {...baseProps({ curriculum: { id: "career", cycle_count: 1, editable: true, lock_reason: null }, subjects: [subject("a", 0), subject("b", 1)] })} />)

    expect(node("a").data).toMatchObject({ canMoveLeft: false, canMoveRight: true })
    expect(node("b").data).toMatchObject({ canMoveLeft: true, canMoveRight: false })

    await act(async () => {
      ;(node("a").data.onMoveRight as () => void)()
    })
    await flush()
    expect(updateSubjectLayout).not.toHaveBeenCalled()
    expect(order()).toEqual(["b", "a"])
    expect(node("a").data).toMatchObject({ canMoveLeft: true, canMoveRight: false })

    await act(async () => {
      ;(node("b").data.onRelate as (mode: string) => void)("requires")
    })
    await flush()
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain("Nueva relación académica")
    expect(dialog.textContent).toContain("¿Qué materia requiere?")
  })

  it("al cerrar el editor, el modal sigue mostrando la materia y se rehace al volver a abrirlo", async () => {
    keepClosingDialogs()
    renderWithProviders(<Canvas {...baseProps({ curriculum: { id: "career", cycle_count: 1, editable: true, lock_reason: null }, subjects: [subject("a", 0)] })} />)
    const edit = async (): Promise<void> => {
      await act(async () => {
        ;(node("a").data.onEdit as () => void)()
      })
      await flush()
    }
    const code = (): HTMLInputElement => document.body.querySelector<HTMLInputElement>('input[name="code"]')!

    await edit()
    fireEvent.change(code(), { target: { value: "SW-cambio" } })
    fireEvent.click(buttonNamed("Cancelar")!)
    await flush()

    const closing = document.body.querySelector('[role="dialog"][data-state="closed"]')!
    expect(closing.textContent).toContain("Editar materia")
    expect(code().value).toBe("SW-cambio")

    await edit()
    expect(document.body.querySelector('[role="dialog"][data-state="open"]')).not.toBeNull()
    expect(code().value).toBe("SW-a")
  })

  it("al guardar envía lo movido y lo unido, avisa una sola vez y deja la malla sin cambios pendientes", async () => {
    const onSaved = vi.fn()
    renderWithProviders(<Canvas {...baseProps({ subjects: twoCycles(), onSaved })} />)
    expect(dirty()).toBe(false)

    await menuMove("a", "onMoveRight")
    await call("onConnect", { source: "a", target: "d" })
    await flush()
    expect(updateSubjectLayout).not.toHaveBeenCalled()
    expect(createSubjectRequirement).not.toHaveBeenCalled()
    expect(edges()).toHaveLength(1)
    expect(edges()[0]!.style.strokeDasharray).toBeTruthy()

    await press("Guardar cambios")
    expect(updateSubjectLayout).toHaveBeenCalledTimes(1)
    expect(createSubjectRequirement.mock.calls).toEqual([["career", { requirement_id: "a", subject_id: "d" }]])
    expect(onSaved.mock.calls).toEqual([["Cambios de la malla guardados"]])
    expect(dirty()).toBe(false)
  })

  it("«Descartar» vuelve a la malla guardada sin enviar nada", async () => {
    renderWithProviders(<Canvas {...baseProps({ subjects: twoCycles() })} />)
    await menuMove("a", "onMoveRight")
    await call("onConnect", { source: "a", target: "d" })
    await flush()

    await press("Descartar")
    expect(order()).toEqual(["a", "b", "d"])
    expect(edges()).toHaveLength(0)
    expect(dirty()).toBe(false)
    expect(updateSubjectLayout).not.toHaveBeenCalled()
    expect(createSubjectRequirement).not.toHaveBeenCalled()
  })

  it("devolver una materia a su lugar no deja nada por guardar", async () => {
    renderWithProviders(<Canvas {...baseProps()} />)
    await dragFirstToLast()
    expect(dirty()).toBe(true)

    await menuMove("a", "onMoveLeft")
    await menuMove("a", "onMoveLeft")
    expect(order()).toEqual(["a", "b", "c"])
    expect(dirty()).toBe(false)
  })

  it("rechaza al momento un prerrequisito del mismo ciclo y no repite uno que ya existe", async () => {
    renderWithProviders(<Canvas {...baseProps({ subjects: twoCycles(), requirements: [{ id: "r1", requirement_id: "a", subject_id: "d" }] })} />)

    await call("onConnect", { source: "a", target: "b" })
    expect(vi.mocked(toast.error).mock.calls).toEqual([["Un prerrequisito debe estar en un ciclo anterior"]])
    await call("onConnect", { source: "a", target: "d" })
    expect(edges()).toHaveLength(1)
    expect(dirty()).toBe(false)
  })

  it("quitar un prerrequisito que aún no se guardó no llama a la API", async () => {
    renderWithProviders(<Canvas {...baseProps({ subjects: twoCycles() })} />)
    await call("onConnect", { source: "a", target: "d" })
    await flush()

    await call("onEdgeClick", {}, edges()[0])
    await flush()
    await press("Eliminar relación")
    expect(deleteSubjectRequirement).not.toHaveBeenCalled()
    expect(edges()).toHaveLength(0)
    expect(dirty()).toBe(false)
  })

  it("si algo falla al guardar, muestra el motivo, recarga y conserva lo que falta", async () => {
    createSubjectRequirement.mockRejectedValue(new ApiError("El periodo académico está abierto.", 422))
    const onSaved = vi.fn()
    const onFailed = vi.fn()
    renderWithProviders(<Canvas {...baseProps({ subjects: twoCycles(), onSaved, onFailed })} />)
    await call("onConnect", { source: "a", target: "d" })
    await flush()

    await press("Guardar cambios")
    expect(vi.mocked(toast.error).mock.calls).toEqual([["El periodo académico está abierto"]])
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(edges()).toHaveLength(1)
    expect(dirty()).toBe(true)
  })

  it("lo pendiente se conserva cuando la malla se recarga con una materia nueva", async () => {
    const view = renderWithProviders(<Canvas {...baseProps()} />)
    await dragFirstToLast()

    view.rerender(<Canvas {...baseProps({ subjects: [subject("a", 0), subject("b", 1), subject("c", 2), subject("e", 3)] })} />)
    await flush()
    expect(order()).toEqual(["b", "c", "a", "e"])
    expect(dirty()).toBe(true)
  })

  it("calcula los movimientos mínimos para llegar al orden elegido", () => {
    const replay = (saved: string[], wanted: string[]): { moves: number; result: string[] } => {
      const result = [...saved]
      const moves = layoutMoves(saved, wanted)
      for (const move of moves) {
        result.splice(result.indexOf(move.subjectId), 1)
        result.splice(move.position, 0, move.subjectId)
      }
      return { moves: moves.length, result }
    }

    expect(replay(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toEqual({ moves: 0, result: ["a", "b", "c", "d"] })
    expect(replay(["a", "b", "c", "d"], ["b", "c", "d", "a"])).toEqual({ moves: 1, result: ["b", "c", "d", "a"] })
    expect(replay(["a", "b", "c", "d"], ["d", "a", "b", "c"])).toEqual({ moves: 1, result: ["d", "a", "b", "c"] })
    expect(replay(["a", "b", "c", "d"], ["d", "c", "b", "a"])).toEqual({ moves: 3, result: ["d", "c", "b", "a"] })
  })

  it("se recorre con scroll normal, sin arrastrar el fondo, y el zoom es fijo y se recuerda", async () => {
    const view = renderWithProviders(<Canvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} />)
    for (const name of ["panOnDrag", "panOnScroll", "zoomOnScroll", "zoomOnPinch", "zoomOnDoubleClick", "preventScrolling"]) {
      expect(props()[name]).toBe(false)
    }
    expect(props().translateExtent).toBeUndefined()
    const scroll = document.body.querySelector("[data-curriculum-scroll]")!
    expect(scroll.classList).toContain("overflow-auto")
    expect(scroll.classList).toContain("left-14")
    expect(scroll.classList).not.toContain("top-14")

    const board = (): HTMLElement => document.body.querySelector<HTMLElement>("[data-curriculum-board]")!
    const fullWidth = parseFloat(board().style.width)
    expect(buttonNamed("Acercar la malla")).toBeDisabled()
    fireEvent.click(buttonNamed("Alejar la malla")!)
    fireEvent.click(buttonNamed("Alejar la malla")!)
    await flush()
    expect(parseFloat(board().style.width)).toBeCloseTo(fullWidth / 2, 0)
    expect(buttonNamed("Ajustar la malla al ancho disponible")).toHaveAttribute("aria-pressed", "false")
    expect(localStorage.getItem("curriculum-zoom")).toBe("0.5")
    view.unmount()

    renderWithProviders(<Canvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} />)
    expect(parseFloat(board().style.width)).toBeCloseTo(fullWidth / 2, 0)
    expect(buttonNamed("Ajustar la malla al ancho disponible")).toHaveAttribute("aria-pressed", "false")
  })

  it("pone los botones de navegación en una sola columna, todos con fondo", () => {
    renderWithProviders(<Canvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} />)
    const zoom = document.body.querySelector('[aria-label="Zoom de la malla"]')!
    const column = zoom.parentElement!
    expect(column.classList).toContain("flex-col")
    expect(zoom.classList).toContain("flex-col")
    expect(column.classList).toContain("bottom-1")
    expect(column.classList).not.toContain("top-3")
    const buttons = [...column.querySelectorAll("button")]
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Acercar la malla",
      "Alejar la malla",
      "Ajustar la malla al ancho disponible",
      "Cómo moverse por la malla",
      "Ver leyenda y totales de la malla",
    ])
    expect(buttons.every((button) => button.classList.contains("bg-card/90"))).toBe(true)
  })

  it("avisa dónde empieza la malla, también al cambiar el zoom, para alinear con ella el título de la página", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly report: ResizeObserverCallback) {}
        observe(): void {
          this.report([{ contentRect: { width: 2000 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
        }
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const onBoardInset = vi.fn()
    renderWithProviders(<Canvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} onBoardInset={onBoardInset} />)
    await flush()
    // Left: 56 px of the button column + (2000 − 1216) / 2 of centring + 48 px of board margin. Right: the same without the buttons
    expect(onBoardInset).toHaveBeenLastCalledWith({ left: 496, right: 440 })

    fireEvent.click(buttonNamed("Alejar la malla")!)
    await flush()
    // At 75 %: 56 + (2000 − 912) / 2 + 36
    expect(onBoardInset).toHaveBeenLastCalledWith({ left: 636, right: 580 })
  })

  it("cuenta la barra de desplazamiento en el margen derecho de la malla", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly report: ResizeObserverCallback) {}
        observe(target: Element): void {
          Object.defineProperty(target, "offsetWidth", { configurable: true, value: 2015 })
          Object.defineProperty(target, "clientWidth", { configurable: true, value: 2000 })
          this.report([{ contentRect: { width: 2000 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
        }
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const onBoardInset = vi.fn()
    renderWithProviders(<Canvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} onBoardInset={onBoardInset} />)
    await flush()
    expect(onBoardInset).toHaveBeenLastCalledWith({ left: 496, right: 455 })
  })

  it("muestra la cabecera sobre la malla, alineada con su contenido, y sin cabecera no deja nada", () => {
    const view = renderWithProviders(<Canvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} header={<span data-testid="malla-header">Malla SW-9</span>} />)
    const scroll = document.body.querySelector("[data-curriculum-scroll]")!
    const header = scroll.querySelector<HTMLElement>("[data-curriculum-header]")!
    expect(header.querySelector('[data-testid="malla-header"]')).not.toBeNull()
    expect(header.nextElementSibling).toBe(scroll.querySelector("[data-curriculum-board]"))
    expect(header.style.paddingLeft).not.toBe("")
    view.unmount()

    renderWithProviders(<Canvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} />)
    expect(document.body.querySelector("[data-curriculum-header]")).toBeNull()
  })
})
