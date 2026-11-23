import { fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applyFichaWorkbook, previewFichaWorkbook, type FichaWorkbookPreview } from "@/api/ficha-imports"
import { FichaImportDialog } from "@/components/domain/academic/FichaImportDialog"
import { buttonContaining, keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/ficha-imports", () => ({ previewFichaWorkbook: vi.fn(), downloadFichaWorkbook: vi.fn(), applyFichaWorkbook: vi.fn() }))

const ready: FichaWorkbookPreview = {
  format: "ficha_xlsx_v1",
  fingerprint: "a".repeat(64),
  file_hash: "b".repeat(64),
  fields: [{ key: "descripcion", label: "Descripción" }],
  subjects: [
    { subject_id: "s1", code: "SW-1", name: "Algoritmos", cycle: 1, state: "lista", values: { descripcion: "Texto propuesto" }, replaces: false, current: {} },
    { subject_id: "s2", code: "SW-2", name: "Álgebra", cycle: 1, state: "sin_evidencia", values: {}, replaces: false, current: {} },
  ],
} as FichaWorkbookPreview

const excel = new File(["contenido"], "proyecto.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
const applied = vi.fn()
const openDialog = async (review = true) => {
  renderWithProviders(<FichaImportDialog onApplied={applied} />)
  fireEvent.click(screen.getByRole("button", { name: "Importar desde Excel" }))
  await flush()
  if (review) {
    fireEvent.change(document.body.querySelector<HTMLInputElement>("#ficha-import-files")!, { target: { files: [excel] } })
    await flush()
    fireEvent.click(buttonContaining("Revisar Excel")!)
    await flush()
  }
}

describe("FichaImportDialog", () => {
  beforeEach(() => applied.mockReset())
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("ofrece la plantilla Excel aunque la IA no esté configurada", async () => {
    await openDialog(false)

    expect(buttonContaining("Descargar plantilla Excel")).toBeTruthy()
    expect(buttonContaining("Revisar Excel")).toBeTruthy()
    expect(document.body.textContent).not.toContain("El asistente de IA no está configurado")
  })

  it("muestra la propuesta y aplica solo las materias marcadas", async () => {
    vi.mocked(previewFichaWorkbook).mockResolvedValue({ preview: ready })
    vi.mocked(applyFichaWorkbook).mockResolvedValue({ message: "ok", applied: 1 })
    await openDialog()

    expect(previewFichaWorkbook).toHaveBeenCalledWith(excel)
    expect(document.body.textContent).toContain("Vista previa del Excel para 1 de 2 materias")
    expect(document.body.textContent).toContain("1 de 1 campos con contenido")
    expect(document.body.textContent).toContain("0 de 1 campos con contenido")
    expect([...document.body.querySelectorAll('button:not([data-slot="dialog-close-x"])')].some((item) => item.textContent?.includes("Cerrar"))).toBe(false)
    expect(buttonContaining("Descartar")).toBeTruthy()
    fireEvent.click(buttonContaining("Aplicar a 1 materias")!)
    await flush()

    expect(applyFichaWorkbook).toHaveBeenCalledWith(excel, ready, ["s1"], undefined)
    expect(applied.mock.calls).toEqual([["Proyecto de carrera aplicado a 1 materias"]])
  })

  it("compara con el proyecto de carrera actual y aplica solo los campos marcados", async () => {
    const replacing = {
      ...ready,
      fields: [
        { key: "descripcion", label: "Descripción" },
        { key: "bibliografia", label: "Bibliografía" },
      ],
      subjects: [
        {
          subject_id: "s1",
          code: "SW-1",
          name: "Algoritmos",
          cycle: 1,
          state: "lista",
          values: { descripcion: "Texto propuesto", bibliografia: ["Libro nuevo"] },
          replaces: true,
          current: { descripcion: "Texto actual" },
        },
      ],
    } as FichaWorkbookPreview
    vi.mocked(previewFichaWorkbook).mockResolvedValue({ preview: replacing })
    vi.mocked(applyFichaWorkbook).mockResolvedValue({ message: "ok", applied: 1 })
    await openDialog()

    fireEvent.click(buttonContaining("Comparar con el proyecto de carrera actual")!)
    await flush()
    expect(document.body.textContent).toContain("Texto actual")
    expect(document.body.textContent).toContain("Texto propuesto")
    fireEvent.click(document.body.querySelector<HTMLElement>("#ficha-s1-descripcion")!)
    await flush()
    fireEvent.click(buttonContaining("Aplicar a 1 materias")!)
    await flush()

    expect(applyFichaWorkbook).toHaveBeenCalledWith(excel, replacing, ["s1"], { s1: ["bibliografia"] })
  })

  it("muestra cobertura parcial, tablas y motivos de los campos pendientes", async () => {
    const proposal = {
      ...ready,
      fields: [
        { key: "relacion", label: "Contribución al perfil" },
        { key: "descripcion", label: "Descripción" },
      ],
      subjects: [
        {
          ...ready.subjects[0]!,
          values: { relacion: { columns: ["Resultado", "Nivel"], rows: [["Resuelve sistemas", "Alta"]] } },
          coverage: { found: 1, total: 2 },
          missing: [{ key: "descripcion", label: "Descripción", reason: "no_encontrado" }],
        },
      ],
    } as FichaWorkbookPreview
    vi.mocked(previewFichaWorkbook).mockResolvedValue({ preview: proposal })
    await openDialog()

    expect(document.body.textContent).toContain("1 de 2 campos con contenido")
    expect(document.body.textContent).toContain("Revise el contenido antes de aplicar")
    fireEvent.click(buttonContaining("Revisar campos")!)
    await flush()

    const table = document.body.querySelector("table")
    expect(table?.getAttribute("aria-label")).toBe("Contribución al perfil")
    expect(table?.textContent).toContain("Resuelve sistemas")
    expect(table?.textContent).toContain("Alta")
    expect(document.body.textContent).toContain("Campos pendientes")
    expect(document.body.textContent).toContain("Sin contenido en el archivo")
  })

  it("permite revisar por qué una materia no tiene propuesta", async () => {
    vi.mocked(previewFichaWorkbook).mockResolvedValue({
      preview: { ...ready, subjects: [{ ...ready.subjects[1]!, missing: [{ key: "descripcion", label: "Descripción", reason: "no_encontrado" }] }] } as FichaWorkbookPreview,
    })
    await openDialog()
    fireEvent.click(buttonContaining("Revisar campos")!)
    await flush()

    expect(document.body.textContent).toContain("Sin contenido en el archivo")
    expect(buttonContaining("Aplicar a 0 materias")!.disabled).toBe(true)
  })

  it("al aplicar, el modal se cierra con la vista previa y vuelve al primer paso solo al abrirlo otra vez", async () => {
    keepClosingDialogs()
    vi.mocked(previewFichaWorkbook).mockResolvedValue({ preview: ready })
    vi.mocked(applyFichaWorkbook).mockResolvedValue({ message: "ok", applied: 1 })
    await openDialog()
    fireEvent.click(buttonContaining("Aplicar a 1 materias")!)
    await flush()

    expect(applied).toHaveBeenCalledTimes(1)
    const closing = document.body.querySelector<HTMLElement>('[role="dialog"][data-state="closed"]')!
    expect(closing.textContent).toContain("Vista previa del Excel para 1 de 2 materias")
    expect(closing.className).toContain("sm:max-w-3xl")

    fireEvent.click(screen.getByRole("button", { name: "Importar desde Excel", hidden: true }))
    await flush()
    const reopened = document.body.querySelector<HTMLElement>('[role="dialog"][data-state="open"]')!
    expect(reopened.textContent).toContain("Descargar plantilla Excel")
    expect(reopened.textContent).not.toContain("Vista previa del Excel")
  })
})
