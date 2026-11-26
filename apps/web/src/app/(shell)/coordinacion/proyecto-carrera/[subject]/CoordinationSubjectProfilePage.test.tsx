import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getScheduledSubjects, getSubjectProfile, getSubjectProfilePreview, saveSubjectProfile, type ScheduledSubjects, type SubjectProfile } from "@/api/career-academics"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import CoordinationSubjectProfilePage from "./CoordinationSubjectProfilePage"

const route = vi.hoisted(() => ({ params: { subject: "m2" } as Record<string, string> }))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => route.params }))
vi.mock("@/api/career-academics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/career-academics")>()),
  getScheduledSubjects: vi.fn(),
  getSubjectProfile: vi.fn(),
  getSubjectProfilePreview: vi.fn(),
  saveSubjectProfile: vi.fn(),
}))
vi.mock("@/components/ui/select", async () => (await import("@/components/domain/academic/curriculum/curriculumTestUtils")).selectStub)
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/domain/syllabus/FreeTextEditor", () => ({
  FreeTextEditor: ({ id, label, disabled, spaces, onValueChange }: { id: string; label: string; disabled?: boolean; spaces?: boolean; onValueChange: (value: unknown) => void }) => (
    <button
      type="button"
      data-id={id}
      data-spaces={String(Boolean(spaces))}
      disabled={disabled}
      onClick={() => onValueChange({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Nuevo" }] }] })}
    >
      {label}
    </button>
  ),
}))
vi.mock("@/components/domain/ProcessLockAlert", () => ({ ProcessLockAlert: () => <div data-testid="process-lock" /> }))
vi.mock("@/components/domain/syllabus/SyllabusDocumentPreview", () => ({ SyllabusDocumentPreview: () => <div data-preview /> }))

const blank: DocumentNode = { type: "doc", content: [{ type: "paragraph" }] }
const written: DocumentNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto de la carrera" }] }] }
const scheduled = (lock: string | null = null) =>
  ({
    career: { lock_reason: lock, lock: lock ? { label: "Edición bloqueada", reason: lock } : null },
    options: { activeSubjects: [{ id: "m2", nombre: "Matemática Discreta", ciclo: 1 }] },
  }) as unknown as ScheduledSubjects
const profile = (extra: Partial<SubjectProfile> = {}): SubjectProfile => ({
  fields: [
    { id: "f1", key: "descripcion", label: "Descripción de la asignatura", section: "Descripción", quien_llena: "carrera", content: blank, template: blank, position: 1 },
    { id: "f2", key: "metodologia", label: "Métodos", section: "Metodología", quien_llena: "carrera", content: blank, template: blank, position: 7 },
  ],
  values: { f1: written },
  complete: true,
  ...extra,
})
const mountPage = async () => {
  const view = renderWithProviders(<CoordinationSubjectProfilePage />)
  await flush()
  return view
}
const button = (text: string): HTMLButtonElement => [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === text)!
const subjectOption = (id: string): Element => document.querySelector(`[data-value="${id}"]`)!

describe("Página del proyecto de carrera de una materia", () => {
  beforeEach(() => {
    navigation.reset("/coordinacion/proyecto-carrera/m2")
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled())
    vi.mocked(getSubjectProfile).mockResolvedValue(profile())
    vi.mocked(saveSubjectProfile).mockReset()
  })

  it("cambia de materia solo con el selector, que las ordena por ciclo y deja fuera las que no generan sílabo", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      ...scheduled(),
      options: {
        activeSubjects: [
          { id: "m3", nombre: "Estructuras de Datos", ciclo: 2 },
          { id: "m1", nombre: "Álgebra", ciclo: 1 },
          { id: "m4", nombre: "Prácticas", ciclo: 1, generates_syllabus: false },
          { id: "m2", nombre: "Matemática Discreta", ciclo: 1 },
        ],
      },
    } as unknown as ScheduledSubjects)
    await mountPage()

    expect([...document.querySelectorAll("[data-value]")].map((option) => option.textContent)).toEqual(["Álgebra", "Matemática Discreta", "Estructuras de Datos"])
    expect(document.querySelector('[aria-label="Materia anterior"]')).toBeNull()
    expect(document.querySelector('[aria-label="Materia siguiente"]')).toBeNull()
    fireEvent.click(subjectOption("m3"))
    await flush()
    expect(navigation.push).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera/m3")
    expect(navigation.push).toHaveBeenCalledTimes(1)
  })

  it("pone el selector de materia a la izquierda, sobre las secciones, también en la vista previa", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      ...scheduled(),
      options: { activeSubjects: [{ id: "m2", nombre: "Matemática Discreta", ciclo: 1 }, { id: "m3", nombre: "Estructuras de Datos", ciclo: 2 }] },
    } as unknown as ScheduledSubjects)
    vi.mocked(getSubjectProfilePreview).mockResolvedValue({ presentation: {}, sections: [] } as never)
    await mountPage()
    const selector = (): Element => document.querySelector("[data-select]")!
    const tabList = document.querySelector('[role="tablist"]')!

    expect(document.querySelector('[data-tour="page-header"]')!.contains(selector())).toBe(false)
    expect(selector().compareDocumentPosition(tabList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(button("Vista previa"))
    await flush()
    expect(selector()).not.toBeNull()
    expect(selector().closest(".hidden")).toBeNull()
    expect(tabList.closest(".hidden")).not.toBeNull()
    expect(document.querySelector("fieldset")!.closest(".hidden")).not.toBeNull()
  })

  it("muestra las secciones a la izquierda, el editor con el botón de espacios a la derecha y guarda lo escrito", async () => {
    vi.mocked(saveSubjectProfile).mockResolvedValue(profile({ values: { f1: written, f2: written } }))
    await mountPage()

    expect(getSubjectProfile).toHaveBeenCalledWith("m2")
    expect(document.body.textContent).toContain("Proyecto de carrera de Matemática Discreta")
    expect([...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(["Descripción", "Metodología● (con campos pendientes)"])
    expect(document.querySelector('[data-id="ficha-f1"]')).toHaveAttribute("data-spaces", "true")
    expect(button("Guardar información")).toBeDisabled()
    expect(button("Guardar información").querySelector("svg")).not.toBeNull()

    fireEvent.mouseDown(document.querySelectorAll('[role="tab"]')[1]!, { button: 0 })
    await flush()
    fireEvent.click(document.querySelector('[data-id="ficha-f2"]')!)
    await flush()
    expect(button("Guardar información")).toBeEnabled()
    fireEvent.click(button("Guardar información"))
    await flush()

    expect(saveSubjectProfile).toHaveBeenCalledWith("m2", { f1: written, f2: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Nuevo" }] }] } })
    expect(button("Guardar información")).toBeDisabled()
  })

  it("marca «Sin definir» el campo que nadie ha definido y su sección, y lo quita al escribir", async () => {
    await mountPage()
    const tabs = (): string[] => [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent!)
    expect(tabs()).toEqual(["Descripción", "Metodología● (con campos pendientes)"])
    expect(document.body.textContent).not.toContain("Sin definir")

    fireEvent.mouseDown(document.querySelectorAll('[role="tab"]')[1]!, { button: 0 })
    await flush()
    expect(document.body.textContent).toContain("Sin definir")
    fireEvent.click(document.querySelector('[data-id="ficha-f2"]')!)
    await flush()
    expect(document.body.textContent).not.toContain("Sin definir")
    expect(tabs()).toEqual(["Descripción", "Metodología"])
  })

  it("con el periodo académico abierto muestra el bloqueo y no deja editar ni guardar", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled("Periodo académico abierto"))
    await mountPage()

    expect(document.querySelector('[data-testid="process-lock"]')).not.toBeNull()
    expect(document.querySelector("fieldset")).toBeDisabled()
    expect(button("Guardar información")).toBeDisabled()
  })

  it("marca el campo con un espacio de elegir sin opciones y abre la vista previa con su botón de icono y texto", async () => {
    const choice: DocumentNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "response", attrs: { kind: "una", options: [], value: null } }] }] }
    vi.mocked(getSubjectProfile).mockResolvedValue(profile({ values: { f1: choice }, complete: false }))
    vi.mocked(getSubjectProfilePreview).mockResolvedValue({ presentation: {}, sections: [] } as never)
    await mountPage()

    expect(document.body.textContent).toContain("Faltan opciones")
    expect(button("Vista previa").querySelector("svg")).not.toBeNull()
    fireEvent.click(button("Vista previa"))
    await flush()
    expect(getSubjectProfilePreview).toHaveBeenCalledWith("m2")
    expect(document.querySelector("[data-preview]")).not.toBeNull()

    fireEvent.click(button("Volver a editar"))
    await flush()
    expect(document.querySelector("[data-preview]")).toBeNull()
    expect(button("Vista previa")).not.toBeUndefined()
  })

  it("mientras carga anticipa la pantalla: dos botones, sin descripción, el selector y un editor", async () => {
    vi.mocked(getSubjectProfile).mockImplementation(() => new Promise(() => undefined))
    await mountPage()
    expect(document.querySelector('[data-skeleton="page-actions"]')!.children).toHaveLength(2)
    expect(document.querySelector('[data-skeleton="page-title"]')).not.toBeNull()
    expect(document.querySelector('[data-skeleton="page-description"]')).toBeNull()
    expect(document.querySelector('[data-skeleton="form-subject-select"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-skeleton="form-editor"]')).toHaveLength(1)
  })

  it("el enlace de arriba vuelve a la lista de materias", async () => {
    await mountPage()
    fireEvent.click([...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Volver al proyecto de carrera"))!)
    await flush()
    expect(navigation.push).toHaveBeenCalledWith("/coordinacion/proyecto-carrera")
  })

  it("con cambios sin guardar pregunta antes de pasar a otra materia", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      ...scheduled(),
      options: { activeSubjects: [{ id: "m2", nombre: "Matemática Discreta", ciclo: 1 }, { id: "m3", nombre: "Estructuras de Datos", ciclo: 2 }] },
    } as unknown as ScheduledSubjects)
    await mountPage()
    fireEvent.click(document.querySelector('[data-id="ficha-f1"]')!)
    await flush()

    fireEvent.click(subjectOption("m3"))
    await flush()
    expect(navigation.push).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Hay cambios sin guardar")

    fireEvent.click(button("Salir y descartar cambios"))
    await flush()
    expect(navigation.push).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera/m3")
  })
})
