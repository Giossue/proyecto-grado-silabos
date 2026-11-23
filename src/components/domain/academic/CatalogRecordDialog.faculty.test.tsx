import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState, type ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAcademicRecord } from "@/api/academic"
import { getCatalogLibraries } from "@/api/libraryCatalog"
import { CatalogRecordDialog } from "@/components/domain/academic/CatalogRecordDialog"
import { buttonWithText } from "@/components/domain/academic/academicTestUtils"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/academic", () => ({ createAcademicRecord: vi.fn() }))
vi.mock("@/api/libraryCatalog", () => ({ getCatalogLibraries: vi.fn() }))
vi.mock("@/lib/logoPrepare", () => ({
  loadLogo: vi.fn().mockResolvedValue({ image: {}, transparent: true }),
  prepareLogo: vi.fn().mockResolvedValue(new File(["png"], "logo.png", { type: "image/png" })),
}))

const campus = "Campus Matriz Dr. Gabriel Galarza López"
const options = { faculties: [], campusOptions: [{ value: campus, label: campus }], modalityOptions: [] } as unknown as ComponentProps<typeof CatalogRecordDialog>["options"]
const body = (): HTMLElement => document.body
const row = (name: string): HTMLElement => [...body().querySelectorAll<HTMLElement>('[data-slot="field"]')].find((item) => item.textContent?.trim() === name)!
const isChecked = (name: string): boolean => row(name).querySelector('[role="checkbox"]')!.getAttribute("aria-checked") === "true"
const sent = (): FormData => vi.mocked(createAcademicRecord).mock.calls[0]![1] as FormData
const saved = vi.fn()

function Harness({ entity }: { entity: "facultad" | "carrera" }) {
  const [open, setOpen] = useState(true)

  return <CatalogRecordDialog entity={entity} options={options} showTrigger={false} open={open} onOpenChange={setOpen} onSaved={saved} />
}

const mountDialog = async (entity: "facultad" | "carrera" = "facultad") => {
  renderWithProviders(<Harness entity={entity} />)
  await flush()
}
const fillData = async (withLogo = true): Promise<void> => {
  const actor = userEvent.setup()
  fireEvent.change(body().querySelector("#catalog-name")!, { target: { value: "Facultad de Salud" } })
  await actor.click(screen.getByRole("combobox", { name: /Campus/ }))
  await actor.click(await screen.findByRole("option", { name: campus }))
  if (withLogo) {
    fireEvent.change(body().querySelector<HTMLInputElement>("#faculty-logo")!, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } })
  }
  await flush()
}
const firstStep = async (): Promise<void> => {
  await mountDialog()
  await fillData()
}
const next = async (): Promise<void> => {
  fireEvent.submit(body().querySelector("form")!)
  await flush()
}

describe("Nueva facultad · paso de bibliotecas", () => {
  beforeEach(() => {
    vi.mocked(getCatalogLibraries).mockReset().mockResolvedValue([
      { id: "BFCCA", name: "LAGUACOTO" },
      { id: "BGEN", name: "MATRIZ" },
      { id: "BHTM", name: "SAN MIGUEL" },
    ])
    vi.mocked(createAcademicRecord).mockReset().mockResolvedValue({ message: "Facultad creada." })
    saved.mockReset()
    URL.createObjectURL = vi.fn(() => "blob:logo")
    URL.revokeObjectURL = vi.fn()
  })

  it("el primer paso pide los datos y ofrece Siguiente; las bibliotecas van en el segundo", async () => {
    await firstStep()

    expect(body().querySelector("#catalog-name")).not.toBeNull()
    expect(buttonWithText("Siguiente")).toBeDefined()
    expect(buttonWithText("Siguiente")!.disabled).toBe(false)
    expect(buttonWithText("Crear facultad")).toBeUndefined()
    expect(body().textContent).not.toContain("Bibliotecas disponibles")

    await next()
    expect(body().textContent).toContain("Bibliotecas disponibles")
    expect(body().querySelector("#catalog-name")).toBeNull()
    expect(buttonWithText("Atrás")).toBeDefined()
    expect(buttonWithText("Crear facultad")).toBeDefined()
    expect(buttonWithText("Siguiente")).toBeUndefined()
    expect(["LAGUACOTO", "MATRIZ", "SAN MIGUEL"].map(isChecked)).toEqual([true, true, true])
    expect(createAcademicRecord).not.toHaveBeenCalled()
  })

  it("sin los datos obligatorios no pasa al segundo paso", async () => {
    await mountDialog()
    expect(buttonWithText("Siguiente")!.disabled).toBe(true)
    await next()

    expect(body().querySelector("#catalog-name")).not.toBeNull()
    expect(body().textContent).not.toContain("Bibliotecas disponibles")
    expect(createAcademicRecord).not.toHaveBeenCalled()
  })

  it("Atrás vuelve a los datos sin perder lo escrito", async () => {
    await firstStep()
    await next()

    fireEvent.click(buttonWithText("Atrás")!)
    await flush()

    expect(body().querySelector<HTMLInputElement>("#catalog-name")!.value).toBe("Facultad de Salud")
  })

  it("con todas las bibliotecas marcadas crea la facultad sin lista, o sea «todas»", async () => {
    await firstStep()
    await next()
    fireEvent.click(buttonWithText("Crear facultad")!)
    await flush()

    expect(sent().get("catalog_libraries")).toBeNull()
    expect(sent().get("nombre")).toBe("Facultad de Salud")
    expect(sent().get("campus")).toBe(campus)
    expect(sent().get("logo")).toBeInstanceOf(File)
    expect(saved.mock.calls).toEqual([["Facultad creada."]])
  })

  it("desmarcar bibliotecas crea la facultad solo con las que quedan", async () => {
    await firstStep()
    await next()
    fireEvent.click(row("LAGUACOTO").querySelector<HTMLElement>('[role="checkbox"]')!)
    await flush()
    fireEvent.click(buttonWithText("Crear facultad")!)
    await flush()

    expect(sent().get("catalog_libraries")).toBe('["BGEN","BHTM"]')
  })

  it("sin ninguna marcada no deja crear", async () => {
    await firstStep()
    await next()
    for (const name of ["LAGUACOTO", "MATRIZ", "SAN MIGUEL"]) {
      fireEvent.click(row(name).querySelector<HTMLElement>('[role="checkbox"]')!)
      await flush()
    }

    expect(buttonWithText("Crear facultad")!.disabled).toBe(true)
    expect(createAcademicRecord).not.toHaveBeenCalled()
  })

  it("las carreras se crean en un solo paso", async () => {
    await mountDialog("carrera")

    expect(buttonWithText("Siguiente")).toBeUndefined()
    expect(buttonWithText("Crear carrera")).toBeDefined()
    expect(getCatalogLibraries).not.toHaveBeenCalled()
  })

  it("el logo es obligatorio: sin logo no pasa a las bibliotecas ni crea la facultad", async () => {
    await mountDialog()
    await fillData(false)

    expect(body().querySelector<HTMLInputElement>("#faculty-logo")?.required).toBe(true)
    await next()

    expect(buttonWithText("Siguiente")).toBeDefined()
    expect(buttonWithText("Crear facultad")).toBeUndefined()
    expect(body().textContent).toContain("Cargue el logo de la facultad")
    expect(createAcademicRecord).not.toHaveBeenCalled()
  })
})
