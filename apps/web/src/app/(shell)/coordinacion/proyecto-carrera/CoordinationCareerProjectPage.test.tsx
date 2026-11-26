import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getScheduledSubjects, type ScheduledSubjects } from "@/api/career-academics"
import { getSession } from "@/api/session"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import CoordinationCareerProjectPage from "./CoordinationCareerProjectPage"

const panel = vi.hoisted(() => ({ uploadOpen: undefined as boolean | undefined }))

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/career-academics", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/career-academics")>()), getScheduledSubjects: vi.fn() }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/components/domain/academic/FichaImportDialog", () => ({ FichaImportDialog: () => null }))
vi.mock("@/components/domain/academic/SupportDocumentsPanel", () => ({
  SupportDocumentsPanel: ({ uploadOpen }: { uploadOpen?: boolean }) => {
    panel.uploadOpen = uploadOpen
    return <div data-testid="support-documents" />
  },
}))
vi.mock("@/components/domain/ProcessLockAlert", () => ({ ProcessLockAlert: () => <div data-testid="process-lock" /> }))

const subject = (id: string, nombre: string, ciclo: number, extra: Record<string, unknown> = {}) => ({ id, nombre, ciclo, generates_syllabus: true, profile_complete: true, ...extra })
const scheduled = (subjects: unknown[]) => ({ career: { lock_reason: null, lock: null }, options: { activeSubjects: subjects } }) as unknown as ScheduledSubjects
const mountPage = async () => {
  const view = renderWithProviders(<CoordinationCareerProjectPage />)
  await flush()
  return view
}
const openCycles = async (): Promise<void> => {
  for (const trigger of [...document.querySelectorAll('[data-slot="collapsible-trigger"]')]) fireEvent.click(trigger)
  await flush()
}

describe("Proyecto de carrera", () => {
  beforeEach(() => {
    navigation.reset("/coordinacion/proyecto-carrera")
    panel.uploadOpen = undefined
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador", career_id: "carrera-1" } } as never)
    vi.mocked(getScheduledSubjects).mockResolvedValue(
      scheduled([
        subject("m1", "Programación Básica", 1, { profile_complete: false, profile_total: 18, profile_filled: 12 }),
        subject("m2", "Matemática Discreta", 1),
        subject("m3", "Estructuras de Datos", 2),
        subject("m4", "Materia sin sílabo", 2, { generates_syllabus: false }),
      ]),
    )
  })

  it("muestra las materias de cada ciclo como tarjetas con el estado de su proyecto de carrera", async () => {
    await mountPage()
    await openCycles()

    const cards = [...document.querySelectorAll('ul[aria-label="Materias del ciclo 1"] [data-slot="card"]')]
    expect(cards.map((card) => card.querySelector('[data-slot="card-title"]')?.textContent)).toEqual(["Programación Básica", "Matemática Discreta"])
    expect(cards[0]!.textContent).toContain("12 de 18 campos")
    expect(cards[1]!.textContent).toContain("Completa")
    expect(document.body.textContent).not.toContain("Materia sin sílabo")
  })

  it("con dos mallas abiertas cada tarjeta muestra la malla de la materia", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue(
      scheduled([subject("m1", "Cálculo", 1, { malla_name: "Malla SW-9" }), subject("m2", "Cálculo", 1, { malla_name: "Malla SW-8" })]),
    )
    await mountPage()
    await openCycles()

    const cards = [...document.querySelectorAll('ul[aria-label="Materias del ciclo 1"] [data-slot="card"]')]
    expect(cards.map((card) => card.textContent)).toEqual(["CálculoMalla SW-9Completa", "CálculoMalla SW-8Completa"])
  })

  it("con una sola malla no repite su nombre en las tarjetas", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled([subject("m1", "Cálculo", 1, { malla_name: "Malla SW-9" }), subject("m2", "Redes", 1, { malla_name: "Malla SW-9" })]))
    await mountPage()
    await openCycles()

    expect(document.body.textContent).not.toContain("Malla SW-9")
  })

  it("cada tarjeta es un enlace con el nombre de la materia hacia la página de su proyecto de carrera", async () => {
    await mountPage()
    await openCycles()

    const link = (name: string) => [...document.querySelectorAll<HTMLAnchorElement>('[data-slot="card-title"] a')].find((anchor) => anchor.textContent === name)
    expect(link("Matemática Discreta")?.getAttribute("href")).toBe("/coordinacion/proyecto-carrera/m2")
    expect(link("Estructuras de Datos")?.getAttribute("href")).toBe("/coordinacion/proyecto-carrera/m3")
    expect(document.querySelector('[data-slot="card"][tabindex]')).toBeNull()
  })

  it("los documentos de apoyo son una pestaña con su propio botón para subir y sin el aviso de edición bloqueada", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      ...scheduled([subject("m2", "Matemática Discreta", 1)]),
      career: { lock_reason: "Periodo académico abierto", lock: { label: "Edición bloqueada", reason: "Periodo académico abierto" } },
    } as unknown as ScheduledSubjects)
    await mountPage()
    expect(document.querySelector('[data-testid="process-lock"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain("Subir documento")

    const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent === "Documentos de apoyo")!
    fireEvent.mouseDown(tab, { button: 0 })
    await flush()

    expect(document.body.textContent).toContain("Subir documento")
    expect(document.querySelector('[data-testid="process-lock"]')).toBeNull()
    expect(document.querySelector('[data-testid="support-documents"]')).not.toBeNull()
    expect(navigation.replace).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera?tab=documentos")
    fireEvent.click([...document.querySelectorAll("button")].find((button) => button.textContent === "Subir documento")!)
    await flush()
    expect(panel.uploadOpen).toBe(true)
  })

  it("abre directamente la pestaña de documentos con ?tab=documentos", async () => {
    navigation.reset("/coordinacion/proyecto-carrera?tab=documentos")
    await mountPage()

    expect(document.querySelector('[data-testid="support-documents"]')).not.toBeNull()
    expect(document.body.textContent).toContain("Subir documento")
  })
})

describe("Proyecto de carrera elegido por Administración", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset("/admin/estructura-academica/carreras/carrera-9/proyecto-carrera")
    vi.mocked(getScheduledSubjects).mockResolvedValue({ ...scheduled([subject("m2", "Matemática Discreta", 1)]), career: { name: "Redes", lock_reason: null, lock: null } } as unknown as ScheduledSubjects)
  })

  it("lee la carrera indicada, enlaza las materias a sus páginas de Administración y no ofrece documentos de apoyo", async () => {
    renderWithProviders(<CoordinationCareerProjectPage careerId="carrera-9" />)
    await flush()
    await openCycles()

    expect(getSession).not.toHaveBeenCalled()
    expect(getScheduledSubjects).toHaveBeenCalledWith("carrera-9")
    expect(document.querySelector('[data-tour="page-header"]')!.textContent).toContain("Proyecto de Redes")
    expect(document.querySelector<HTMLAnchorElement>('[data-slot="card-title"] a')?.getAttribute("href")).toBe("/admin/estructura-academica/carreras/carrera-9/proyecto-carrera/m2")
    expect([...document.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent === "Documentos de apoyo")).toBe(false)
    expect(document.querySelector('[data-testid="support-documents"]')).toBeNull()
  })
})
