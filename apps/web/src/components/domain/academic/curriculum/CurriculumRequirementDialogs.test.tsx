import { fireEvent } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createSubjectRequirement, deleteSubjectRequirement } from "@/api/career-academics"
import { keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { CurriculumRequirementDialogs, useRequirementConnection } from "@/components/domain/academic/curriculum/CurriculumRequirementDialogs"
import type { CurriculumRequirement } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { toast } from "@/lib/toast"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/career-academics", () => ({ createSubjectRequirement: vi.fn(), deleteSubjectRequirement: vi.fn() }))
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
      subjectCycle={() => 1}
      selectedRequirement={selected}
      onSelectedRequirementChange={setSelected}
      onChanged={onChanged}
    />
  )
}

const cycles: Record<string, number> = { a: 1, b: 2, c: 2 }

function ConnectHarness({ sourceId, targetId, onChanged }: { sourceId: string; targetId: string; onChanged: (message: string) => void }) {
  const { connect } = useRequirementConnection({ curriculumId: "c1", editable: true, subjectCycle: (id) => (id ? (cycles[id] ?? null) : null), onChanged })

  return (
    <button type="button" onClick={() => void connect({ sourceId, targetId })}>
      Conectar
    </button>
  )
}

const clickConnect = async (): Promise<void> => {
  fireEvent.click([...document.body.querySelectorAll("button")].find((button) => button.textContent === "Conectar")!)
  await flush()
}

describe("useRequirementConnection", () => {
  it("guarda como prerrequisito una materia de un ciclo anterior sin enviar un tipo de requisito", async () => {
    vi.mocked(createSubjectRequirement).mockResolvedValue({ message: "Prerrequisito agregado." } as never)
    const onChanged = vi.fn()
    renderWithProviders(<ConnectHarness sourceId="a" targetId="b" onChanged={onChanged} />)
    await flush()
    await clickConnect()

    expect(vi.mocked(createSubjectRequirement).mock.calls).toEqual([["c1", { requirement_id: "a", subject_id: "b" }]])
    expect(onChanged.mock.calls).toEqual([["Prerrequisito agregado."]])
  })

  it("rechaza una materia del mismo ciclo sin llamar a la API", async () => {
    vi.mocked(createSubjectRequirement).mockClear()
    const onChanged = vi.fn()
    renderWithProviders(<ConnectHarness sourceId="c" targetId="b" onChanged={onChanged} />)
    await flush()
    await clickConnect()

    expect(createSubjectRequirement).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error).mock.calls.at(-1)).toEqual(["Un prerrequisito debe estar en un ciclo anterior"])
  })
})

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
