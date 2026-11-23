import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DashboardDeadline } from "@/api/dashboard"
import { getDashboard } from "@/api/dashboard"
import { getTeacherSyllabi, type SyllabiResponse } from "@/api/syllabi"
import { getTeacherSupportDocuments } from "@/api/support-documents"
import type { Signal } from "@/lib/signal"
import { deadlineState } from "@/state/deadline"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import { SYLLABUS_PREVIEW_KEY } from "@/components/domain/syllabus/syllabusPreview"
import TeacherSyllabiPage from "./TeacherSyllabiPage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/state/deadline", async () => {
  const { signal } = await import("@/lib/signal")
  return { deadlineState: { deadline: signal(null) } }
})
vi.mock("@/api/dashboard", () => ({ getDashboard: vi.fn() }))
vi.mock("@/api/syllabi", () => ({ getTeacherSyllabi: vi.fn() }))
vi.mock("@/api/support-documents", () => ({ getTeacherSupportDocuments: vi.fn(), viewSupportDocument: vi.fn() }))

const deadline = deadlineState.deadline as Signal<DashboardDeadline | null>

const syllabi: SyllabiResponse = {
  filters: { q: null, state: null },
  syllabi: {
    data: [{ id: "s1", subject: "Álgebra Lineal", code: "MAT-101", convocation: "c1", period: "2026-2027", state: "sin_iniciar", iniciado_en: null, parallels: ["A"], guardado_en: "2026-10-27T15:46:00Z" }],
    current_page: 1, last_page: 1, per_page: 15, total: 1, from: 1, to: 1,
  },
}

const mountPage = async () => {
  const view = renderWithProviders(<TeacherSyllabiPage />)
  await flush()
  return view
}

const list = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('[aria-label="Mis sílabos"]')!

describe("TeacherSyllabiPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset("/docente/mis-silabos")
    sessionStorage.clear()
    deadline.value = null
    vi.mocked(getTeacherSyllabi).mockResolvedValue(syllabi)
  })

  it("deja «Documentos de apoyo» para el sílabo: la lista solo ofrece el historial", async () => {
    vi.mocked(getTeacherSupportDocuments).mockResolvedValue({ data: [{ id: "d1", title: "Proyecto de carrera", size: 2048, view: "lista", uploaded_at: "2026-11-02T15:00:00Z" }] })
    const { container } = await mountPage()

    expect(container.querySelector('[aria-label="Documentos de apoyo"]')).toBeNull()
    expect(container.querySelector('[aria-label="Historial"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Historial"]')!.getAttribute("href")).toBe("/docente/historial")
    expect(getTeacherSupportDocuments).not.toHaveBeenCalled()
  })

  it("muestra los sílabos sin indicadores arriba", async () => {
    const { container } = await mountPage()

    expect(getDashboard).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("Sílabos por entregar")
    expect(container.textContent).not.toContain("Continuar mis sílabos")
    expect(list(container).textContent).toContain("Álgebra Lineal")
  })

  it("al abrir un sílabo enviado avisa que cargue como documento", async () => {
    vi.mocked(getTeacherSyllabi).mockResolvedValue({ ...syllabi, syllabi: { ...syllabi.syllabi, data: [{ ...syllabi.syllabi.data[0]!, state: "en_revision" }] } })
    const { container } = await mountPage()

    fireEvent.click(container.querySelector('[aria-label="Abrir sílabo de Álgebra Lineal"]')!)
    expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos/s1")
    expect(sessionStorage.getItem(SYLLABUS_PREVIEW_KEY)).toBe("s1")
  })

  it("al abrir un sílabo sin enviar no deja el aviso de documento", async () => {
    sessionStorage.setItem(SYLLABUS_PREVIEW_KEY, "s1")
    const { container } = await mountPage()

    fireEvent.keyDown(container.querySelector('[aria-label="Abrir sílabo de Álgebra Lineal"]')!, { key: "Enter" })
    expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos/s1")
    expect(sessionStorage.getItem(SYLLABUS_PREVIEW_KEY)).toBeNull()
  })

  it("la tarjeta no muestra el último guardado", async () => {
    const { container } = await mountPage()

    const card = list(container).textContent
    expect(card).not.toContain("Último guardado")
    expect(card).not.toContain("Sin guardados")
  })

  it("acomoda hasta tres tarjetas por fila", async () => {
    const { container } = await mountPage()

    expect(list(container)).toHaveClass("lg:grid-cols-3")
  })

  it("muestra la paginación cuando hay más de una página", async () => {
    vi.mocked(getTeacherSyllabi).mockResolvedValue({ ...syllabi, syllabi: { ...syllabi.syllabi, last_page: 2, total: 30, from: 1, to: 15 } })
    const { container } = await mountPage()

    expect(container.textContent).toContain("1–15 de 30")
    expect(container.querySelector('[aria-label="Paginación de mis sílabos"]')).not.toBeNull()
  })

  it("sin convocatoria abierta explica por qué no hay sílabos", async () => {
    const empty = { ...syllabi.syllabi, data: [], total: 0, from: null, to: null }
    vi.mocked(getTeacherSyllabi).mockResolvedValue({ ...syllabi, syllabi: empty, convocation_open: false })
    const closed = await mountPage()
    expect(closed.container.textContent).toContain("Todavía no hay una convocatoria abierta")
    expect(closed.container.textContent).not.toContain("No tiene sílabos asignados")
    closed.unmount()

    vi.mocked(getTeacherSyllabi).mockResolvedValue({ ...syllabi, syllabi: empty, convocation_open: true })
    const open = await mountPage()
    expect(open.container.textContent).toContain("No tiene sílabos asignados")
    expect(open.container.textContent).not.toContain("Todavía no hay una convocatoria abierta")
  })

  it("con la convocatoria en pausa y sin sílabos dice que no tiene sílabos asignados", async () => {
    deadline.value = { state: "paused" } as DashboardDeadline
    vi.mocked(getTeacherSyllabi).mockResolvedValue({ ...syllabi, syllabi: { ...syllabi.syllabi, data: [], total: 0, from: null, to: null }, convocation_open: false })
    const { container } = await mountPage()

    expect(container.textContent).toContain("No tiene sílabos asignados")
    expect(container.textContent).not.toContain("Cuando se reanude")
    expect(container.textContent).not.toContain("Todavía no hay una convocatoria abierta")
  })

  it("vuelve a pedir los sílabos al filtrar", async () => {
    const { container } = await mountPage()

    fireEvent.submit(container.querySelector("form")!)
    await flush()
    expect(getTeacherSyllabi).toHaveBeenCalledTimes(2)
  })

  it("toma la búsqueda, el estado y la página de la URL", async () => {
    navigation.reset("/docente/mis-silabos?q=algebra&state=borrador&page=2")
    await mountPage()

    expect(getTeacherSyllabi).toHaveBeenCalledWith({ q: "algebra", state: "borrador", page: 2 })
  })
})
