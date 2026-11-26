import { act, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buttonNamed, keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { CurriculumCanvas } from "@/components/domain/academic/curriculum/CurriculumCanvas"
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
const { updateSubjectLayout } = vi.hoisted(() => ({ updateSubjectLayout: vi.fn() }))

vi.mock("@/api/career-academics", () => ({
  updateSubjectLayout,
  createSubjectRequirement: vi.fn(),
  deleteSubjectRequirement: vi.fn(),
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

const baseProps = (overrides: Partial<Parameters<typeof CurriculumCanvas>[0]> = {}): Parameters<typeof CurriculumCanvas>[0] => ({
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
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("previsualiza el nuevo orden dentro del ciclo y envía ese ciclo al guardar", async () => {
    renderWithProviders(<CurriculumCanvas {...baseProps()} />)
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
    expect(updateSubjectLayout).toHaveBeenCalledWith("career", { subject_id: "a", cycle: 1, position: 2 })

    await call("onNodeClick", {}, addNode)
    await flush()
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Agregar materia")
  })

  it("solo permite modificar nodos y relaciones dentro del modo de edición autorizado", async () => {
    const view = renderWithProviders(<CurriculumCanvas {...baseProps({ editing: false, curriculum: { id: "career", cycle_count: 1, editable: true, lock_reason: null }, subjects: [subject("a", 0)] })} />)

    expect(nodes().some((item) => item.id === "add-subject-1")).toBe(false)
    expect(node("a").data.editable).toBe(false)
    expect(props().nodesDraggable).toBe(false)
    await call("onNodeDragStop", {}, { id: "a", type: "subject", position: { x: 0, y: 0 }, data: {} }, [])
    await flush()
    expect(updateSubjectLayout).not.toHaveBeenCalled()

    view.rerender(<CurriculumCanvas {...baseProps({ editing: true, curriculum: { id: "career", cycle_count: 1, editable: true, lock_reason: null }, subjects: [subject("a", 0)] })} />)
    expect(nodes().some((item) => item.id === "add-subject-1")).toBe(true)
    expect(node("a").data.editable).toBe(true)

    view.rerender(<CurriculumCanvas {...baseProps({ editing: true, curriculum: { id: "career", cycle_count: 1, editable: false, lock_reason: "Periodo académico activo" }, subjects: [subject("a", 0)] })} />)
    expect(nodes().some((item) => item.id === "add-subject-1")).toBe(false)
    expect(node("a").data.editable).toBe(false)
  })

  it("mueve una materia y abre la elección de relación desde el menú, sin arrastrar", async () => {
    renderWithProviders(<CurriculumCanvas {...baseProps({ curriculum: { id: "career", cycle_count: 1, editable: true, lock_reason: null }, subjects: [subject("a", 0), subject("b", 1)] })} />)

    expect(node("a").data).toMatchObject({ canMoveLeft: false, canMoveRight: true })
    expect(node("b").data).toMatchObject({ canMoveLeft: true, canMoveRight: false })

    await act(async () => {
      ;(node("a").data.onMoveRight as () => void)()
    })
    await flush()
    expect(updateSubjectLayout).toHaveBeenCalledWith("career", { subject_id: "a", cycle: 1, position: 1 })

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
    renderWithProviders(<CurriculumCanvas {...baseProps({ curriculum: { id: "career", cycle_count: 1, editable: true, lock_reason: null }, subjects: [subject("a", 0)] })} />)
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

  it("se recorre con scroll normal, sin arrastrar el fondo, y el zoom es fijo y se recuerda", async () => {
    const view = renderWithProviders(<CurriculumCanvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} />)
    for (const name of ["panOnDrag", "panOnScroll", "zoomOnScroll", "zoomOnPinch", "zoomOnDoubleClick", "preventScrolling"]) {
      expect(props()[name]).toBe(false)
    }
    expect(props().translateExtent).toBeUndefined()
    const scroll = document.body.querySelector("[data-curriculum-scroll]")!
    expect(scroll.classList).toContain("overflow-auto")
    expect(scroll.classList).toContain("top-14")

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

    renderWithProviders(<CurriculumCanvas {...baseProps({ editing: false, subjects: [subject("a", 0)] })} />)
    expect(parseFloat(board().style.width)).toBeCloseTo(fullWidth / 2, 0)
    expect(buttonNamed("Ajustar la malla al ancho disponible")).toHaveAttribute("aria-pressed", "false")
  })
})
