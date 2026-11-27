import { fireEvent } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { deleteSubjectRequirement } from "@/api/career-academics"
import { keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { CurriculumRequirementDialogs } from "@/components/domain/academic/curriculum/CurriculumRequirementDialogs"
import type { CurriculumRequirement } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/career-academics", () => ({ deleteSubjectRequirement: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

afterEach(() => {
  vi.restoreAllMocks()
})

const names: Record<string, string> = { a: "Cálculo", b: "Física" }

function Harness({ requirement, onChanged }: { requirement: CurriculumRequirement; onChanged: (message: string) => void }) {
  const [selected, setSelected] = useState<CurriculumRequirement | null>(requirement)

  return (
    <CurriculumRequirementDialogs
      curriculumId="c1"
      editable
      subjectName={(id) => (id ? (names[id] ?? "materia") : "materia")}
      removePending={() => false}
      selectedRequirement={selected}
      onSelectedRequirementChange={setSelected}
      onChanged={onChanged}
    />
  )
}

describe("CurriculumRequirementDialogs", () => {
  it("al eliminar la relación, el modal conserva el título y sus materias mientras se cierra", async () => {
    keepClosingDialogs()
    vi.mocked(deleteSubjectRequirement).mockResolvedValue({ message: "Relación eliminada." } as never)
    const onChanged = vi.fn()
    const requirement: CurriculumRequirement = { id: "r1", requirement_id: "a", subject_id: "b" }
    renderWithProviders(<Harness requirement={requirement} onChanged={onChanged} />)
    await flush()

    fireEvent.click([...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent?.includes("Eliminar relación"))!)
    await flush()

    expect(deleteSubjectRequirement).toHaveBeenCalledWith("c1", "r1")
    expect(onChanged.mock.calls).toEqual([["Relación eliminada."]])
    const closing = document.body.querySelector('[role="dialog"][data-state="closed"]')!
    expect(closing.querySelector("h2")?.textContent).toBe("Prerrequisito")
    expect(closing.textContent).toContain("«Cálculo» → «Física»")
  })
})
