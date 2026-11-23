import { fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTeacherSupportDocuments, viewSupportDocument, type SupportDocument } from "@/api/support-documents"
import { SupportDocumentsButton } from "@/components/domain/academic/SupportDocumentsButton"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/support-documents", () => ({
  getTeacherSupportDocuments: vi.fn(),
  viewSupportDocument: vi.fn(),
}))
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const doc = (id: string, title: string, view: SupportDocument["view"] = "lista"): SupportDocument => ({
  id,
  title,
  view,
  size: 2048,
  uploaded_at: "2026-11-02T15:00:00Z",
})
const dialog = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[role="dialog"]')
const mountButton = async () => {
  renderWithProviders(<SupportDocumentsButton />)
  await flush()
}
const openList = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Documentos de apoyo" }))
  await flush()
}

describe("Botón «Documentos de apoyo» del docente", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:vista")
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("no aparece si la coordinación no subió documentos", async () => {
    vi.mocked(getTeacherSupportDocuments).mockResolvedValue({ data: [] })
    await mountButton()

    expect(screen.queryByRole("button", { name: "Documentos de apoyo" })).toBeNull()
  })

  it("no aparece si la lista no se pudo cargar", async () => {
    vi.mocked(getTeacherSupportDocuments).mockRejectedValue(new Error("sin red"))
    await mountButton()

    expect(screen.queryByRole("button", { name: "Documentos de apoyo" })).toBeNull()
  })

  it("con documentos, el botón abre un modal con cada archivo y cada uno se abre en una ventana aparte", async () => {
    vi.mocked(getTeacherSupportDocuments).mockResolvedValue({ data: [doc("d1", "Proyecto de carrera"), doc("d2", "Guía TIC y TAC")] })
    const tab = { location: { href: "" }, close: vi.fn(), focus: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    vi.mocked(viewSupportDocument).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }))
    await mountButton()

    await openList()
    expect(dialog()?.textContent).toContain("Documentos de apoyo")
    expect(dialog()?.textContent).toContain("Proyecto de carrera")
    expect(dialog()?.textContent).toContain("Guía TIC y TAC")
    expect(getTeacherSupportDocuments).toHaveBeenCalledTimes(2)

    fireEvent.click(dialog()!.querySelector<HTMLButtonElement>('[aria-label="Abrir Guía TIC y TAC"]')!)
    await flush()
    expect(viewSupportDocument).toHaveBeenCalledWith("d2")
    expect(window.open).toHaveBeenCalledWith("", "silabos-pdf", expect.stringContaining("popup=yes"))
    expect(tab.location.href).toBe("blob:vista")
  })

  it("un documento sin vista lista no se puede abrir y dice por qué", async () => {
    vi.mocked(getTeacherSupportDocuments).mockResolvedValue({ data: [doc("d1", "Malla", "pendiente"), doc("d2", "Horario", "sin_vista")] })
    await mountButton()
    await openList()

    expect(dialog()!.querySelector<HTMLButtonElement>('[aria-label="Abrir Malla"]')!.disabled).toBe(true)
    expect(dialog()!.querySelector<HTMLButtonElement>('[aria-label="Abrir Horario"]')!.disabled).toBe(true)
    expect(dialog()?.textContent).toContain("Preparando vista")
    expect(dialog()?.textContent).toContain("No se pudo preparar la vista")
  })

  it("si el documento no se puede abrir, cierra la ventana y lo avisa", async () => {
    const { toast } = await import("@/lib/toast")
    vi.mocked(getTeacherSupportDocuments).mockResolvedValue({ data: [doc("d1", "Proyecto de carrera")] })
    const tab = { location: { href: "" }, close: vi.fn(), focus: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    vi.mocked(viewSupportDocument).mockRejectedValue(new Error("falló"))
    await mountButton()
    await openList()

    fireEvent.click(dialog()!.querySelector<HTMLButtonElement>('[aria-label="Abrir Proyecto de carrera"]')!)
    await flush()
    expect(tab.close).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("No se pudo abrir el documento")
  })
})
