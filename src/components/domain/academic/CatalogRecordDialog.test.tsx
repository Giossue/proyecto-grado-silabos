import { act, fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState, type ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAcademicRecord } from "@/api/academic"
import { ApiError } from "@/api/client"
import { CatalogEditDialog } from "@/components/domain/academic/CatalogEditDialog"
import { CatalogRecordDialog } from "@/components/domain/academic/CatalogRecordDialog"
import { buttonWithText, keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/libraryCatalog", () => ({ getCatalogLibraries: vi.fn().mockResolvedValue([]) }))
vi.mock("@/api/academic", async (importOriginal) => ({ ...(await importOriginal<object>()), createAcademicRecord: vi.fn() }))

const pickers = vi.hoisted(() => ({ props: {} as Record<string, { value?: string; minValue?: string; onValueChange?: (value: string) => void }> }))
vi.mock("@/components/DatePicker", () => ({
  DatePicker: (props: { id: string; value?: string; minValue?: string; onValueChange?: (value: string) => void }) => {
    pickers.props[props.id] = props
    return null
  },
}))

type RecordOptions = ComponentProps<typeof CatalogRecordDialog>["options"]

const options = {
  faculties: [{ id: "faculty-1", nombre: "Ciencias" }],
  careers: [],
  periods: [],
  modalityOptions: [{ value: "Presencial", label: "Presencial" }],
  shiftOptions: [],
  campusOptions: [],
  currentCurricula: [],
  activeSubjects: [],
  scheduledSubjects: [],
  parallels: [],
  teacherUsers: [],
} as unknown as RecordOptions

const editBase = {
  faculties: [],
  modalityOptions: [{ value: "Presencial", label: "Presencial" }],
  campusOptions: [],
  showTrigger: false,
  open: true,
}

const localToday = (): string => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function Harness({ entity, onSaved }: { entity: "facultad" | "carrera" | "periodo"; onSaved?: (message: string) => void }) {
  const [open, setOpen] = useState(true)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir de nuevo
      </button>
      <CatalogRecordDialog entity={entity} options={options} showTrigger={false} open={open} onOpenChange={setOpen} onSaved={onSaved} />
    </>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("academic catalog code fields", () => {
  it("omits faculty code and requires career code on creation", async () => {
    const faculty = renderWithProviders(<Harness entity="facultad" />)
    await flush()

    expect(document.body.querySelector("#catalog-code")).toBeNull()
    expect(document.body.textContent).not.toContain("Código de facultad")
    faculty.unmount()

    renderWithProviders(<Harness entity="carrera" />)
    await flush()

    const careerCode = document.body.querySelector<HTMLInputElement>("#catalog-code")
    expect(careerCode?.getAttribute("aria-required")).toBe("true")
    expect(careerCode?.required).toBe(false)
    expect(document.body.textContent).toContain("Código de carrera")
    expect(document.body.textContent).not.toContain("Código de malla curricular")
  })

  it("orders faculty name, campus, and logo fields", async () => {
    renderWithProviders(<Harness entity="facultad" />)
    await flush()

    const nameLabel = document.body.querySelector('label[for="catalog-name"]')
    const campusLabel = document.body.querySelector('label[for="catalog-campus"]')
    const logoLabel = document.body.querySelector('label[for="faculty-logo"]')
    expect(nameLabel).not.toBeNull()
    expect(campusLabel).not.toBeNull()
    expect(logoLabel).not.toBeNull()
    expect(document.body.textContent).toContain("Se ajusta a 600 × 180 px")
    expect(document.body.textContent).toContain("fondo transparente")
    expect(document.body.textContent).not.toContain("fondo sólido")
    expect(document.body.textContent).not.toContain("Opcional para Administración")
    expect(nameLabel!.compareDocumentPosition(campusLabel!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(campusLabel!.compareDocumentPosition(logoLabel!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it("does not ask for a period code or teaching weeks", async () => {
    renderWithProviders(<Harness entity="periodo" />)
    await flush()

    expect(document.body.querySelector("#catalog-code")).toBeNull()
    expect(document.body.querySelector("input#catalog-teaching-weeks")).toBeNull()
    expect(document.body.textContent).not.toContain("Código del período")
    expect(document.body.textContent).not.toContain("Semanas lectivas calculadas")
  })

  it("allows a period that already started and keeps its end after its start", async () => {
    renderWithProviders(<Harness entity="periodo" />)
    await flush()

    expect(pickers.props["catalog-starts-on"]!.minValue).toBeUndefined()
    expect(pickers.props["catalog-ends-on"]!.minValue).toBe(localToday())

    act(() => pickers.props["catalog-ends-on"]!.onValueChange!("2029-12-18"))
    act(() => pickers.props["catalog-starts-on"]!.onValueChange!("2030-01-10"))
    await flush()

    expect(pickers.props["catalog-ends-on"]!.minValue).toBe("2030-01-10")
    expect(pickers.props["catalog-ends-on"]!.value).toBe("")
  })

  it("omits faculty code on edit", async () => {
    renderWithProviders(<CatalogEditDialog entity="facultad" recordId="faculty-1" recordName="Facultad de prueba" {...editBase} />)
    await flush()

    expect(document.body.querySelector("#edit-code-faculty-1")).toBeNull()
    expect(document.body.textContent).not.toContain("Código de facultad")
  })

  it("does not require a faculty logo when none is configured and shows the current one", async () => {
    const withoutLogo = renderWithProviders(
      <CatalogEditDialog entity="facultad" recordId="faculty-without-logo" recordName="Facultad sin logo" logoUrl={null} {...editBase} />,
    )
    await flush()

    expect(document.body.querySelector('img[alt="Logo actual de la facultad"]')).toBeNull()
    expect(document.body.querySelector<HTMLInputElement>("#edit-faculty-logo-faculty-without-logo")?.required).toBe(false)
    withoutLogo.unmount()

    renderWithProviders(
      <CatalogEditDialog entity="facultad" recordId="faculty-with-logo" recordName="Facultad con logo" logoUrl="/logos/facultad/faculty-with-logo?v=1" {...editBase} />,
    )
    await flush()

    expect(document.body.querySelector<HTMLImageElement>('img[alt="Logo actual de la facultad"]')?.src).toContain("/logos/facultad/faculty-with-logo?v=1")
    expect(document.body.querySelector("#edit-faculty-logo-faculty-with-logo")).toBeNull()
  })

  it("does not ask for a period code on edit", async () => {
    renderWithProviders(
      <CatalogEditDialog entity="periodo" recordId="period-1" recordName="Agosto-Diciembre 2026" startsOn="2026-08-17" endsOn="2026-12-18" {...editBase} />,
    )
    await flush()

    expect(document.body.querySelector("#edit-code-period-1")).toBeNull()
    expect(document.body.querySelector("input#edit-teaching-weeks-period-1")).toBeNull()
    expect(document.body.textContent).not.toContain("Semanas lectivas calculadas")
  })
})

describe("salida del formulario de creación", () => {
  it("al crear, el formulario se cierra con lo escrito y se limpia al volver a abrirlo", async () => {
    keepClosingDialogs()
    vi.mocked(createAcademicRecord).mockResolvedValue({ message: "Carrera creada." } as never)
    const onSaved = vi.fn()
    renderWithProviders(<Harness entity="carrera" onSaved={onSaved} />)
    await flush()
    const name = (): HTMLInputElement => document.body.querySelector<HTMLInputElement>("#catalog-name")!
    fireEvent.change(name(), { target: { value: "Software" } })
    await flush()
    fireEvent.submit(name().closest("form")!)
    await flush()

    expect(createAcademicRecord).toHaveBeenCalledWith("carrera", expect.any(FormData))
    expect(onSaved.mock.calls).toEqual([["Carrera creada."]])
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("closed")
    expect(name().value).toBe("Software")

    fireEvent.click(screen.getByText("Abrir de nuevo"))
    await flush()
    expect(name().value).toBe("")
  })
})

describe("botón de crear y errores de campo", () => {
  it("«Crear carrera» sigue deshabilitado mientras falte la facultad o la modalidad", async () => {
    const actor = userEvent.setup()
    renderWithProviders(<Harness entity="carrera" />)
    await flush()
    fireEvent.change(document.body.querySelector("#catalog-name")!, { target: { value: "Software" } })
    fireEvent.change(document.body.querySelector("#catalog-code")!, { target: { value: "SW" } })
    fireEvent.change(document.body.querySelector("#catalog-cycle-count")!, { target: { value: "8" } })
    await flush()
    const create = (): HTMLButtonElement => buttonWithText("Crear carrera")!

    expect(create().disabled).toBe(true)
    await actor.click(screen.getByRole("combobox", { name: /Facultad/ }))
    await actor.click(await screen.findByRole("option", { name: "Ciencias" }))
    await flush()
    expect(create().disabled).toBe(true)
    await actor.click(screen.getByRole("combobox", { name: /Modalidad/ }))
    await actor.click(await screen.findByRole("option", { name: "Presencial" }))
    await flush()
    expect(create().disabled).toBe(false)
  })

  it("el error del servidor de un campo se quita al cambiar ese campo", async () => {
    vi.mocked(createAcademicRecord).mockRejectedValue(new ApiError("Datos no válidos", 422, { code: ["Ya existe una carrera con ese código."], nombre: ["Revise el nombre."] }))
    renderWithProviders(<Harness entity="carrera" />)
    await flush()
    fireEvent.submit(document.body.querySelector("form")!)
    await flush()
    expect(document.body.textContent).toContain("Ya existe una carrera con ese código")

    fireEvent.change(document.body.querySelector<HTMLInputElement>("#catalog-code")!, { target: { value: "SW-2" } })
    await flush()

    expect(document.body.textContent).not.toContain("Ya existe una carrera con ese código")
    expect(document.body.textContent).toContain("Revise el nombre")
  })
})
