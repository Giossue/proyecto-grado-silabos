import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getCurriculum, getScheduledSubjects, getTeacherAssignments, type Curriculum } from "@/api/career-academics"
import { getSession } from "@/api/session"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { flush, renderWithProviders } from "@/test/render"
import { CoordinationAcademicStructurePage } from "./CoordinationAcademicStructurePage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/career-academics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/career-academics")>()),
  getCurriculum: vi.fn(),
  getScheduledSubjects: vi.fn(),
  getTeacherAssignments: vi.fn(),
}))
vi.mock("@/components/domain/academic/curriculum/CurriculumCanvas", () => ({
  CurriculumCanvas: ({ editing, onChanged }: { editing: boolean; onChanged: (message: string) => void }) => (
    <div data-testid="canvas" data-editing={String(editing)}>
      <button type="button" onClick={() => onChanged("Malla actualizada.")}>
        cambiar malla
      </button>
    </div>
  ),
}))
vi.mock("@/components/domain/academic/curriculum/CurriculumConfigurationDialog", () => ({ CurriculumConfigurationDialog: () => null }))
vi.mock("@/components/domain/ProcessLockAlert", () => ({ ProcessLockAlert: () => <div>Pause la convocatoria para editar</div> }))

const curriculum = (editable = true): Curriculum =>
  ({
    career: { id: "career-1", name: "Software", modality: null },
    curriculum: { id: "career-1", cycle_count: 8, editable, lock_reason: editable ? null : "Convocatoria activa" },
    fixedFields: [],
    fixedFieldTotals: [],
    subjects: [],
    requirements: [],
    modalityOptions: [],
    organizationUnitOptions: [],
  }) as unknown as Curriculum

const canvasEditing = (): string | null => document.querySelector('[data-testid="canvas"]')!.getAttribute("data-editing")
const editButton = (): HTMLButtonElement => [...document.querySelectorAll("button")].find((button) => /Editar malla|Comprobando/.test(button.textContent ?? ""))!
const mountPage = async () => {
  const view = renderWithProviders(<CoordinationAcademicStructurePage mode="curriculum" />)
  await flush()
  return view
}

describe("CoordinationAcademicStructurePage, edición de malla", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user-1", name: "Coordinador", email: "coordinador@test.local", email_verified: true, can_edit_identity: false },
      active_role: { id: "role-1", code: "coordinador", career_id: "career-1", career_name: "Software" },
      available_roles: [],
    } as never)
    vi.mocked(getCurriculum).mockResolvedValue(curriculum())
    vi.mocked(getScheduledSubjects).mockResolvedValue({} as never)
    vi.mocked(getTeacherAssignments).mockResolvedValue({} as never)
  })

  it("abre en lectura y entra a editar solo después de consultar nuevamente la malla", async () => {
    const view = await mountPage()
    expect(canvasEditing()).toBe("false")
    expect(document.body.textContent).not.toContain("Configurar ciclos")

    fireEvent.click(editButton())
    await flush()
    expect(getCurriculum).toHaveBeenCalledTimes(2)
    expect(canvasEditing()).toBe("true")
    expect(curriculumEditorState.open.value).toBe(true)
    expect(document.querySelector('[aria-label="Herramientas del editor de malla"]')).toBeNull()
    const pageHeader = document.querySelector('[data-tour="page-header"]')!
    expect(pageHeader.textContent).toContain("Volver a la vista")
    expect(pageHeader.querySelector('button[aria-label="Configurar ciclos"]')).not.toBeNull()

    fireEvent.click([...pageHeader.querySelectorAll("button")].find((button) => button.textContent?.includes("Volver a la vista"))!)
    await flush()
    expect(canvasEditing()).toBe("false")
    expect(curriculumEditorState.open.value).toBe(false)
    view.unmount()
  })

  it("impide editar cuando la convocatoria bloquea la malla", async () => {
    vi.mocked(getCurriculum).mockResolvedValue(curriculum(false))
    await mountPage()
    expect(editButton()).toBeDisabled()
    expect(canvasEditing()).toBe("false")
    expect(document.body.textContent).toContain("Pause la convocatoria para editar")
  })

  it("consulta el bloqueo actual antes de entrar al editor", async () => {
    vi.mocked(getCurriculum).mockResolvedValueOnce(curriculum()).mockResolvedValueOnce(curriculum(false))
    await mountPage()
    fireEvent.click(editButton())
    await flush()
    expect(canvasEditing()).toBe("false")
    expect(editButton()).toBeDisabled()
    expect(document.body.textContent).toContain("Pause la convocatoria para editar")
  })

  it("sale del editor si una recarga informa que la convocatoria se abrió", async () => {
    vi.mocked(getCurriculum).mockResolvedValueOnce(curriculum()).mockResolvedValueOnce(curriculum()).mockResolvedValueOnce(curriculum(false))
    await mountPage()
    fireEvent.click(editButton())
    await flush()
    expect(canvasEditing()).toBe("true")

    fireEvent.click([...document.querySelectorAll("button")].find((button) => button.textContent === "cambiar malla")!)
    await flush()
    expect(canvasEditing()).toBe("false")
    expect(editButton()).toBeDisabled()
  })
})
