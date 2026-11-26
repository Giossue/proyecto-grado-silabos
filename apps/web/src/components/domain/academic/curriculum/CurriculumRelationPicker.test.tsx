import { fireEvent } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buttonContaining, keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { CurriculumRelationPicker } from "@/components/domain/academic/curriculum/CurriculumRelationPicker"
import type { RelationMode } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { flush, renderWithProviders } from "@/test/render"
import type { CurriculumBuilderSubject } from "@/types/academic"

vi.mock("@/components/ui/select", async () => (await import("@/components/domain/academic/curriculum/curriculumTestUtils")).selectStub)

afterEach(() => {
  vi.restoreAllMocks()
})

const subject = (id: string, cycle: number, position: number) => ({ id, code: id.toUpperCase(), name: `Materia ${id}`, cycle, position }) as unknown as CurriculumBuilderSubject

type Picker = { subjectId: string; mode: RelationMode } | null

function Harness({ subjects, initial, onPick }: { subjects: CurriculumBuilderSubject[]; initial: Picker; onPick: (value: unknown) => void }) {
  const [picker, setPicker] = useState<Picker>(initial)

  return <CurriculumRelationPicker subjects={subjects} picker={picker} onPickerChange={setPicker} onPick={onPick} />
}

const choose = (value: string): void => {
  fireEvent.click(document.body.querySelector(`[data-value="${value}"]`)!)
}

describe("CurriculumRelationPicker", () => {
  it.each([
    ["requires", "b", "a", { sourceId: "a", targetId: "b" }],
    ["required-by", "a", "b", { sourceId: "a", targetId: "b" }],
  ] as const)("elige la dirección correcta en el modo %s", async (mode, current, other, expected) => {
    const onPick = vi.fn()
    renderWithProviders(<Harness subjects={[subject("a", 1, 0), subject("b", 2, 0)]} initial={{ subjectId: current, mode }} onPick={onPick} />)
    await flush()

    expect(document.body.querySelector(`[data-value="${current}"]`)).toBeNull()
    choose(other)
    await flush()
    fireEvent.click(buttonContaining("Agregar relación")!)
    await flush()

    expect(onPick).toHaveBeenCalledWith(expected)
  })

  it("en modo requiere solo ofrece materias de ciclos anteriores, agrupadas por ciclo", async () => {
    renderWithProviders(<Harness subjects={[subject("a", 1, 0), subject("b", 2, 0), subject("d", 2, 1), subject("c", 3, 0)]} initial={{ subjectId: "b", mode: "requires" }} onPick={vi.fn()} />)
    await flush()

    expect(document.body.querySelector('[data-value="a"]')).not.toBeNull()
    expect(document.body.querySelector('[data-value="d"]')).toBeNull()
    expect(document.body.querySelector('[data-value="c"]')).toBeNull()
    expect(document.body.textContent).toContain("Ciclo I")
  })

  it("al agregar la relación, el modal conserva la pregunta y las materias mientras se cierra", async () => {
    keepClosingDialogs()
    const onPick = vi.fn()
    renderWithProviders(<Harness subjects={[subject("a", 1, 0), subject("b", 2, 0), subject("c", 3, 0)]} initial={{ subjectId: "b", mode: "requires" }} onPick={onPick} />)
    await flush()
    choose("a")
    await flush()
    fireEvent.click(buttonContaining("Agregar relación")!)
    await flush()

    expect(onPick).toHaveBeenCalledWith({ sourceId: "a", targetId: "b" })
    const closing = document.body.querySelector('[role="dialog"][data-state="closed"]')!
    expect(closing.textContent).toContain("¿Qué materia requiere?")
    expect(closing.querySelector('[data-value="a"]')).not.toBeNull()
    expect(closing.querySelector('[data-value="b"]')).toBeNull()
  })
})
