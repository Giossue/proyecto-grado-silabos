import { fireEvent, screen } from "@testing-library/react"
import { useState, type ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateAcademicRecord } from "@/api/academic"
import { ApiError } from "@/api/client"
import { getCatalogLibraries } from "@/api/libraryCatalog"
import { CatalogEditDialog } from "@/components/domain/academic/CatalogEditDialog"
import { buttonNamed, buttonWithText } from "@/components/domain/academic/academicTestUtils"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/academic", () => ({ updateAcademicRecord: vi.fn() }))
vi.mock("@/api/libraryCatalog", () => ({ getCatalogLibraries: vi.fn() }))

type DialogProps = ComponentProps<typeof CatalogEditDialog>

beforeEach(() => {
  vi.mocked(getCatalogLibraries).mockReset().mockResolvedValue([
    { id: "BFCCA", name: "LAGUACOTO" },
    { id: "BGEN", name: "MATRIZ" },
    { id: "BHTM", name: "SAN MIGUEL" },
  ])
  vi.mocked(updateAcademicRecord).mockReset().mockResolvedValue({ message: "Facultad actualizada." })
})

const base: DialogProps = {
  entity: "facultad",
  recordId: "faculty-1",
  recordName: "Facultad de Ciencias",
  faculties: [],
  modalityOptions: [],
  logoUrl: "https://api.example.test/logos/faculty-1.png",
  showTrigger: false,
}

function Harness(props: Partial<DialogProps>) {
  const [open, setOpen] = useState(true)

  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>
        Cerrar desde fuera
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir desde fuera
      </button>
      <CatalogEditDialog {...base} {...props} open={open} onOpenChange={setOpen} />
    </>
  )
}

const mountDialog = async (extra: Partial<DialogProps> = {}) => {
  const view = renderWithProviders(<Harness {...extra} />)
  await flush()

  return view
}
const editingDialog = async (extra: Partial<DialogProps> = {}) => {
  const view = await mountDialog(extra)
  fireEvent.click(buttonWithText("Editar")!)
  await flush()

  return view
}
const rename = async (value: string): Promise<void> => {
  fireEvent.change(document.querySelector<HTMLInputElement>('input[id^="edit-name-"]')!, { target: { value } })
  await flush()
}

describe("CatalogEditDialog · logo de la facultad", () => {
  it("las acciones del pie solo aparecen al editar", async () => {
    const { PowerOff } = await import("lucide-react")
    await mountDialog({ actions: [{ key: "status", label: "Desactivar facultad", icon: PowerOff }] })
    const action = () => document.body.querySelector('[aria-label="Desactivar facultad"]')
    expect(action()).toBeNull()

    fireEvent.click(buttonWithText("Editar")!)
    await flush()
    expect(action()).not.toBeNull()
  })

  it("abre primero los datos en solo lectura, con Editar; al editar permite cambiar y Cancelar vuelve a los datos", async () => {
    await mountDialog()
    const name = () => document.body.querySelector<HTMLInputElement>('input[id^="edit-name-"]')!

    expect(name().disabled).toBe(true)
    expect(buttonWithText("Guardar cambios")).toBeUndefined()

    fireEvent.click(buttonWithText("Editar")!)
    await flush()
    expect(name().disabled).toBe(false)
    expect(buttonWithText("Guardar cambios")).toBeDefined()

    fireEvent.click(buttonWithText("Cancelar")!)
    await flush()
    expect(name().disabled).toBe(true)
    expect(buttonWithText("Editar")).toBeDefined()
  })

  it("con logo muestra «Reemplazar» dentro de la imagen; al reemplazar aparece la zona y se puede volver al logo actual", async () => {
    await editingDialog()

    const replace = buttonNamed("Reemplazar")!
    expect(replace.closest('[data-logo-current]')).not.toBeNull()
    expect(buttonNamed("Quitar logo")).toBeUndefined()
    expect(document.body.textContent).not.toContain("Arrastre su imagen aquí")

    fireEvent.click(replace)
    await flush()
    expect(document.body.querySelector('img[alt="Logo actual de la facultad"]')).toBeNull()
    expect(document.body.textContent).toContain("Arrastre su imagen aquí")

    fireEvent.click(buttonNamed("Mantener el logo actual")!)
    await flush()
    expect(document.body.querySelector('img[alt="Logo actual de la facultad"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain("Arrastre su imagen aquí")
  })

  it("en solo lectura no ofrece reemplazar el logo", async () => {
    await mountDialog()

    expect(document.body.querySelector('img[alt="Logo actual de la facultad"]')).not.toBeNull()
    expect(buttonNamed("Reemplazar")).toBeUndefined()
  })

  it("en la ficha, el logo actual se abre en grande", async () => {
    await mountDialog()

    fireEvent.click(buttonNamed("Ver el logo en grande")!)
    await flush()
    const preview = screen.getByRole("dialog", { name: "Logo de Facultad de Ciencias" })
    expect(preview.querySelector<HTMLImageElement>('img[alt="Logo de Facultad de Ciencias"]')?.src).toBe("https://api.example.test/logos/faculty-1.png")
    expect(preview.textContent).toContain("Así se verá en los sílabos")
  })

  it("quitar el logo sin subir otro no deja guardar, y cancelar vuelve a mostrar el logo", async () => {
    await editingDialog()
    fireEvent.click(buttonNamed("Reemplazar")!)
    await flush()

    expect(document.body.querySelector<HTMLInputElement>("#edit-faculty-logo-faculty-1")?.required).toBe(true)
    fireEvent.submit(document.body.querySelector("form")!)
    await flush()
    expect(updateAcademicRecord).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Cargue el logo nuevo de la facultad")

    fireEvent.click(screen.getByText("Cerrar desde fuera"))
    await flush()
    fireEvent.click(screen.getByText("Abrir desde fuera"))
    await flush()
    expect(document.body.querySelector('img[alt="Logo actual de la facultad"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain("Arrastre su imagen aquí")
  })
})

describe("CatalogEditDialog · periodo académico activo", () => {
  it("con el periodo académico activo deja los campos y el botón deshabilitados, sin aviso dentro del diálogo", async () => {
    await editingDialog({ lockReason: "Periodo académico activo" })

    expect(document.body.textContent).not.toContain("Hay un periodo académico activo")
    expect([...document.body.querySelectorAll<HTMLInputElement>('input[id^="edit-"]')].every((input) => input.disabled)).toBe(true)
    expect(buttonWithText("Editar")!.disabled).toBe(true)
  })
})

describe("CatalogEditDialog · cambios que devuelven sílabos enviados", () => {
  it("si el cambio devuelve sílabos a borrador, reenvía directo con confirm_purge, sin diálogo", async () => {
    vi.mocked(updateAcademicRecord)
      .mockRejectedValueOnce(new ApiError("Confirme", 422, { purge_required: ["Este cambio devolverá 1 sílabo enviado o aprobado a borrador"], purge_count: ["1"] }))
      .mockResolvedValueOnce({ message: "Facultad actualizada." })
    await editingDialog()
    await rename("Facultad con otro nombre")
    fireEvent.click(buttonWithText("Guardar cambios")!)
    await flush()
    await flush()

    expect(updateAcademicRecord).toHaveBeenCalledTimes(2)
    const resent = vi.mocked(updateAcademicRecord).mock.calls[1]!
    expect(resent[0]).toBe("facultad")
    expect(resent[1]).toBe("faculty-1")
    expect((resent[2] as FormData).get("confirm_purge")).toBe("1")
    expect((resent[2] as FormData).get("nombre")).toBe("Facultad con otro nombre")
    expect((vi.mocked(updateAcademicRecord).mock.calls[0]![2] as FormData).get("confirm_purge")).toBeNull()
  })

  it("la facultad no tiene campo de campus y no lo envía al guardar", async () => {
    await editingDialog()
    expect(document.body.querySelector('[id^="edit-campus-"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/campus/i)

    await rename("Facultad renovada")
    fireEvent.click(buttonWithText("Guardar cambios")!)
    await flush()

    const sent = vi.mocked(updateAcademicRecord).mock.calls[0]![2] as FormData
    expect(sent.get("nombre")).toBe("Facultad renovada")
    expect(sent.has("campus")).toBe(false)
  })
})

describe("CatalogEditDialog · bibliotecas de Koha de la facultad", () => {
  const sentLibraries = (): string | null => (vi.mocked(updateAcademicRecord).mock.calls[0]![2] as FormData).get("catalog_libraries") as string | null
  const row = (name: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('[data-slot="field"]')].find((item) => item.textContent?.trim() === name)!
  const isChecked = (name: string): boolean => row(name).querySelector('[role="checkbox"]')!.getAttribute("aria-checked") === "true"
  const tick = async (name: string): Promise<void> => {
    fireEvent.click(row(name).querySelector<HTMLElement>('[role="checkbox"]')!)
    await flush()
  }
  const tab = async (label: string): Promise<void> => {
    const trigger = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((item) => item.textContent?.trim() === label)!
    fireEvent.mouseDown(trigger, { button: 0 })
    await flush()
  }
  const save = async (): Promise<void> => {
    fireEvent.click(buttonWithText("Guardar cambios")!)
    await flush()
  }

  it("tiene una pestaña Bibliotecas, aparte de los datos, que solo lista las bibliotecas disponibles con casillas", async () => {
    await editingDialog()

    expect([...document.querySelectorAll('[role="tab"]')].map((item) => item.textContent?.trim())).toEqual(["Datos", "Bibliotecas"])
    expect(document.body.textContent).not.toContain("Bibliotecas disponibles")
    await tab("Bibliotecas")
    expect(document.body.textContent).toContain("Bibliotecas disponibles")
    expect(
      [...document.querySelectorAll('[data-slot="field"]')].map((item) => item.textContent?.trim()).filter((text) => ["LAGUACOTO", "MATRIZ", "SAN MIGUEL"].includes(text ?? "")),
    ).toEqual(["LAGUACOTO", "MATRIZ", "SAN MIGUEL"])
    expect(document.body.textContent).not.toContain("BGEN")
    expect(document.querySelector('[role="radio"]')).toBeNull()
  })

  it("tiene un ícono de ayuda junto al título de las bibliotecas, solo en la pestaña de bibliotecas", async () => {
    await editingDialog()

    expect(document.querySelector('[aria-label="Qué significa esto"]')).toBeNull()
    await tab("Bibliotecas")
    expect(document.querySelector('legend [aria-label="Qué significa esto"]')).not.toBeNull()
  })

  it("sin bibliotecas guardadas muestra todas marcadas, y sin tocarlas no se puede guardar", async () => {
    await editingDialog()
    await tab("Bibliotecas")

    expect(["LAGUACOTO", "MATRIZ", "SAN MIGUEL"].map(isChecked)).toEqual([true, true, true])
    expect(buttonWithText("Guardar cambios")!.disabled).toBe(true)
    expect(updateAcademicRecord).not.toHaveBeenCalled()
  })

  it("si Koha no responde o no publica bibliotecas, sin cambios tampoco se puede guardar, y cambiar un dato sí", async () => {
    for (const koha of [() => vi.mocked(getCatalogLibraries).mockRejectedValueOnce(new Error("Koha caído")), () => vi.mocked(getCatalogLibraries).mockResolvedValueOnce([])]) {
      koha()
      const view = await editingDialog()

      expect(buttonWithText("Guardar cambios")!.disabled).toBe(true)
      await rename("Facultad renombrada")
      expect(buttonWithText("Guardar cambios")!.disabled).toBe(false)
      view.unmount()
    }
  })

  it("desmarcar bibliotecas guarda los códigos de las que quedan", async () => {
    await editingDialog()
    await tab("Bibliotecas")
    await tick("LAGUACOTO")
    await save()

    expect(sentLibraries()).toBe('["BGEN","BHTM"]')
  })

  it("con bibliotecas guardadas abre con solo esas marcadas, y marcar todas se guarda vacío para que entren las nuevas", async () => {
    await editingDialog({ catalogLibraries: ["BGEN"] })
    await tab("Bibliotecas")

    expect(["LAGUACOTO", "MATRIZ", "SAN MIGUEL"].map(isChecked)).toEqual([false, true, false])
    await tick("LAGUACOTO")
    await tick("SAN MIGUEL")
    await save()

    expect(sentLibraries()).toBe("[]")
  })

  it("si la facultad ya tenía guardadas todas, se ven todas marcadas, sin cambios no se guarda y al guardar otro dato queda vacío", async () => {
    await editingDialog({ catalogLibraries: ["BFCCA", "BGEN", "BHTM"] })
    await tab("Bibliotecas")

    expect(["LAGUACOTO", "MATRIZ", "SAN MIGUEL"].map(isChecked)).toEqual([true, true, true])
    expect(buttonWithText("Guardar cambios")!.disabled).toBe(true)
    await tick("MATRIZ")
    await tick("MATRIZ")
    expect(buttonWithText("Guardar cambios")!.disabled).toBe(true)
    await tab("Datos")
    await rename("Facultad renombrada")
    await save()
    expect(sentLibraries()).toBe("[]")
  })

  it("sin ninguna marcada «Guardar cambios» queda deshabilitado", async () => {
    await editingDialog()
    await tab("Bibliotecas")
    await tick("LAGUACOTO")
    await tick("MATRIZ")
    await tick("SAN MIGUEL")

    expect(buttonWithText("Guardar cambios")!.disabled).toBe(true)
    expect(updateAcademicRecord).not.toHaveBeenCalled()
  })

  it("una biblioteca guardada que Koha ya no publica se muestra para poder quitarla", async () => {
    await editingDialog({ catalogLibraries: ["BVIEJA", "BGEN"] })
    await tab("Bibliotecas")

    expect(isChecked("BVIEJA (ya no está en Koha)")).toBe(true)
  })

  it("las carreras y los períodos no tienen pestañas ni consultan Koha", async () => {
    await editingDialog({
      entity: "carrera",
      recordName: "Software",
      facultyId: "f1",
      faculties: [{ id: "f1", nombre: "Facultad", activo: true }],
      modalityOptions: [{ value: "presencial", label: "Presencial" }],
    })

    expect(document.querySelector('[role="tab"]')).toBeNull()
    expect(getCatalogLibraries).not.toHaveBeenCalled()
  })
})
