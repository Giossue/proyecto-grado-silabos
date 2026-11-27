import { act, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { deleteCurriculumSubject } from "@/api/career-academics"
import { CurriculumSubjectNode } from "@/components/domain/academic/curriculum/CurriculumSubjectNode"
import { flushMicrotasks } from "@/components/domain/academic/curriculum/curriculumTestUtils"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { renderWithProviders } from "@/test/render"
import type { CurriculumBuilderSubject } from "@/types/academic"

vi.mock("@/api/career-academics", () => ({ deleteCurriculumSubject: vi.fn() }))
vi.mock("@xyflow/react", () => ({
  Handle: ({ type, isConnectable, children, "aria-label": label }: { type: string; isConnectable?: boolean; children?: ReactNode; "aria-label"?: string }) => (
    <div data-handle={type} data-connectable={String(isConnectable)} aria-label={label}>
      {children}
    </div>
  ),
  Position: { Top: "top", Bottom: "bottom" },
}))
vi.mock("@/components/domain/TableActionsMenu", () => ({ TableActionsMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div> }))
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({ onSelect, disabled, children }: { onSelect?: () => void; disabled?: boolean; children?: ReactNode }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}))

const subject = { id: "s1", code: "SW-1", name: "Cálculo", cycle: 1, position: 0, modality_label: null, generates_syllabus: true, display_fields: [] } as unknown as CurriculumBuilderSubject

describe("CurriculumSubjectNode", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [1, 3, ["source"], ["Es requisito de otra materia…"]],
    [2, 3, ["target", "source"], ["Requiere otra materia…", "Es requisito de otra materia…"]],
    [3, 3, ["target"], ["Requiere otra materia…"]],
    [1, 1, [], []],
  ])("la materia del ciclo %i de %i solo ofrece las conexiones posibles, en el icono + y en su menú", (cycle, cycleCount, offered, relations) => {
    renderWithProviders(
      <CurriculumSubjectNode
        data={{
          career: { id: "career", name: "Software", modality: null },
          curriculum: { id: "c1", cycle_count: cycleCount, editable: true, lock_reason: null },
          fixedFields: [],
          subject: { ...subject, cycle },
          unitStyle: { backgroundColor: "", color: "" },
          editable: true,
          onEdit: vi.fn(),
          canMoveLeft: false,
          canMoveRight: false,
          onMoveLeft: vi.fn(),
          onMoveRight: vi.fn(),
          onRelate: vi.fn(),
          onSaved: vi.fn(),
        }}
      />,
    )
    // Both stay mounted so the requirement lines can attach; only the possible ones show an icon and connect.
    const handles = [...document.querySelectorAll("[data-handle]")]
    expect(handles.map((handle) => handle.getAttribute("data-handle"))).toEqual(["target", "source"])
    const shown = handles.filter((handle) => handle.querySelector("svg") && handle.getAttribute("aria-label") && handle.getAttribute("data-connectable") === "true")
    expect(shown.map((handle) => handle.getAttribute("data-handle"))).toEqual(offered)
    expect(handles.filter((handle) => !shown.includes(handle)).every((handle) => !handle.querySelector("svg") && handle.getAttribute("data-connectable") === "false")).toBe(true)
    const menu = [...document.querySelectorAll("button")].map((item) => item.textContent?.trim())
    expect(menu).toEqual(["Editar", "Mover a la izquierda", "Mover a la derecha", ...relations, "Eliminar"])
  })

  it("al eliminar la materia, avisa a la malla solo cuando el modal terminó de cerrarse", async () => {
    vi.mocked(deleteCurriculumSubject).mockResolvedValue({ message: "Materia eliminada." } as never)
    const onSaved = vi.fn()
    renderWithProviders(
      <CurriculumSubjectNode
        data={{
          career: { id: "career", name: "Software", modality: null },
          curriculum: { id: "c1", cycle_count: 1, editable: true, lock_reason: null },
          fixedFields: [],
          subject,
          unitStyle: { backgroundColor: "", color: "" },
          editable: true,
          onEdit: vi.fn(),
          canMoveLeft: false,
          canMoveRight: false,
          onMoveLeft: vi.fn(),
          onMoveRight: vi.fn(),
          onRelate: vi.fn(),
          onSaved,
        }}
      />,
    )
    fireEvent.click([...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Eliminar")!)
    await flushMicrotasks()
    fireEvent.click([...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent?.includes("Eliminar materia"))!)
    await flushMicrotasks()

    expect(deleteCurriculumSubject).toHaveBeenCalledWith("c1", "s1")
    expect(onSaved).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(onSaved).toHaveBeenCalledWith("Materia eliminada.")
  })
})
