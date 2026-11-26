import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { createCareerRecord, updateCareerRecord } from "@/api/career-academics"
import { CurriculumVisualSubjectForm } from "@/components/domain/academic/curriculum/CurriculumVisualSubjectForm"
import { flush, renderWithProviders } from "@/test/render"
import type { CurriculumBuilderSubject, FixedSubjectField } from "@/types/academic"

vi.mock("@/api/career-academics", () => ({ createCareerRecord: vi.fn(), updateCareerRecord: vi.fn() }))
vi.mock("@/components/ui/select", async () => (await import("@/components/domain/academic/curriculum/curriculumTestUtils")).selectStub)

const subject = (generates: boolean): CurriculumBuilderSubject => ({
  id: "s1", code: "SW-801", name: "Prácticas", cycle: 8, position: 0, organization_unit: "profesional", organization_unit_label: "Profesional",
  modality: null, modality_label: null, credits: "4", total_hours: 192, active: true, generates_syllabus: generates, system_values: {}, display_fields: [],
})

const NO_FIELDS: FixedSubjectField[] = []
const HOUR_FIELDS = [["horas_ac", "ACD"], ["horas_pae", "APE"], ["horas_aa", "AA"], ["creditos", "CRED"], ["horas_totales", "TOTAL"]].map(
  ([key, label]) => ({ id: key, key, label, type: "entero", system_key: key, system_label: label, position: 0, visible_on_card: true, totalizable: true }) as FixedSubjectField,
)
const MODALITIES = [{ value: "presencial", label: "Presencial" }, { value: "hibrida", label: "Híbrida" }, { value: "en_linea", label: "En línea" }]
const FACE_TO_FACE = MODALITIES[0]!

type Setup = { fields?: FixedSubjectField[]; modality?: { value: string; label: string } | null }
const renderForm = (value: CurriculumBuilderSubject | null, { fields = NO_FIELDS, modality = FACE_TO_FACE }: Setup = {}) =>
  renderWithProviders(
    <CurriculumVisualSubjectForm
      career={{ id: "c1", name: "Software", modality }}
      modalityOptions={MODALITIES}
      curriculum={{ id: "malla-2" } as never}
      fixedFields={fields}
      subject={value}
      cycle={8}
      position={0}
      organizationUnits={[{ value: "profesional", label: "Profesional" }]}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
    />,
  )

const fillNew = async (): Promise<void> => {
  fireEvent.input(document.querySelector('input[name="code"]')!, { target: { value: "SW-801" } })
  fireEvent.input(document.querySelector('input[name="nombre"]')!, { target: { value: "Prácticas" } })
  fireEvent.click(document.querySelector('[data-value="profesional"]')!)
  await flush()
}

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
    await fillNew()
    await submit()

    expect(createCareerRecord).toHaveBeenCalledWith("asignatura", expect.objectContaining({ generates_syllabus: "0" }))
  })

  it("una materia nueva se crea en la malla que se está viendo", async () => {
    renderForm(null)
    await fillNew()
    await submit()

    expect(createCareerRecord).toHaveBeenCalledWith("asignatura", expect.objectContaining({ malla_id: "malla-2", code: "SW-801" }))
  })

  it("no pide el total: solo las horas y los créditos", () => {
    renderForm(null, { fields: HOUR_FIELDS })

    expect(["horas_ac", "horas_pae", "horas_aa", "creditos"].filter((name) => document.querySelector(`input[name="${name}"]`))).toHaveLength(4)
    expect(document.querySelector('input[name="horas_totales"]')).toBeNull()
    expect(document.body.textContent).not.toContain("TOTAL")
  })

  const modalitySelect = (): Element => document.querySelector('[data-value="hibrida"]')!.closest("[data-select]")!
  const chooseModality = async (value: string): Promise<void> => {
    fireEvent.click(modalitySelect().querySelector(`[data-value="${value}"]`)!)
    await flush()
  }

  it("la modalidad sale ya puesta con la de la carrera, sin «Igual que la carrera», y queda heredada", async () => {
    renderForm(null, { modality: FACE_TO_FACE })
    expect(modalitySelect().getAttribute("data-selected")).toBe("presencial")
    expect([...modalitySelect().querySelectorAll("[data-value]")].map((option) => option.textContent)).toEqual(["Presencial", "Híbrida", "En línea"])
    expect(document.body.textContent).not.toContain("Igual que la carrera")

    await fillNew()
    await submit()
    expect(createCareerRecord).toHaveBeenLastCalledWith("asignatura", expect.objectContaining({ modality: "" }))
  })

  it("la modalidad lleva el asterisco de obligatoria", () => {
    renderForm(null)

    expect(document.querySelector('label[for="visual-subject-modality-8"]')!.textContent).toContain("(obligatorio)")
  })

  it("si la carrera no tiene modalidad, pide elegirla antes de guardar", async () => {
    renderForm(null, { modality: null })
    await fillNew()
    await submit()
    expect(document.body.textContent).toContain("El campo modalidad es obligatorio")
    expect(createCareerRecord).not.toHaveBeenCalled()

    await chooseModality("hibrida")
    expect(document.body.textContent).not.toContain("El campo modalidad es obligatorio")
    await submit()
    expect(createCareerRecord).toHaveBeenLastCalledWith("asignatura", expect.objectContaining({ modality: "hibrida" }))
  })

  it("otra modalidad se guarda y volver a la de la carrera la deja heredada", async () => {
    renderForm({ ...subject(true), modality: "hibrida" }, { modality: FACE_TO_FACE })
    expect(modalitySelect().getAttribute("data-selected")).toBe("hibrida")
    await submit()
    expect(updateCareerRecord).toHaveBeenLastCalledWith("asignatura", "s1", expect.objectContaining({ modality: "hibrida" }))

    await chooseModality("presencial")
    await submit()
    expect(updateCareerRecord).toHaveBeenLastCalledWith("asignatura", "s1", expect.objectContaining({ modality: "" }))
  })

  it("una modalidad propia igual a la de la carrera se conserva al editar", async () => {
    renderForm({ ...subject(true), modality: "presencial" }, { modality: FACE_TO_FACE })
    await submit()

    expect(updateCareerRecord).toHaveBeenLastCalledWith("asignatura", "s1", expect.objectContaining({ modality: "presencial" }))
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
    await fillNew()
    await submit()

    expect(document.body.textContent!.split("Ya existe una materia con ese código")).toHaveLength(2)
    fireEvent.input(document.querySelector('input[name="code"]')!, { target: { value: "SW-802" } })
    await flush()
    expect(document.body.textContent).not.toContain("Ya existe una materia con ese código")
  })

  it("una materia nueva sin código, nombre ni unidad muestra los errores y no llama al servidor", async () => {
    renderForm(null)
    await submit()

    expect(document.body.textContent).toContain("El campo código es obligatorio")
    expect(document.body.textContent).toContain("El campo nombre es obligatorio")
    expect(document.body.textContent).toContain("El campo unidad de organización curricular es obligatorio")
    expect(createCareerRecord).not.toHaveBeenCalled()
  })
})
