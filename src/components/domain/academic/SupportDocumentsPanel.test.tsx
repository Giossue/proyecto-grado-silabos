import { fireEvent, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  deleteSupportDocument,
  getCoordinationSupportDocuments,
  getTeacherSupportDocuments,
  uploadSupportDocument,
  viewSupportDocument,
  type SupportDocument,
} from "@/api/support-documents"
import { SupportDocumentsPanel } from "@/components/domain/academic/SupportDocumentsPanel"
import { buttonWithText, keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/support-documents", () => ({
  getCoordinationSupportDocuments: vi.fn(),
  getTeacherSupportDocuments: vi.fn(),
  uploadSupportDocument: vi.fn(),
  deleteSupportDocument: vi.fn(),
  viewSupportDocument: vi.fn(),
}))

const doc = (id: string, title: string, view: SupportDocument["view"] = "lista"): SupportDocument => ({
  id,
  title,
  view,
  size: 2048,
  uploaded_at: "2026-11-02T15:00:00Z",
})

const loading = vi.fn()

function Harness({ mode, uploadOpen = false }: { mode: "coordination" | "teacher"; uploadOpen?: boolean }) {
  const [open, setOpen] = useState(uploadOpen)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir subida
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cerrar subida
      </button>
      <SupportDocumentsPanel manages={mode === "coordination"} uploadOpen={open} onUploadOpenChange={setOpen} onLoadingChange={loading} />
    </>
  )
}

const mountPanel = async (mode: "coordination" | "teacher", uploadOpen = false) => {
  renderWithProviders(<Harness mode={mode} uploadOpen={uploadOpen} />)
  await flush()
}
const dialogs = (): HTMLElement[] => [...document.body.querySelectorAll<HTMLElement>('[role="dialog"]')]

describe("Documentos de apoyo", () => {
  beforeEach(() => {
    loading.mockReset()
    vi.mocked(getCoordinationSupportDocuments).mockResolvedValue({ data: [doc("d1", "Proyecto de carrera"), doc("d2", "TIC TAC", "sin_vista")] })
    vi.mocked(getTeacherSupportDocuments).mockResolvedValue({ data: [doc("d1", "Proyecto de carrera")] })
    URL.createObjectURL = vi.fn(() => "blob:vista")
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("el docente ve la lista sin subir ni eliminar y abre el documento en una ventana aparte", async () => {
    const tab = { location: { href: "" }, close: vi.fn(), focus: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    vi.mocked(viewSupportDocument).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }))
    await mountPanel("teacher")

    expect(document.body.textContent).toContain("Proyecto de carrera")
    expect(document.body.textContent).not.toContain("PDF")
    expect(document.body.querySelector('[aria-label^="Eliminar "]')).toBeNull()
    expect(document.body.querySelector('[data-testid="support-document-form"]')).toBeNull()
    expect(getCoordinationSupportDocuments).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Proyecto de carrera" }))
    await flush()
    expect(viewSupportDocument).toHaveBeenCalledWith("d1")
    expect(window.open).toHaveBeenCalledWith("", "silabos-pdf", expect.stringContaining("popup=yes"))
    expect(tab.location.href).toBe("blob:vista")
    expect(tab.focus).toHaveBeenCalled()
  })

  it("un documento sin vista previa no se abre al pulsar la fila", async () => {
    await mountPanel("coordination")

    expect(screen.queryByRole("button", { name: "TIC TAC" })).toBeNull()
    expect(document.body.textContent).toContain("No se pudo preparar la vista")
    expect(document.body.textContent).not.toContain("Excel")
  })

  it("Coordinación sube un documento con el nombre que escribe y Subir queda deshabilitado hasta completar ambos", async () => {
    vi.mocked(uploadSupportDocument).mockResolvedValue({ message: "Documento subido.", document: doc("d3", "Habilidades blandas", "pendiente") })
    await mountPanel("coordination", true)

    const form = document.body.querySelector<HTMLFormElement>('[data-testid="support-document-form"]')!
    const submit = buttonWithText("Subir", form)!
    expect(submit.disabled).toBe(true)

    const file = new File(["contenido"], "habilidades_blandas.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
    fireEvent.change(form.querySelector<HTMLInputElement>("#support-document-file")!, { target: { files: [file] } })
    await flush()

    const title = form.querySelector<HTMLInputElement>("#support-document-title")!
    expect(title.value).toBe("")
    expect(submit.disabled).toBe(true)
    fireEvent.change(title, { target: { value: "Habilidades blandas" } })
    await flush()
    expect(submit.disabled).toBe(false)
    fireEvent.submit(form)
    await flush()

    expect(uploadSupportDocument).toHaveBeenCalledWith("Habilidades blandas", file)
    expect(document.body.textContent).toContain("Preparando vista")
  })

  it("al abrir un documento no aparece un indicador de carga junto al nombre", async () => {
    vi.spyOn(window, "open").mockReturnValue({ location: { href: "" }, close: vi.fn(), focus: vi.fn() } as unknown as Window)
    vi.mocked(viewSupportDocument).mockReturnValue(new Promise(() => {}))
    await mountPanel("teacher")

    fireEvent.click(screen.getByRole("button", { name: "Proyecto de carrera" }))
    await flush()

    expect(viewSupportDocument).toHaveBeenCalledWith("d1")
    expect(document.body.querySelector('[aria-label="Abriendo"]')).toBeNull()
  })

  it("Coordinación elimina un documento tras confirmar", async () => {
    vi.mocked(deleteSupportDocument).mockResolvedValue({ message: "Documento eliminado." })
    await mountPanel("coordination")

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Proyecto de carrera" }))
    await flush()
    expect(viewSupportDocument).not.toHaveBeenCalled()

    fireEvent.click(buttonWithText("Eliminar", screen.getByRole("dialog"))!)
    await flush()

    expect(deleteSupportDocument).toHaveBeenCalledWith("d1")
    expect(document.body.querySelector("tbody")?.textContent).not.toContain("Proyecto de carrera")
  })

  it("al eliminar, el modal conserva el nombre del documento mientras se cierra", async () => {
    keepClosingDialogs()
    vi.mocked(deleteSupportDocument).mockResolvedValue({ message: "Documento eliminado." })
    await mountPanel("coordination")

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Proyecto de carrera" }))
    await flush()
    fireEvent.click(buttonWithText("Eliminar", dialogs().find((dialog) => dialog.getAttribute("data-state") === "open")!)!)
    await flush()

    expect(deleteSupportDocument).toHaveBeenCalledWith("d1")
    const closing = dialogs().find((dialog) => dialog.getAttribute("data-state") === "closed")!
    expect(closing.textContent).toContain("Eliminar Proyecto de carrera")
  })

  it("el formulario de subida se limpia al volver a abrirlo, no mientras se cierra", async () => {
    keepClosingDialogs()
    await mountPanel("coordination", true)
    const title = (): HTMLInputElement => document.body.querySelector<HTMLInputElement>("#support-document-title")!
    fireEvent.change(title(), { target: { value: "Borrador" } })
    await flush()

    fireEvent.click(screen.getByText("Cerrar subida"))
    await flush()
    expect(title().value).toBe("Borrador")

    fireEvent.click(screen.getByText("Abrir subida"))
    await flush()
    expect(title().value).toBe("")
  })

  it("avisa a la página mientras hace la primera carga", async () => {
    let resolve: (value: { data: SupportDocument[] }) => void = () => {}
    vi.mocked(getTeacherSupportDocuments).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }) as never,
    )
    renderWithProviders(<Harness mode="teacher" />)

    expect(loading.mock.calls.at(-1)).toEqual([true])
    expect(document.body.querySelectorAll('[data-skeleton="table-row"]')).toHaveLength(4)
    expect(document.body.querySelector('[data-skeleton="table-pagination"]')).not.toBeNull()

    resolve({ data: [doc("1", "Reglamento")] })
    await flush()
    expect(loading.mock.calls.at(-1)).toEqual([false])
  })
})
