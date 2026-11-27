import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fillBulkField, getBulkFields, type BulkFields } from "@/api/ficha-bulk"
import { ApiError } from "@/api/client"
import { BulkFieldDialog } from "@/components/domain/academic/BulkFieldDialog"
import { buttonWithText } from "@/components/domain/academic/academicTestUtils"
import { BULK_NO_OPTIONS, BULK_UNDECIDED } from "@silabos/shared/schemas/imports"
import { flush, renderWithProviders } from "@/test/render"

const documents = vi.hoisted(() => ({
  blank: { type: "doc", content: [{ type: "paragraph" }] },
  written: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Lo mismo para todas" }] }] },
  noOptions: { type: "doc", content: [{ type: "paragraph", content: [{ type: "response", attrs: { kind: "varias", options: [], value: [] } }] }] },
}))

vi.mock("@/api/ficha-bulk", () => ({ getBulkFields: vi.fn(), fillBulkField: vi.fn() }))
vi.mock("@/components/ui/select", async () => (await import("@/components/domain/academic/curriculum/curriculumTestUtils")).selectStub)
vi.mock("@/components/domain/syllabus/FieldResponseEditor", () => ({
  FieldResponseEditor: ({ id, label, value, onValueChange }: { id: string; label: string; value?: unknown; onValueChange?: (next: unknown) => void }) => (
    <div id={id} data-editor={label} data-document={JSON.stringify(value ?? null)}>
      <button type="button" onClick={() => onValueChange?.(documents.written)}>editor: escribir</button>
      <button type="button" onClick={() => onValueChange?.(documents.noOptions)}>editor: elección sin opciones</button>
    </div>
  ),
}))

const field = (id: string, label: string, filled: string[]) => ({ id, key: id, label, section: "Metodología", quien_llena: "carrera" as const, content: documents.blank, template: documents.blank, filled_subjects: filled })
const catalog = (extra: Partial<BulkFields> = {}): BulkFields => ({
  fields: [field("metodos", "Métodos de enseñanza", ["s2"]), field("recursos", "Recursos", []), field("tecnicas", "Técnicas", ["s1", "s2", "s3"])],
  lock_reason: null,
  ...extra,
})
const subjects = [
  { id: "s1", name: "Algoritmos", code: "SW-1" },
  { id: "s2", name: "Álgebra", code: "SW-2" },
  { id: "s3", name: "Cálculo", code: "SW-3" },
]

const applied = vi.fn()
const openChange = vi.fn()
const text = (): string => document.body.textContent ?? ""
const press = async (element: Element | undefined | null) => {
  fireEvent.click(element!)
  await flush()
}
const chooseField = (id: string) => press(document.body.querySelector(`[data-value="${id}"]`))
const submit = () => press([...document.body.querySelectorAll<HTMLButtonElement>('button[type="submit"]')][0])
const submitLabel = () => document.body.querySelector('button[type="submit"]')?.textContent?.trim()

async function openDialog(response: BulkFields = catalog()) {
  vi.mocked(getBulkFields).mockResolvedValue(response)
  renderWithProviders(<BulkFieldDialog open onOpenChange={openChange} subjects={subjects} onApplied={applied} />)
  await flush()
}

describe("BulkFieldDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fillBulkField).mockResolvedValue({ message: "Campo llenado.", applied: 3 })
  })

  it("dice cuántas materias se marcaron y pide el campo antes de aplicar, sin desactivar el botón", async () => {
    await openDialog()

    expect(text()).toContain("Llenar un campo")
    expect(text()).toContain("Se escribe una sola vez para las 3 materias seleccionadas")
    expect(document.body.querySelector("[data-editor]")).toBeNull()
    expect(document.body.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
    await submit()

    expect(text()).toContain("Elija qué campo va a llenar")
    expect(fillBulkField).not.toHaveBeenCalled()
  })

  it("no repite el nombre de una sección que tiene un solo campo con ese mismo nombre", async () => {
    await openDialog(catalog({ fields: [{ ...field("recursos", "Recursos", []), section: "Recursos" }, { ...field("metodos", "Métodos", []), section: "Metodología" }, { ...field("tecnicas", "Técnicas", []), section: "Metodología" }] }))

    expect([...document.body.querySelectorAll("[data-select] p")].map((item) => item.textContent)).toEqual(["Metodología"])
  })

  it("la ventana y la lista de campos no se salen de su ancho", async () => {
    await openDialog()
    const footer = document.body.querySelector('[data-slot="dialog-footer"]')!

    expect(footer.className).toContain("mx-0")
    expect(footer.className).not.toContain("-mx-6")
  })

  it("al elegir el campo solo abre el editor, sin avisos ni casillas, y cuenta todas las materias", async () => {
    await openDialog()
    expect(document.body.querySelector('[data-value="metodos"]')!.textContent).toContain("falta en 2")
    expect(document.body.querySelector('[data-value="tecnicas"]')!.textContent).toContain("todas ya lo tienen")
    await chooseField("metodos")

    expect(document.body.querySelector("[data-editor]")!.getAttribute("data-document")).toBe(JSON.stringify(documents.blank))
    expect(text()).not.toContain("sin definir")
    expect(text()).not.toContain("Reemplazar")
    expect(document.body.querySelector('[role="checkbox"]')).toBeNull()
    expect(submitLabel()).toBe("Llenar 3 materias")
  })

  it("no aplica un campo sin decidir", async () => {
    await openDialog()
    await chooseField("metodos")
    await submit()
    expect(text()).toContain(BULK_UNDECIDED.slice(0, -1))
    expect(text()).not.toContain(BULK_UNDECIDED)

    await press(buttonWithText("editor: elección sin opciones"))
    await submit()
    expect(text()).toContain(BULK_NO_OPTIONS.slice(0, -1))
    expect(fillBulkField).not.toHaveBeenCalled()
  })

  it("llena todas las materias seleccionadas, aunque ya tuvieran contenido", async () => {
    await openDialog()
    await chooseField("tecnicas")
    await press(buttonWithText("editor: escribir"))
    await submit()

    expect(fillBulkField).toHaveBeenCalledWith({ field_id: "tecnicas", value: documents.written, subjects: ["s1", "s2", "s3"] })
    expect(applied.mock.calls).toEqual([["Campo llenado en 3 materias"]])
    expect(openChange).toHaveBeenCalledWith(false)
  })

  it("al cambiar de campo empieza de nuevo, sin lo escrito", async () => {
    await openDialog()
    await chooseField("metodos")
    await press(buttonWithText("editor: escribir"))
    await chooseField("recursos")

    expect(document.body.querySelector("[data-editor]")!.getAttribute("data-document")).toBe(JSON.stringify(documents.blank))
  })

  it("en solo lectura explica el motivo y no ofrece llenar", async () => {
    await openDialog(catalog({ lock_reason: "El proyecto de carrera no se puede editar." }))

    expect(text()).toContain("El proyecto de carrera no se puede editar.")
    expect(document.body.querySelector('[data-value="metodos"]')).toBeNull()
    expect(document.body.querySelector('button[type="submit"]')).toBeNull()
  })

  it("muestra el error del servidor y deja la ventana abierta con lo escrito", async () => {
    vi.mocked(fillBulkField).mockRejectedValue(new ApiError("Datos inválidos", 422, { value: ["Elija solo entre las opciones de la respuesta."] }))
    await openDialog()
    await chooseField("metodos")
    await press(buttonWithText("editor: escribir"))
    await submit()

    expect(text()).toContain("Elija solo entre las opciones de la respuesta")
    expect(document.body.querySelector("[data-editor]")!.getAttribute("data-document")).toBe(JSON.stringify(documents.written))
    expect(applied).not.toHaveBeenCalled()
    expect(openChange).not.toHaveBeenCalled()
  })
})
