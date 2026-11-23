import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { createCareerRecord, updateCareerRecord } from "@/api/career-academics"
import { CurriculumVisualSubjectForm } from "@/components/domain/academic/curriculum/CurriculumVisualSubjectForm"
import { flush, renderWithProviders } from "@/test/render"
import type { CurriculumBuilderSubject } from "@/types/academic"

vi.mock("@/api/career-academics", () => ({ createCareerRecord: vi.fn(), updateCareerRecord: vi.fn() }))
vi.mock("@/components/ui/select", async () => (await import("@/components/domain/academic/curriculum/curriculumTestUtils")).selectStub)

const subject = (generates: boolean): CurriculumBuilderSubject => ({
  id: "s1", code: "SW-801", name: "Prácticas", cycle: 8, position: 0, organization_unit: "profesional", organization_unit_label: "Profesional",
  modality: null, modality_label: null, credits: "4", total_hours: 192, active: true, generates_syllabus: generates, system_values: {}, display_fields: [],
})

const fixedFields: never[] = []
const renderForm = (value: CurriculumBuilderSubject | null) =>
  renderWithProviders(
    <CurriculumVisualSubjectForm
      career={{ id: "c1", name: "Software", modality: null }}
      modalityOptions={[]}
      curriculum={{} as never}
      fixedFields={fixedFields}
      subject={value}
      cycle={8}
      position={0}
      organizationUnits={[]}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
    />,
  )

const submit = async (): Promise<void> => {
  fireEvent.submit(document.querySelector("form")!)
  await flush()
}

describe("CurriculumVisualSubjectForm", () => {
  beforeEach(() => {
    vi.mocked(createCareerRecord).mockReset().mockResolvedValue({ message: "Materia creada." } as never)
    vi.mocked(updateCareerRecord).mockReset().mockResolvedValue({ message: "Materia actualizada." } as never)
  })

  it("una materia nueva genera sílabos y el interruptor lo apaga", async () => {
    renderForm(null)
    const toggle = screen.getByRole("switch")
    expect(toggle).toHaveAttribute("aria-checked", "true")
    expect(document.body.textContent).toContain("Puede generar sílabos")

    fireEvent.click(toggle)
    await submit()

    expect(createCareerRecord).toHaveBeenCalledWith("asignatura", expect.objectContaining({ generates_syllabus: "0" }))
  })

  it("al editar conserva el valor de la materia", async () => {
    renderForm(subject(false))
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false")

    await submit()

    expect(updateCareerRecord).toHaveBeenCalledWith("asignatura", "s1", expect.objectContaining({ generates_syllabus: "0" }))
  })

  it("el código repetido se muestra una sola vez y se quita al corregir el código", async () => {
    vi.mocked(createCareerRecord).mockRejectedValue(new ApiError("Ya existe una materia con ese código.", 422, { code: ["Ya existe una materia con ese código."] }))
    renderForm(null)
    await submit()

    expect(document.body.textContent!.split("Ya existe una materia con ese código")).toHaveLength(2)
    fireEvent.input(document.querySelector('input[name="code"]')!, { target: { value: "SW-802" } })
    await flush()
    expect(document.body.textContent).not.toContain("Ya existe una materia con ese código")
  })
})
