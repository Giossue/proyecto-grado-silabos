import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getCurriculum, getMallas, getScheduledSubjects, getTeacherAssignments, type Curriculum } from "@/api/career-academics"
import { getSession } from "@/api/session"
import { academicCareerScope } from "@/api/careerScope"
import { navigation } from "@/test/nextNavigation"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { flush, renderWithProviders } from "@/test/render"
import { CoordinationAcademicStructurePage } from "./CoordinationAcademicStructurePage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/career-academics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/career-academics")>()),
  getCurriculum: vi.fn(),
  getMallas: vi.fn(),
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
vi.mock("@/components/domain/ProcessLockAlert", () => ({ ProcessLockAlert: () => <div>Pause el periodo académico para editar</div> }))
vi.mock("@/components/ui/select", async () => (await import("@/components/domain/academic/curriculum/curriculumTestUtils")).selectStub)
vi.mock("@/components/domain/ImportSpreadsheetDialog", () => ({
  ImportSpreadsheetDialog: ({ extra }: { extra?: Record<string, string> }) => <div data-testid="import" data-malla={extra?.malla_id ?? ""} />,
}))
vi.mock("@/components/domain/academic/curriculum/MallaDialog", () => ({
  MallaDialog: ({ open, malla }: { open: boolean; malla: { name: string } | null }) => (open ? <div data-testid="malla-dialog">{malla === null ? "nueva" : malla.name}</div> : null),
}))

const MALLAS = [
  { id: "malla-9", name: "Malla SW-9", resolution: null, cycle_count: 3, state: "vigente" as const, subject_count: 6 },
  { id: "malla-8", name: "Malla SW-8", resolution: null, cycle_count: 4, state: "en_transicion" as const, subject_count: 7 },
]

const curriculum = (editable = true, malla = MALLAS[0]): Curriculum =>
  ({
    career: { id: "career-1", name: "Software", modality: null },
    malla: { id: malla.id, name: malla.name, state: malla.state },
    curriculum: { id: malla.id, cycle_count: malla.cycle_count, editable, lock_reason: editable ? null : "Periodo académico activo" },
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
    vi.mocked(getMallas).mockResolvedValue(MALLAS)
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

  it("impide editar cuando el periodo académico bloquea la malla", async () => {
    vi.mocked(getCurriculum).mockResolvedValue(curriculum(false))
    await mountPage()
    expect(editButton()).toBeDisabled()
    expect(canvasEditing()).toBe("false")
    expect(document.body.textContent).toContain("Pause el periodo académico para editar")
  })

  it("consulta el bloqueo actual antes de entrar al editor", async () => {
    vi.mocked(getCurriculum).mockResolvedValueOnce(curriculum()).mockResolvedValueOnce(curriculum(false))
    await mountPage()
    fireEvent.click(editButton())
    await flush()
    expect(canvasEditing()).toBe("false")
    expect(editButton()).toBeDisabled()
    expect(document.body.textContent).toContain("Pause el periodo académico para editar")
  })

  it("sale del editor si una recarga informa que el periodo académico se abrió", async () => {
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

describe("CoordinationAcademicStructurePage, varias mallas", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador", career_id: "career-1" } } as never)
    vi.mocked(getMallas).mockResolvedValue(MALLAS)
    vi.mocked(getCurriculum).mockImplementation(async (id) => curriculum(true, MALLAS.find((malla) => malla.id === id)!))
    vi.mocked(getScheduledSubjects).mockResolvedValue({} as never)
    vi.mocked(getTeacherAssignments).mockResolvedValue({} as never)
  })

  it("abre la malla vigente, muestra su estado y cambia de malla consultando la malla elegida", async () => {
    await mountPage()
    expect(getCurriculum).toHaveBeenLastCalledWith("malla-9", null)
    const selector = document.querySelector('[data-tour="malla-selector"]')!
    expect(selector.textContent).toContain("Vigente")
    expect(document.querySelector('[data-testid="import"]')!.getAttribute("data-malla")).toBe("malla-9")

    fireEvent.click(selector.querySelector('[data-value="malla-8"]')!)
    await flush()
    expect(getCurriculum).toHaveBeenLastCalledWith("malla-8", null)
    expect(document.querySelector('[data-tour="malla-selector"]')!.textContent).toContain("En transición")
    expect(document.querySelector('[data-testid="import"]')!.getAttribute("data-malla")).toBe("malla-8")
  })

  it("abre el diálogo para crear una malla", async () => {
    await mountPage()
    fireEvent.click([...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Nueva malla"))!)
    await flush()
    expect(document.querySelector('[data-testid="malla-dialog"]')!.textContent).toBe("nueva")
  })

  it("abre los datos de la malla elegida para editarlos", async () => {
    await mountPage()
    fireEvent.click(document.querySelector('[data-tour="malla-selector"] [data-value="malla-8"]')!)
    await flush()
    fireEvent.click([...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Datos de la malla"))!)
    await flush()
    expect(document.querySelector('[data-testid="malla-dialog"]')!.textContent).toBe("Malla SW-8")
  })
})

describe("CoordinationAcademicStructurePage para una carrera elegida por Administración", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset("/admin/estructura-academica/carreras/career-9/materias-asignaciones")
    vi.mocked(getMallas).mockResolvedValue([{ ...MALLAS[0], id: "malla-redes" }])
    vi.mocked(getCurriculum).mockResolvedValue({ ...curriculum(), career: { id: "career-9", name: "Redes", modality: null } } as unknown as Curriculum)
    vi.mocked(getScheduledSubjects).mockResolvedValue({ career: { id: "career-9", name: "Redes", lock_reason: null }, scheduledSubjects: [], options: { shiftOptions: [], activeSubjects: [] } } as never)
    vi.mocked(getTeacherAssignments).mockResolvedValue({ career: { id: "career-9", name: "Redes", lock_reason: null }, teacherAssignments: [], careerTeachers: [], pendingTeachers: [], options: { parallels: [], teacherUsers: [] }, canCreateTeacher: true } as never)
  })

  it("lee la carrera indicada sin mirar el rol activo y muestra su nombre, la vuelta y las vistas de la carrera", async () => {
    const view = renderWithProviders(<CoordinationAcademicStructurePage mode="curriculum" careerId="career-9" />)
    await flush()

    expect(getSession).not.toHaveBeenCalled()
    expect(getMallas).toHaveBeenCalledWith("career-9")
    expect(getCurriculum).toHaveBeenCalledWith("malla-redes", "career-9")
    expect(getScheduledSubjects).toHaveBeenCalledWith("career-9")
    expect(getTeacherAssignments).toHaveBeenCalledWith("career-9")
    expect(academicCareerScope()).toBe("career-9")
    const header = document.querySelector('[data-tour="page-header"]')!
    expect(header.textContent).toContain("Malla de Redes")
    expect(header.querySelector("a")?.getAttribute("href")).toBe("/admin/estructura-academica?seccion=carrera")
    expect([...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(["Malla", "Materias y paralelos", "Docentes", "Proyecto de carrera"])

    fireEvent.mouseDown([...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Materias y paralelos")!, { button: 0 })
    expect(navigation.push).toHaveBeenLastCalledWith("/admin/estructura-academica/carreras/career-9/materias-asignaciones")
    view.unmount()
    expect(academicCareerScope()).toBeNull()
  })

  it("la vista de Coordinación sigue sin ámbito de carrera ni pestañas de Administración", async () => {
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador", career_id: "career-1" } } as never)
    renderWithProviders(<CoordinationAcademicStructurePage mode="curriculum" />)
    await flush()
    expect(getScheduledSubjects).toHaveBeenCalledWith(null)
    expect(academicCareerScope()).toBeNull()
    expect(document.querySelector('[aria-label="Trabajo de la carrera"]')).toBeNull()
  })
})
