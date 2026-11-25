import { cleanup, fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { downloadDocument, getDocuments, type DocumentsPayload } from "@/api/documents"
import { getSession } from "@/api/session"
import DocumentsPage from "./DocumentsPage"
import { flush, renderWithProviders } from "@/test/render"

const route = vi.hoisted(() => ({ params: { revision: "revision-1" } as Record<string, string> }))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => route.params }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/documents", () => ({ getDocuments: vi.fn(), downloadDocument: vi.fn(), requestDocuments: vi.fn() }))

const payload = (estado: string, files: DocumentsPayload["artifacts"][number]["files"]): DocumentsPayload => ({
  syllabus: { id: "syllabus-1", subject: "Arquitectura de Software", code: "SW-601", period: "2026-2027" },
  revision: { id: "revision-1", number: 2, approved_at: "2026-10-01T10:00:00Z", approved_by: "Biblioteca Demo" },
  artifacts: [{ id: "artifact-1", estado, requested_at: "2026-10-01T10:00:00Z", completed_at: null, error: null, files }],
})

const buttons = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>("button")]

describe("DocumentsPage", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u1", name: "Docente", email: "d@example.test", email_verified: true, can_edit_identity: false }, active_role: { id: "r1", code: "docente", career_id: null, career_name: null }, available_roles: [] } as never)
    vi.mocked(downloadDocument).mockReset()
    URL.createObjectURL = vi.fn(() => "blob:pdf")
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ""
  })

  it("solo ofrece ver y descargar el PDF", async () => {
    vi.mocked(getDocuments).mockResolvedValue(payload("completado", { pdf_size: 2048 }))
    vi.mocked(downloadDocument).mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }))
    const { container, unmount } = renderWithProviders(<DocumentsPage />)
    await flush()

    const labels = buttons().map((button) => button.textContent)
    expect(labels).toEqual(expect.arrayContaining(["Ver PDF", "Descargar PDF"]))
    expect(container.textContent).not.toContain("DOCX")
    expect(container.textContent).not.toContain("Generar")
    expect(container.textContent).not.toContain("tres firmas")
    fireEvent.click(buttons().find((button) => button.textContent === "Descargar PDF")!)
    await flush()
    expect(downloadDocument).toHaveBeenCalledWith("artifact-1")
    unmount()
  })

  it("avisa mientras el PDF se genera", async () => {
    vi.mocked(getDocuments).mockResolvedValue(payload("pendiente", null))
    const { container, unmount } = renderWithProviders(<DocumentsPage />)
    await flush()

    expect(container.textContent).toContain("Generando el PDF")
    expect(buttons().some((button) => button.textContent === "Descargar PDF")).toBe(false)
    unmount()
  })
})
