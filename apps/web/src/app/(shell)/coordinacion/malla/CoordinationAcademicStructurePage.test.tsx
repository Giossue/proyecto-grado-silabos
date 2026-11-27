import { fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getCurriculum, getMallas, getScheduledSubjects, getTeacherAssignments, updateSubjectLayout, type Curriculum } from "@/api/career-academics"
import { getSession } from "@/api/session"
import { academicCareerScope } from "@/api/careerScope"
import { navigation } from "@/test/nextNavigation"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { flush, renderWithProviders } from "@/test/render"
import { AdminCareerStructurePending, CoordinationAcademicStructurePage } from "./CoordinationAcademicStructurePage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))

const openMallaDialog = (): Element | null => document.querySelector('[data-testid="malla-dialog"][data-open="true"]')
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/career-academics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/career-academics")>()),
  getCurriculum: vi.fn(),
  getMallas: vi.fn(),
  getScheduledSubjects: vi.fn(),
  getTeacherAssignments: vi.fn(),
  updateSubjectLayout: vi.fn(),
}))
vi.mock("@/components/domain/academic/curriculum/CurriculumCanvas", () => ({
  CurriculumCanvas: ({ editing, onChanged, header, onBoardInset, draft }: { editing: boolean; onChanged: (message: string) => void; header?: ReactNode; onBoardInset?: (inset: { left: number; right: number }) => void; draft: { move: (subjectId: string, index: number) => void } }) => (
    <div data-testid="canvas" data-editing={String(editing)}>
      {header}
      <button type="button" onClick={() => draft.move("a", 1)}>
        mover materia
      </button>
      <button type="button" data-measure onClick={() => onBoardInset?.({ left: 230, right: 180 })} />
      <button type="button" onClick={() => onChanged("Malla actualizada.")}>
        cambiar malla
      </button>
    </div>
  ),
}))
vi.mock("@/components/domain/ProcessLockAlert", () => ({ ProcessLockAlert: () => <div>Pause el periodo académico para editar</div> }))
vi.mock("@/components/ui/select", async () => (await import("@/components/domain/academic/curriculum/curriculumTestUtils")).selectStub)
vi.mock("@/components/domain/ImportSpreadsheetDialog", () => ({
  ImportSpreadsheetDialog: ({ extra, title }: { extra?: Record<string, string>; title: string }) => <div data-testid="import" data-malla={extra?.malla_id ?? ""} data-title={title} />,
}))
vi.mock("@/components/domain/academic/curriculum/MallaDialog", () => ({
  MallaDialog: ({ open, onOpenChange, malla, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; malla: { id: string; code: string } | null; onSaved: (message: string, mallaId: string) => void }) => (
    <div data-testid="malla-dialog" data-open={String(open)}>
      <span data-label>{malla === null ? "nueva" : malla.code}</span>
      <button type="button" data-close onClick={() => onOpenChange(false)} />
      <button
        type="button"
        data-save
        onClick={() => {
          onSaved("Malla guardada.", malla === null ? "malla-10" : malla.id)
          onOpenChange(false)
        }}
      />
    </div>
  ),
}))

const MALLAS = [
  { id: "malla-9", code: "SW-9", cycle_count: 3, state: "vigente" as const, subject_count: 6 },
  { id: "malla-8", code: "SW-8", cycle_count: 4, state: "cerrada" as const, subject_count: 7 },
]

const curriculum = (editable = true, malla = MALLAS[0]): Curriculum =>
  ({
    career: { id: "career-1", name: "Software", modality: null },
    malla: { id: malla.id, code: malla.code, state: malla.state },
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
const titleColumn = (): HTMLElement => document.querySelector<HTMLElement>('[data-tour="page-header"]')!.firstElementChild as HTMLElement
const titleInset = (): string => titleColumn().style.getPropertyValue("--page-title-inset")
const actionsColumn = (): HTMLElement => document.querySelector<HTMLElement>('[data-tour="page-actions"]')!
const actionsInset = (): string => actionsColumn().style.getPropertyValue("--page-actions-inset")
const measureBoard = async (): Promise<void> => {
  fireEvent.click(document.querySelector("[data-measure]")!)
  await flush()
}
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
    expect(pageHeader.querySelector('button[aria-label="Configurar ciclos"]')).toBeNull()
    expect(pageHeader.querySelector('[data-tour="curriculum-data"]')!.textContent).toBe("Editar malla")

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

describe("CoordinationAcademicStructurePage, guardar la malla", () => {
  const withSubjects = (editable = true): Curriculum => ({
    ...curriculum(editable),
    subjects: [
      { id: "a", name: "Cálculo", cycle: 1, position: 0 },
      { id: "b", name: "Física", cycle: 1, position: 1 },
    ] as Curriculum["subjects"],
  })
  const button = (text: string): HTMLButtonElement | undefined => [...document.querySelectorAll("button")].find((item) => item.textContent === text)
  const press = async (text: string): Promise<void> => {
    fireEvent.click(button(text)!)
    await flush()
  }
  const startEditing = async (): Promise<void> => {
    await mountPage()
    fireEvent.click(editButton())
    await flush()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador", career_id: "career-1" } } as never)
    vi.mocked(getMallas).mockResolvedValue(MALLAS)
    vi.mocked(getCurriculum).mockResolvedValue(withSubjects())
    vi.mocked(getScheduledSubjects).mockResolvedValue({} as never)
    vi.mocked(getTeacherAssignments).mockResolvedValue({} as never)
    vi.mocked(updateSubjectLayout).mockResolvedValue({ message: "Posición actualizada." })
  })

  it("muestra «Guardar cambios» solo al editar y lo activa cuando hay algo por guardar", async () => {
    await mountPage()
    expect(button("Guardar cambios")).toBeUndefined()

    fireEvent.click(editButton())
    await flush()
    expect(button("Guardar cambios")).toBeDisabled()
    expect(button("Descartar")).toBeUndefined()

    await press("mover materia")
    expect(updateSubjectLayout).not.toHaveBeenCalled()
    expect(button("Guardar cambios")).toBeEnabled()

    await press("Guardar cambios")
    // Swapping two subjects takes one move of either of them: «b» to the first place leaves «a» second.
    expect(vi.mocked(updateSubjectLayout).mock.calls).toEqual([["malla-9", { subject_id: "b", cycle: 1, position: 0 }]])
    expect(button("Guardar cambios")).toBeDisabled()
    expect(canvasEditing()).toBe("true")
  })

  it("«Descartar» quita lo pendiente sin guardar", async () => {
    await startEditing()
    await press("mover materia")

    await press("Descartar")
    expect(button("Guardar cambios")).toBeDisabled()
    expect(updateSubjectLayout).not.toHaveBeenCalled()
  })

  it("antes de salir del editor con cambios pendientes pregunta, y permite seguir o descartar", async () => {
    await startEditing()
    await press("mover materia")

    await press("Volver a la vista")
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Hay cambios sin guardar")
    await press("Seguir editando")
    expect(canvasEditing()).toBe("true")
    expect(button("Guardar cambios")).toBeEnabled()

    await press("Volver a la vista")
    await press("Salir y descartar cambios")
    expect(canvasEditing()).toBe("false")
    fireEvent.click(editButton())
    await flush()
    expect(button("Guardar cambios")).toBeDisabled()
    expect(updateSubjectLayout).not.toHaveBeenCalled()
  })

  it("avisa antes de cerrar o recargar la página solo si hay cambios pendientes", async () => {
    await startEditing()
    const unload = (): boolean => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))
    expect(unload()).toBe(false)

    await press("mover materia")
    expect(unload()).toBe(true)
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
    expect(document.querySelector('[data-tour="malla-selector"]')!.textContent).toContain("Cerrada")
    expect(document.querySelector('[data-testid="import"]')!.getAttribute("data-malla")).toBe("malla-8")
  })

  it("«Nueva malla» en el selector abre el diálogo para crearla sin cambiar la malla elegida", async () => {
    await mountPage()
    const selector = document.querySelector('[data-tour="malla-selector"]')!
    fireEvent.click([...selector.querySelectorAll("[data-value]")].find((option) => option.textContent === "Nueva malla")!)
    await flush()
    expect(openMallaDialog()!.querySelector("[data-label]")!.textContent).toBe("nueva")
    expect(selector.querySelector("[data-select]")!.getAttribute("data-selected")).toBe("malla-9")
    expect(getCurriculum).toHaveBeenCalledTimes(1)
  })

  it("en la vista, «Nueva malla» no va arriba, el selector va sobre la malla y el botón de sus datos no aparece", async () => {
    await mountPage()
    const pageHeader = document.querySelector('[data-tour="page-header"]')!
    expect([...pageHeader.querySelectorAll("button")].some((button) => button.textContent?.includes("Nueva malla"))).toBe(false)
    expect(document.querySelector('[data-testid="canvas"] [data-tour="malla-selector"]')).not.toBeNull()
    expect(document.querySelector('[data-tour="malla-selector"] button')).toBeNull()
    expect(document.querySelector('[data-tour="curriculum-data"]')).toBeNull()
  })

  it("al editar la malla, «Editar malla» aparece arriba y abre los datos de la malla elegida", async () => {
    await mountPage()
    fireEvent.click(document.querySelector('[data-tour="malla-selector"] [data-value="malla-8"]')!)
    await flush()
    fireEvent.click(editButton())
    await flush()
    expect([...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Nueva malla"))).toBe(false)
    const pageHeader = document.querySelector('[data-tour="page-header"]')!
    fireEvent.click([...pageHeader.querySelectorAll("button")].find((button) => button.textContent === "Editar malla")!)
    await flush()
    expect(openMallaDialog()!.querySelector("[data-label]")!.textContent).toBe("SW-8")
  })

  it("al cerrar los datos de la malla el diálogo sigue mostrando esa malla y no pasa a «Nueva malla»", async () => {
    await mountPage()
    fireEvent.click(editButton())
    await flush()
    fireEvent.click(document.querySelector('[data-tour="curriculum-data"]')!)
    await flush()
    const dialog = openMallaDialog()!
    expect(dialog.querySelector("[data-label]")!.textContent).toBe("SW-9")

    fireEvent.click(dialog.querySelector("[data-close]")!)
    await flush()
    expect(openMallaDialog()).toBeNull()
    expect(dialog.isConnected).toBe(true)
    expect(dialog.querySelector("[data-label]")!.textContent).toBe("SW-9")
  })

  it("muestra cada malla como «Malla <código>» en el selector, el título del editor y la importación", async () => {
    await mountPage()
    const selector = document.querySelector('[data-tour="malla-selector"]')!
    const options = [...selector.querySelectorAll("[data-value]")].map((option) => option.textContent)
    expect(options).toEqual(["Malla SW-9 · Vigente · 3 ciclos", "Malla SW-8 · Cerrada · 4 ciclos", "Nueva malla"])
    // The state and the cycles live only inside the selector: no badge or text beside it.
    expect(selector.textContent).toBe(options.join(""))
    expect(document.querySelector('[data-testid="import"]')!.getAttribute("data-title")).toBe("Importar materias a Malla SW-9")

    fireEvent.click(selector.querySelector('[data-value="malla-8"]')!)
    await flush()
    expect(document.querySelector('[data-testid="import"]')!.getAttribute("data-title")).toBe("Importar materias a Malla SW-8")
    fireEvent.click(editButton())
    await flush()
    expect(document.querySelector('[data-tour="page-header"]')!.textContent).toContain("Malla SW-8 de Software")
  })

  it("mientras carga anticipa los dos botones de la cabecera", async () => {
    vi.mocked(getCurriculum).mockImplementation(() => new Promise(() => undefined))
    await mountPage()
    expect(document.querySelector('[data-skeleton="page-actions"]')!.children).toHaveLength(2)
  })

  it("oculta la cabecera hasta saber dónde está la malla, para que no aparezca fuera de su sitio", async () => {
    await mountPage()
    const header = (): Element => document.querySelector('[data-tour="page-header"]')!
    expect(header().classList).toContain("lg:invisible")

    await measureBoard()
    expect(header().classList).not.toContain("lg:invisible")
  })

  it.each([
    ["la carrera no tiene mallas", () => vi.mocked(getMallas).mockResolvedValue([])],
    ["la carga falla", () => vi.mocked(getCurriculum).mockRejectedValue(new Error("sin conexión"))],
  ])("si %s, la cabecera se ve sin esperar a la malla", async (_case, arrange) => {
    arrange()
    await mountPage()
    expect(document.querySelector('[data-tour="page-header"]')!.classList).not.toContain("lg:invisible")
  })

  it("alinea los botones con el borde derecho de la malla", async () => {
    await mountPage()
    expect(actionsInset()).toBe("")
    expect(actionsColumn().classList).not.toContain("lg:pr-(--page-actions-inset)")

    await measureBoard()
    expect(actionsInset()).toBe("180px")
    expect(actionsColumn().classList).toContain("lg:pr-(--page-actions-inset)")
  })

  it("alinea el título con el borde de la malla y lo mantiene al cambiar de malla", async () => {
    await mountPage()
    expect(titleInset()).toBe("")
    expect(titleColumn().classList).not.toContain("lg:pl-(--page-title-inset)")

    await measureBoard()
    expect(titleInset()).toBe("230px")
    expect(titleColumn().classList).toContain("lg:pl-(--page-title-inset)")

    vi.mocked(getCurriculum).mockImplementation(() => new Promise(() => undefined))
    fireEvent.click(document.querySelector('[data-tour="malla-selector"] [data-value="malla-8"]')!)
    await flush()
    expect(titleInset()).toBe("230px")
  })

  it("la descripción nombra la carrera", async () => {
    await mountPage()
    expect(document.querySelector('[data-tour="page-header"]')!.textContent).toContain("Malla curricular de Software")
  })

  it.each([
    ["sin mallas usa el mismo ancho centrado que las demás pestañas", [], true],
    ["con una malla dibujada usa todo el ancho", null, false],
  ])("%s", async (_case, mallas, centered) => {
    if (mallas) vi.mocked(getMallas).mockResolvedValue(mallas)
    await mountPage()
    expect(document.querySelector('[data-tour="page-header"]')!.closest(".overflow-x-clip")!.classList.contains("max-w-6xl")).toBe(centered)
  })

  const centeredFrame = (): boolean => document.querySelector('[data-tour="page-header"]')!.closest(".overflow-x-clip")!.classList.contains("max-w-6xl")

  it.each([
    ["las mallas", () => vi.mocked(getMallas).mockImplementation(() => new Promise(() => undefined))],
    ["la malla", () => vi.mocked(getCurriculum).mockImplementation(() => new Promise(() => undefined))],
  ])("mientras llegan %s la carga usa el ancho centrado, no todo el ancho", async (_case, arrange) => {
    arrange()
    await mountPage()
    expect(centeredFrame()).toBe(true)
    expect(document.querySelector('[data-tour="page-header"]')!.classList).not.toContain("lg:invisible")
  })

  it("al cambiar de malla no salta al ancho centrado mientras llega la nueva", async () => {
    await mountPage()
    await measureBoard()
    vi.mocked(getCurriculum).mockImplementation(() => new Promise(() => undefined))
    fireEvent.click(document.querySelector('[data-tour="malla-selector"] [data-value="malla-8"]')!)
    await flush()
    expect(centeredFrame()).toBe(false)
  })

  it("la pantalla de Administración que busca la carrera también carga centrada", () => {
    renderWithProviders(<AdminCareerStructurePending mode="curriculum" careerCode="sw" error={null} onRetry={() => undefined} />)
    expect(centeredFrame()).toBe(true)
  })

  it("la descripción nombra la carrera aunque todavía no tenga mallas", async () => {
    vi.mocked(getMallas).mockResolvedValue([])
    vi.mocked(getScheduledSubjects).mockResolvedValue({ career: { id: "career-1", name: "Software" } } as never)
    await mountPage()
    expect(document.querySelector('[data-tour="page-header"]')!.textContent).toContain("Malla curricular de Software")
  })

  it("el selector de malla no lleva etiqueta visible y conserva su nombre accesible", async () => {
    await mountPage()
    const selector = document.querySelector('[data-tour="malla-selector"]')!
    expect(selector).toHaveClass("max-w-72")
    expect(selector).not.toHaveClass("max-sm:max-w-none")
    expect(selector.querySelector("label")).toBeNull()
    expect(selector.querySelector('[aria-label="Malla"]')).not.toBeNull()
  })
})

describe("CoordinationAcademicStructurePage, cambiar de malla dentro del editor", () => {
  const editorMallas = [
    { id: "malla-9", code: "SW-9", cycle_count: 3, state: "vigente" as const, subject_count: 2 },
    { id: "malla-8", code: "SW-8", cycle_count: 4, state: "vigente" as const, subject_count: 2 },
  ]
  const draftable = (id: string): Curriculum => ({
    ...curriculum(true, [...editorMallas, { id: "malla-10", code: "SW-10", cycle_count: 2, state: "vigente" as const, subject_count: 0 }].find((malla) => malla.id === id)!),
    subjects: [
      { id: "a", name: "Cálculo", cycle: 1, position: 0 },
      { id: "b", name: "Física", cycle: 1, position: 1 },
    ] as Curriculum["subjects"],
  })
  const button = (text: string): HTMLButtonElement | undefined => [...document.querySelectorAll("button")].find((item) => item.textContent === text)
  const press = async (text: string): Promise<void> => {
    fireEvent.click(button(text)!)
    await flush()
  }
  const selector = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-tour="malla-selector"]')
  const shownMallaId = (): string | null => selector()!.querySelector("[data-select]")!.getAttribute("data-selected")
  const pick = async (value: string): Promise<void> => {
    fireEvent.click(selector()!.querySelector(`[data-value="${value}"]`)!)
    await flush()
  }
  const pageTitle = (): string => document.querySelector('[data-tour="page-header"] h1')!.textContent!
  const requestedMallas = (): string[] => vi.mocked(getCurriculum).mock.calls.map(([id]) => id)
  const asking = (): boolean => [...document.querySelectorAll('[role="dialog"]')].some((dialog) => dialog.textContent?.includes("Hay cambios sin guardar"))
  const unloadBlocked = (): boolean => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))
  const startEditing = async () => {
    const view = await mountPage()
    fireEvent.click(editButton())
    await flush()
    return view
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador", career_id: "career-1" } } as never)
    vi.mocked(getMallas).mockResolvedValue(editorMallas)
    vi.mocked(getCurriculum).mockImplementation(async (id) => draftable(id))
    vi.mocked(getScheduledSubjects).mockResolvedValue({} as never)
    vi.mocked(getTeacherAssignments).mockResolvedValue({} as never)
    vi.mocked(updateSubjectLayout).mockResolvedValue({ message: "Posición actualizada." })
  })

  it("el editor muestra sobre la malla el mismo desplegable que la vista, con las mismas opciones", async () => {
    await mountPage()
    const inView = [...selector()!.querySelectorAll("[data-value]")].map((option) => option.textContent)

    fireEvent.click(editButton())
    await flush()
    expect(canvasEditing()).toBe("true")
    expect(document.querySelector('[data-testid="canvas"] [data-tour="malla-selector"]')).not.toBeNull()
    expect([...selector()!.querySelectorAll("[data-value]")].map((option) => option.textContent)).toEqual(inView)
    expect(inView).toEqual(["Malla SW-9 · Vigente · 3 ciclos", "Malla SW-8 · Vigente · 4 ciclos", "Nueva malla"])
  })

  it("sin cambios pendientes cambia de malla sin preguntar y sigue en el editor", async () => {
    await startEditing()

    await pick("malla-8")
    expect(asking()).toBe(false)
    expect(shownMallaId()).toBe("malla-8")
    expect(canvasEditing()).toBe("true")
    expect(pageTitle()).toBe("Malla SW-8 de Software")
    expect(requestedMallas().at(-1)).toBe("malla-8")
    expect(updateSubjectLayout).not.toHaveBeenCalled()
  })

  it("con cambios pendientes pregunta antes de cambiar; «Seguir editando» conserva la malla y lo pendiente", async () => {
    await startEditing()
    await press("mover materia")

    await pick("malla-8")
    expect(asking()).toBe(true)
    expect(shownMallaId()).toBe("malla-9")
    await press("Seguir editando")

    expect(asking()).toBe(false)
    expect(shownMallaId()).toBe("malla-9")
    expect(pageTitle()).toBe("Malla SW-9 de Software")
    expect(canvasEditing()).toBe("true")
    expect(button("Guardar cambios")).toBeEnabled()
    expect(unloadBlocked()).toBe(true)
    expect(requestedMallas()).not.toContain("malla-8")
    expect(updateSubjectLayout).not.toHaveBeenCalled()

    await press("Guardar cambios")
    expect(vi.mocked(updateSubjectLayout).mock.calls).toEqual([["malla-9", { subject_id: "b", cycle: 1, position: 0 }]])
  })

  it("al descartar pasa a la otra malla sin guardar, mover ni copiar nada entre ellas", async () => {
    await startEditing()
    await press("mover materia")

    await pick("malla-8")
    await press("Salir y descartar cambios")

    expect(shownMallaId()).toBe("malla-8")
    expect(canvasEditing()).toBe("true")
    expect(button("Guardar cambios")).toBeDisabled()
    expect(button("Descartar")).toBeUndefined()
    expect(unloadBlocked()).toBe(false)
    expect(updateSubjectLayout).not.toHaveBeenCalled()

    await pick("malla-9")
    expect(asking()).toBe(false)
    expect(shownMallaId()).toBe("malla-9")
    expect(button("Guardar cambios")).toBeDisabled()
    expect(updateSubjectLayout).not.toHaveBeenCalled()
  })

  it("después de cambiar de malla, guardar envía solo lo de la malla que se ve", async () => {
    await startEditing()
    await press("mover materia")
    await pick("malla-8")
    await press("Salir y descartar cambios")

    await press("mover materia")
    await press("Guardar cambios")
    expect(vi.mocked(updateSubjectLayout).mock.calls).toEqual([["malla-8", { subject_id: "b", cycle: 1, position: 0 }]])
  })

  it("elegir la misma malla no pregunta ni pierde lo pendiente", async () => {
    await startEditing()
    await press("mover materia")

    await pick("malla-9")
    expect(asking()).toBe(false)
    expect(button("Guardar cambios")).toBeEnabled()
  })

  it("mientras se guarda no se puede cambiar de malla", async () => {
    vi.mocked(updateSubjectLayout).mockImplementation(() => new Promise(() => undefined))
    await startEditing()
    expect(selector()!.querySelector("[data-select]")!.getAttribute("data-disabled")).toBeNull()
    await press("mover materia")
    await press("Guardar cambios")

    expect(selector()!.querySelector("[data-select]")!.getAttribute("data-disabled")).toBe("true")
    await pick("malla-8")
    expect(shownMallaId()).toBe("malla-9")
    expect(requestedMallas()).not.toContain("malla-8")
  })

  it("mientras carga la otra malla muestra el esqueleto con el hueco del desplegable y mantiene «Volver a la vista»", async () => {
    vi.mocked(getCurriculum).mockImplementation((id) => (id === "malla-8" ? new Promise(() => undefined) : Promise.resolve(draftable(id))))
    await startEditing()

    await pick("malla-8")
    expect(document.querySelector('[data-testid="canvas"]')).toBeNull()
    expect(document.querySelector('[data-skeleton="curriculum-selector"]')).not.toBeNull()
    expect(document.querySelector('[data-skeleton="page-actions"]')!.children).toHaveLength(2)
    expect(document.querySelector('[data-tour="page-header"]')!.textContent).toContain("Volver a la vista")
    expect(unloadBlocked()).toBe(false)
  })

  it("si la malla elegida está bloqueada vuelve a la vista", async () => {
    vi.mocked(getCurriculum).mockImplementation(async (id) => (id === "malla-8" ? curriculum(false, editorMallas[1]) : draftable(id)))
    await startEditing()

    await pick("malla-8")
    expect(canvasEditing()).toBe("false")
    expect(shownMallaId()).toBe("malla-8")
  })

  it("el editor se queda en su malla aunque una recarga ponga otra de primera", async () => {
    await startEditing()
    await press("mover materia")
    vi.mocked(getMallas).mockResolvedValue([editorMallas[1], editorMallas[0]])

    await press("cambiar malla")
    expect(shownMallaId()).toBe("malla-9")
    expect(pageTitle()).toBe("Malla SW-9 de Software")
  })

  it("«Nueva malla» desde el editor abre el diálogo sin tocar lo pendiente", async () => {
    await startEditing()
    await press("mover materia")

    await pick("nueva-malla")
    expect(openMallaDialog()!.querySelector("[data-label]")!.textContent).toBe("nueva")
    expect(asking()).toBe(false)
    fireEvent.click(openMallaDialog()!.querySelector("[data-close]")!)
    await flush()

    expect(shownMallaId()).toBe("malla-9")
    expect(button("Guardar cambios")).toBeEnabled()
    expect(updateSubjectLayout).not.toHaveBeenCalled()
  })

  it.each([
    ["Seguir editando", "malla-9", true],
    ["Salir y descartar cambios", "malla-10", false],
  ])("al crear una malla desde el editor con cambios pendientes pregunta antes de pasar a ella: «%s»", async (answer, expected, keeps) => {
    await startEditing()
    await press("mover materia")
    await pick("nueva-malla")
    vi.mocked(getMallas).mockResolvedValue([{ id: "malla-10", code: "SW-10", cycle_count: 2, state: "vigente" as const, subject_count: 0 }, ...editorMallas])

    fireEvent.click(openMallaDialog()!.querySelector("[data-save]")!)
    await flush()
    expect(asking()).toBe(true)
    expect(shownMallaId()).toBe("malla-9")
    await press(answer)

    expect(shownMallaId()).toBe(expected)
    expect(selector()!.textContent).toContain("Malla SW-10")
    expect(button("Guardar cambios")!.disabled).toBe(!keeps)
    expect(updateSubjectLayout).not.toHaveBeenCalled()
  })

  it("al crear una malla desde la vista pasa a ella sin preguntar", async () => {
    await mountPage()
    await pick("nueva-malla")
    vi.mocked(getMallas).mockResolvedValue([...editorMallas, { id: "malla-10", code: "SW-10", cycle_count: 2, state: "vigente" as const, subject_count: 0 }])

    fireEvent.click(openMallaDialog()!.querySelector("[data-save]")!)
    await flush()
    expect(asking()).toBe(false)
    expect(shownMallaId()).toBe("malla-10")
    expect(canvasEditing()).toBe("false")
  })

  it("al guardar los datos de la malla que se edita sigue en ella con lo pendiente", async () => {
    await startEditing()
    await press("mover materia")
    fireEvent.click(document.querySelector('[data-tour="curriculum-data"]')!)
    await flush()

    fireEvent.click(openMallaDialog()!.querySelector("[data-save]")!)
    await flush()
    expect(asking()).toBe(false)
    expect(shownMallaId()).toBe("malla-9")
    expect(button("Guardar cambios")).toBeEnabled()
    expect(requestedMallas().filter((id) => id === "malla-9")).toHaveLength(3)
  })

  it("con una sola malla el editor muestra el desplegable con esa malla", async () => {
    vi.mocked(getMallas).mockResolvedValue([editorMallas[0]])
    await startEditing()

    expect([...selector()!.querySelectorAll("[data-value]")].map((option) => option.textContent)).toEqual(["Malla SW-9 · Vigente · 3 ciclos", "Nueva malla"])
  })

  it("en Administración el editor también deja cambiar de malla y pregunta antes de descartar", async () => {
    renderWithProviders(<CoordinationAcademicStructurePage mode="curriculum" adminCareer={{ id: "career-9", code: "RED" }} />)
    await flush()
    fireEvent.click(editButton())
    await flush()
    await press("mover materia")

    await pick("malla-8")
    expect(asking()).toBe(true)
    await press("Salir y descartar cambios")
    expect(shownMallaId()).toBe("malla-8")
    expect(requestedMallas().at(-1)).toBe("malla-8")
    expect(vi.mocked(getCurriculum).mock.calls.at(-1)).toEqual(["malla-8", "career-9"])
    expect(updateSubjectLayout).not.toHaveBeenCalled()
  })
})

describe("CoordinationAcademicStructurePage, materias y asignaciones por malla", () => {
  const openMallasList = [MALLAS[0]!, { ...MALLAS[1]!, state: "vigente" as const }]
  const scheduledRow = (id: string, name: string, mallaCode: string) => ({
    subject_id: id,
    label: name,
    subject_code: id,
    subject_name: name,
    subject_cycle: 1,
    malla_name: `Malla ${mallaCode}`,
    generates_syllabus: true,
    modality_name: null,
    parallels: [],
    editable: true,
  })
  const rows = (): string[] => [...document.querySelectorAll('[data-slot="table-body"] tr')].map((item) => item.querySelectorAll("td")[1]!.textContent!)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador", career_id: "career-1" } } as never)
    vi.mocked(getMallas).mockResolvedValue(openMallasList)
    vi.mocked(getCurriculum).mockResolvedValue(curriculum())
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      career: { id: "career-1", name: "Software", lock_reason: null },
      scheduledSubjects: [scheduledRow("s-1", "Redes", "SW-9"), scheduledRow("s-2", "Compiladores", "SW-8")],
      options: { shiftOptions: [], activeSubjects: [] },
    } as never)
    vi.mocked(getTeacherAssignments).mockResolvedValue({ teacherAssignments: [], options: { teacherUsers: [] } } as never)
  })

  it.each([
    ["Coordinación", null],
    ["Administración", { id: "career-9", code: "RED" }],
  ])("en %s cambia de malla en la misma pantalla, sin volver a pedir datos ni ofrecer «Nueva malla»", async (_role, adminCareer) => {
    renderWithProviders(<CoordinationAcademicStructurePage mode="schedule" adminCareer={adminCareer} />)
    await flush()
    const selector = (): HTMLElement => document.querySelector<HTMLElement>('[data-tour="malla-selector"]')!
    expect(rows()).toEqual(["Redes"])
    expect([...selector().querySelectorAll("[data-value]")].map((option) => option.getAttribute("data-value"))).toEqual(["malla-9", "malla-8"])
    const requests = [getCurriculum, getScheduledSubjects, getMallas, getTeacherAssignments].map((request) => vi.mocked(request).mock.calls.length)

    fireEvent.click(selector().querySelector('[data-value="malla-8"]')!)
    await flush()

    expect(rows()).toEqual(["Compiladores"])
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    expect([getCurriculum, getScheduledSubjects, getMallas, getTeacherAssignments].map((request) => vi.mocked(request).mock.calls.length)).toEqual(requests)
    expect(updateSubjectLayout).not.toHaveBeenCalled()
  })
})

describe("CoordinationAcademicStructurePage para una carrera elegida por Administración", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset("/admin/carreras/RED/materias-asignaciones")
    vi.mocked(getMallas).mockResolvedValue([{ ...MALLAS[0], id: "malla-redes" }])
    vi.mocked(getCurriculum).mockResolvedValue({ ...curriculum(), career: { id: "career-9", name: "Redes", modality: null } } as unknown as Curriculum)
    vi.mocked(getScheduledSubjects).mockResolvedValue({ career: { id: "career-9", name: "Redes", lock_reason: null }, scheduledSubjects: [], options: { shiftOptions: [], activeSubjects: [] } } as never)
    vi.mocked(getTeacherAssignments).mockResolvedValue({ career: { id: "career-9", name: "Redes", lock_reason: null }, teacherAssignments: [], careerTeachers: [], pendingTeachers: [], options: { parallels: [], teacherUsers: [] }, canCreateTeacher: true } as never)
  })

  it("lee la carrera indicada sin mirar el rol activo y muestra su nombre, la vuelta y las vistas de la carrera", async () => {
    const view = renderWithProviders(<CoordinationAcademicStructurePage mode="curriculum" adminCareer={{ id: "career-9", code: "RED" }} />)
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
    expect(navigation.push).toHaveBeenLastCalledWith("/admin/carreras/red/materias-asignaciones")
    view.unmount()
    expect(academicCareerScope()).toBeNull()
  })

  it("alinea con la malla la cabecera, los botones y las pestañas", async () => {
    renderWithProviders(<CoordinationAcademicStructurePage mode="curriculum" adminCareer={{ id: "career-9", code: "RED" }} />)
    await flush()
    const tabsRow = (): HTMLElement => document.querySelector<HTMLElement>('[aria-label="Trabajo de la carrera"]')!.closest<HTMLElement>("[data-career-tabs]")!
    expect(tabsRow().getAttribute("style")).toBeNull()
    expect(tabsRow().classList).toContain("lg:invisible")

    await measureBoard()
    expect(tabsRow().classList).not.toContain("lg:invisible")
    expect(titleInset()).toBe("230px")
    expect(actionsInset()).toBe("180px")
    expect(tabsRow().style.getPropertyValue("--page-title-inset")).toBe("230px")
    expect(tabsRow().style.getPropertyValue("--page-actions-inset")).toBe("180px")
    expect(tabsRow().classList).toContain("lg:pl-(--page-title-inset)")
    expect(tabsRow().classList).toContain("lg:pr-(--page-actions-inset)")

    fireEvent.click(editButton())
    await flush()
    expect(titleInset()).toBe("230px")
    expect(actionsInset()).toBe("180px")
  })

  it("las demás vistas de la carrera muestran cabecera y pestañas sin esperar a ninguna malla", async () => {
    renderWithProviders(<CoordinationAcademicStructurePage mode="schedule" adminCareer={{ id: "career-9", code: "RED" }} />)
    await flush()
    expect(document.querySelector('[data-tour="page-header"]')!.classList).not.toContain("lg:invisible")
    expect(document.querySelector("[data-career-tabs]")!.classList).not.toContain("lg:invisible")
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
