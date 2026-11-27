import { setupChecklistState } from "@/state/setupChecklist"
import { fireEvent, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getConvocation } from "@/api/convocations"
import { getDashboard, type Dashboard } from "@/api/dashboard"
import { getReviews, type ReviewsPage } from "@/api/reviews"
import { getSession } from "@/api/session"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import CoordinationReviewsPage from "./CoordinationReviewsPage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/dashboard", () => ({ getDashboard: vi.fn() }))
vi.mock("@/api/reviews", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/reviews")>()), getReviews: vi.fn() }))
vi.mock("@/api/convocations", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/convocations")>()), getConvocation: vi.fn() }))
vi.mock("@/components/domain/PageFrame", () => ({
  PageFrame: ({ banner, actions, children }: { banner?: ReactNode; actions?: ReactNode; children?: ReactNode }) => (
    <div>
      {banner}
      <div className="actions">{actions}</div>
      {children}
    </div>
  ),
}))
vi.mock("@/components/domain/syllabus/ConvocationOpeningDialog", () => ({ ConvocationOpeningDialog: () => null }))

const reviews: ReviewsPage = {
  filters: { search: "" },
  syllabi: {
    data: [{ id: "s1", revision_id: "r1", revision_number: 1, subject: "Álgebra Lineal", code: "SW-B1-002", period: "2026-2027", state: "en_revision", stage: "coordinacion", teachers: ["Domenica Arias"], submitted_at: "2026-10-27T10:00:00Z" }],
    current_page: 1, last_page: 1, per_page: 20, from: 1, to: 1, total: 1,
  },
}

const summary = (convocationId: string | null): Dashboard => ({
  metrics: [],
  setup: { title: "Antes de empezar", intro: "", done: 4, total: 5, steps: ["curriculum", "scheduled_subjects", "parallels", "teachers", "convocation"].map((key) => ({ key, label: key, hint: key === "convocation" ? "Complete la ficha de 2 materia(s) en Proyecto de carrera." : "", done: key !== "convocation", action: null })) },
  deadline: { period: "2026-2027", starts_at: "2026-10-26", due_at: "2026-10-30", state: "active", days_until_start: 0, days_until_due: 3, convocation_id: convocationId, paused_by: null, classes_ended: false, career_pending: false },
  coordination_convocation: { process_id: "p1", period: "2026-2027", convocation_id: convocationId, can_open: convocationId === null, state: convocationId ? "abierto" : null, process_open: true },
})

const mountPage = () => renderWithProviders(<CoordinationReviewsPage />)

describe("CoordinationReviewsPage", () => {
  beforeEach(() => {
    navigation.reset("/coordinacion/revisiones")
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador" } } as Awaited<ReturnType<typeof getSession>>)
    vi.mocked(getReviews).mockResolvedValue(reviews)
    vi.mocked(getDashboard).mockResolvedValue(summary("c1"))
    vi.mocked(getConvocation).mockReset().mockResolvedValue({
      convocation: {
        id: "c1", name: "Software", state: "abierto", process: { name: "P", state: "abierto" }, period: "2026-2027", template: "Oficial", start_date: null, draft_deadline: null,
        counts: { total: 2, not_started: 1, draft: 0, in_review: 1, approved: 0 },
        syllabi: [{ id: "s2", subject: "Programación Orientada a Objetos", code: "SW-B2-006", state: "sin_iniciar", iniciado_en: null, parallels: ["A"], teachers: ["Eduardo Narvaez"] }],
      },
    })
  })

  it("reúne arriba Pausar y las demás acciones, sin indicadores", async () => {
    const { container, unmount } = mountPage()
    await flush()

    expect(container.textContent).not.toContain("Avance del proceso")
    expect(container.querySelector(".actions")!.textContent).toContain("Pausar periodo académico")
    expect(container.textContent).toContain("Álgebra Lineal")
    expect(container.textContent).toContain("27 oct 2026")
    expect(container.textContent).not.toContain("Por revisar")
    expect(container.querySelector("#review-state")).toBeNull()
    expect(container.textContent).not.toContain("Todos los estados")
    unmount()
  })

  it("abre en la pestaña que dice la dirección, para que «Volver» regrese a Seguimiento", async () => {
    navigation.reset("/coordinacion/revisiones?tab=seguimiento")
    const { container, unmount } = mountPage()
    await flush()

    expect(container.querySelector('[role="tab"][data-state="active"]')!.textContent).toContain("Seguimiento")
    unmount()
  })

  it("sin todo listo, «Abrir periodo académico» sigue activo y abre «Antes de empezar»", async () => {
    vi.mocked(getDashboard).mockResolvedValue({ ...summary(null), coordination_convocation: { ...summary(null).coordination_convocation!, can_open: false } })
    const { container, unmount } = mountPage()
    await flush()

    const open = [...container.querySelectorAll<HTMLButtonElement>(".actions button")].find((button) => button.textContent?.includes("Abrir periodo académico"))!
    expect(open.disabled).toBe(false)
    const requests = setupChecklistState.openRequests.value
    fireEvent.click(open)
    await flush()
    expect(setupChecklistState.openRequests.value).toBe(requests + 1)
    unmount()
  })

  it("muestra el seguimiento en una pestaña, no en un modal", async () => {
    const { container, unmount } = mountPage()
    await flush()

    expect(getConvocation).not.toHaveBeenCalled()
    fireEvent.mouseDown(container.querySelector('[role="tab"][aria-controls]:not([aria-selected="true"])')!, { button: 0 })
    await flush()

    expect(getConvocation).toHaveBeenCalledWith("c1")
    expect(container.textContent).toContain("Programación Orientada a Objetos")
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('.overflow-x-auto > div > [data-slot="table-container"]')).toBeNull()
    unmount()
  })

  it("sin periodo académico ofrece abrirlo y el seguimiento se puede abrir y dice que aún no hay datos", async () => {
    vi.mocked(getDashboard).mockResolvedValue(summary(null))
    const first = mountPage()
    await flush()

    expect(first.container.querySelector(".actions")!.textContent).toContain("Abrir periodo académico")
    const seguimiento = [...first.container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Seguimiento")!
    expect(seguimiento.hasAttribute("data-disabled")).toBe(false)
    expect(first.container.textContent).not.toContain("Disponible cuando abra el periodo académico")
    first.unmount()

    navigation.reset("/coordinacion/revisiones?tab=seguimiento")
    const tracking = mountPage()
    await flush()
    expect(tracking.container.querySelector('[role="tab"][data-state="active"]')!.textContent).toContain("Seguimiento")
    expect(tracking.container.textContent).toContain("Aún no hay periodo académico abierto en su carrera")
    expect(tracking.container.querySelector("#convocation-syllabi-search-none")).not.toBeNull()
    expect(tracking.container.querySelector("#convocation-syllabi-search-state-none")).not.toBeNull()
    expect(tracking.container.querySelector("table")).not.toBeNull()
    expect(getConvocation).not.toHaveBeenCalled()
    tracking.unmount()
  })

  it("con periodo académico la pestaña Seguimiento recibe clics", async () => {
    const { container, unmount } = mountPage()
    await flush()
    const seguimiento = [...container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Seguimiento")!

    expect(seguimiento.hasAttribute("data-disabled")).toBe(false)
    expect(container.textContent).not.toContain("Aún no hay periodo académico abierto")
    unmount()
  })

  it("muestra un ícono en cada pestaña", async () => {
    vi.mocked(getDashboard).mockResolvedValue(summary(null))
    const { container, unmount } = mountPage()
    await flush()

    const tabs = [...container.querySelectorAll('[role="tab"]')]
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Cola de revisión", "Seguimiento"])
    expect(tabs.every((tab) => tab.querySelector("svg") !== null)).toBe(true)
    unmount()
  })

  it("ordena la cola desde el encabezado en el servidor, vuelve a la página 1 y lo guarda en la dirección", async () => {
    navigation.reset("/coordinacion/revisiones?page=2")
    mountPage()
    await flush()
    expect(getReviews).toHaveBeenLastCalledWith({ search: "", page: 2 })

    fireEvent.click(screen.getByRole("button", { name: "Enviado" }))
    await flush()
    expect(getReviews).toHaveBeenLastCalledWith({ search: "", sort: "submitted", dir: "asc", page: 1 })
    expect(screen.getByRole("columnheader", { name: "Enviado" }).getAttribute("aria-sort")).toBe("ascending")
    expect(screen.getByRole("columnheader", { name: "Asignatura" }).hasAttribute("aria-sort")).toBe(false)
    expect(navigation.fullPath).toBe("/coordinacion/revisiones?sort=submitted&dir=asc")
    expect(screen.getByRole("status").textContent).toBe("Ordenado por Enviado, ascendente, 1 fila")

    fireEvent.click(screen.getByRole("button", { name: "Enviado" }))
    await flush()
    expect(getReviews).toHaveBeenLastCalledWith({ search: "", sort: "submitted", dir: "desc", page: 1 })
    expect(screen.getByRole("columnheader", { name: "Enviado" }).getAttribute("aria-sort")).toBe("descending")
  })
})
