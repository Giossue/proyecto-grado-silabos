import { cleanup, fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { compareReviews, getReview, type ReviewDetail } from "@/api/reviews"
import CoordinationReviewHistoryPage from "./CoordinationReviewHistoryPage"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

const route = vi.hoisted(() => ({ params: { revision: "r2" } as Record<string, string> }))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => route.params }))
vi.mock("@/api/reviews", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/reviews")>()), getReview: vi.fn(), compareReviews: vi.fn() }))

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
const detail = (revision: string, number: number): ReviewDetail => ({
  syllabus: { id: "s1", subject: "Calidad de Software", code: "SW-603", period: "2026-2027", state: "en_revision", stage: "coordinacion", teachers: ["Docente Demo"] },
  presentation: { appearance: {}, title: "SÍLABO", logos: { institution: "/a.png", faculty: "/b.png" } },
  revision: { id: revision, number, submitted_at: "2026-10-30T10:00:00Z", submitted_by: "Docente Demo", is_current: number === 2, snapshot: { sections: [{ key: "descripcion", title: "Descripción", fields: [{ key: "objetivo", label: "Objetivo general", quien_llena: "docente", value: doc("Contenido") }] }] } },
  history: [
    { id: "r1", number: 1, submitted_at: "2026-10-29T10:00:00Z", submitted_by: "Docente Demo", approved_at: null },
    { id: "r2", number: 2, submitted_at: "2026-10-30T10:00:00Z", submitted_by: "Docente Demo", approved_at: null },
  ],
  timeline: [
    { kind: "enviado", at: "2026-10-30T10:00:00Z", revision_id: "r2", revision_number: 2, by: "Docente Demo", comment: null, previous_id: "r1" },
    { kind: "correccion", at: "2026-10-29T15:00:00Z", revision_id: "r1", revision_number: 1, by: "Coordinadora Demo", comment: "Revise la unidad 2.", previous_id: null },
    { kind: "enviado", at: "2026-10-29T10:00:00Z", revision_id: "r1", revision_number: 1, by: "Docente Demo", comment: null, previous_id: null },
  ],
  correction_request: null,
  decisions_allowed: true,
  reset: { allowed: false },
}) as unknown as ReviewDetail

const mountPage = async () => {
  const view = renderWithProviders(<CoordinationReviewHistoryPage />)
  await flush()
  return view
}
const panel = (): HTMLElement => document.querySelector<HTMLElement>('aside[aria-label="Historial de versiones"]')!
const toggle = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('button[aria-label="Resaltar cambios"]')!

describe("CoordinationReviewHistoryPage", () => {
  beforeEach(() => {
    navigation.reset("/coordinacion/revisiones/r2/historial")
    vi.mocked(getReview).mockReset().mockResolvedValue(detail("r2", 2))
    vi.mocked(compareReviews).mockReset()
  })
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ""
  })

  it("muestra el documento de la versión elegida y el panel de versiones agrupado por día, con la actual marcada", async () => {
    const { container } = await mountPage()

    expect(panel().textContent).toContain("Versión 2 · Corregida tras observaciones")
    expect(panel().textContent).toContain("Versión actual")
    expect(panel().textContent).toContain("Versión 1 · Primer envío")
    expect(panel().textContent).toContain("Coordinación pidió correcciones")
    expect(panel().textContent).toContain("Revise la unidad 2.")
    expect(panel().querySelectorAll("h3")).toHaveLength(2)
    expect(container.textContent).toContain("Contenido")
    expect(container.textContent).toContain("Calidad de Software")
  })

  it("muestra que Biblioteca verificó antes y que Coordinación dio la aprobación final", async () => {
    vi.mocked(getReview).mockResolvedValue({
      ...detail("r2", 2),
      timeline: [
        { kind: "aprobado", at: "2026-10-31T10:00:00Z", revision_id: "r2", revision_number: 2, by: "Coordinadora Demo", comment: null, previous_id: null },
        { kind: "biblioteca_verifico", at: "2026-10-30T15:00:00Z", revision_id: "r2", revision_number: 2, by: "Bibliotecaria Demo", comment: null, previous_id: null },
        { kind: "enviado", at: "2026-10-30T10:00:00Z", revision_id: "r2", revision_number: 2, by: "Docente Demo", comment: null, previous_id: "r1" },
      ],
    } as ReviewDetail)
    await mountPage()

    expect(panel().textContent).toContain("Biblioteca verificó la bibliografía y envió a Coordinación")
    expect(panel().textContent).toContain("Coordinación aprobó el sílabo")
    expect(panel().textContent).not.toContain("Sílabo aprobado por Biblioteca")
  })

  it("al elegir otra versión abre ese envío", async () => {
    await mountPage()

    fireEvent.click([...panel().querySelectorAll("button")].find((button) => button.textContent?.includes("Versión 1 · Primer envío"))!)

    expect(navigation.replace).toHaveBeenCalledWith("/coordinacion/revisiones/r1/historial")
  })

  it("marca solos los campos que cambiaron respecto a la versión anterior", async () => {
    vi.mocked(compareReviews).mockResolvedValue({ comparison: { changes: [{ section_key: "descripcion", field_key: "objetivo" }], changed_fields: 1 } } as never)
    const { container } = await mountPage()

    expect(compareReviews).toHaveBeenCalledWith("r1", "r2")
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(1)
  })

  it("el botón «Resaltar cambios» quita y vuelve a poner el resaltado", async () => {
    vi.mocked(compareReviews).mockResolvedValue({ comparison: { changes: [{ section_key: "descripcion", field_key: "objetivo" }], changed_fields: 1 } } as never)
    const { container } = await mountPage()

    expect(toggle().disabled).toBe(false)
    fireEvent.click(toggle())
    await flush()
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(0)
    fireEvent.click(toggle())
    await flush()
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(1)
  })

  it("sin cambios entre versiones, «Resaltar cambios» queda deshabilitado", async () => {
    vi.mocked(compareReviews).mockResolvedValue({ comparison: { changes: [], changed_fields: 0 } } as never)
    await mountPage()

    expect(toggle().disabled).toBe(true)
  })
})
