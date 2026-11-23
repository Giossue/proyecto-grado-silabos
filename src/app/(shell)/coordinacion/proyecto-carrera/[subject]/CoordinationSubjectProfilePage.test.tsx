import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getScheduledSubjects, getSubjectProfile, getSubjectProfilePreview, saveSubjectProfile, type ScheduledSubjects, type SubjectProfile } from "@/api/career-academics"
import type { DocumentNode } from "@/lib/templateDocument"
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

describe("Página del proyecto de carrera de una materia", () => {
  beforeEach(() => {
    navigation.reset("/coordinacion/proyecto-carrera/m2")
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled())
    vi.mocked(getSubjectProfile).mockResolvedValue(profile())
    vi.mocked(saveSubjectProfile).mockReset()
  })

  it("pasa a la materia anterior o siguiente de la carrera, en orden de ciclo, sin las que no generan sílabo", async () => {
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

    fireEvent.click(document.querySelector('[aria-label="Materia anterior"]')!)
    await flush()
    expect(navigation.push).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera/m1")
    fireEvent.click(document.querySelector('[aria-label="Materia siguiente"]')!)
    await flush()
    expect(navigation.push).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera/m3")
    expect(navigation.push).toHaveBeenCalledTimes(2)
  })

  it("muestra las secciones a la izquierda, el editor con el botón de espacios a la derecha y guarda lo escrito", async () => {
    vi.mocked(saveSubjectProfile).mockResolvedValue(profile({ values: { f1: written, f2: written } }))
    await mountPage()

    expect(getSubjectProfile).toHaveBeenCalledWith("m2")
    expect(document.body.textContent).toContain("Proyecto de carrera de Matemática Discreta")
    expect([...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(["Descripción", "Metodología"])
    expect(document.querySelector('[data-id="ficha-f1"]')).toHaveAttribute("data-spaces", "true")
    expect(button("Guardar proyecto de carrera")).toBeDisabled()

    fireEvent.mouseDown(document.querySelectorAll('[role="tab"]')[1]!, { button: 0 })
    await flush()
    fireEvent.click(document.querySelector('[data-id="ficha-f2"]')!)
    await flush()
    expect(button("Guardar proyecto de carrera")).toBeEnabled()
    fireEvent.click(button("Guardar proyecto de carrera"))
    await flush()

    expect(saveSubjectProfile).toHaveBeenCalledWith("m2", { f1: written, f2: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Nuevo" }] }] } })
    expect(button("Guardar proyecto de carrera")).toBeDisabled()
  })

  it("con la convocatoria abierta muestra el bloqueo y no deja editar ni guardar", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled("Convocatoria abierta"))
    await mountPage()

    expect(document.querySelector('[data-testid="process-lock"]')).not.toBeNull()
    expect(document.querySelector("fieldset")).toBeDisabled()
    expect(button("Guardar proyecto de carrera")).toBeDisabled()
  })

  it("marca el campo con un espacio de elegir sin opciones y abre la vista previa con el ojo", async () => {
    const choice: DocumentNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "response", attrs: { kind: "una", options: [], value: null } }] }] }
    vi.mocked(getSubjectProfile).mockResolvedValue(profile({ values: { f1: choice }, complete: false }))
    vi.mocked(getSubjectProfilePreview).mockResolvedValue({ presentation: {}, sections: [] } as never)
    await mountPage()

    expect(document.body.textContent).toContain("Faltan opciones")
    fireEvent.click(document.querySelector('button[aria-label="Vista previa"]')!)
    await flush()
    expect(getSubjectProfilePreview).toHaveBeenCalledWith("m2")
    expect(document.querySelector("[data-preview]")).not.toBeNull()
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

    fireEvent.click(document.querySelector('[aria-label="Materia siguiente"]')!)
    await flush()
    expect(navigation.push).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Hay cambios sin guardar")

    fireEvent.click(button("Salir y descartar cambios"))
    await flush()
    expect(navigation.push).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera/m3")
  })
})
