import { act, fireEvent } from "@testing-library/react"
import { useState, type ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setAcademicRecordStatus } from "@/api/academic"
import { CatalogActions } from "@/components/domain/academic/CatalogActions"
import { buttonWithText } from "@/components/domain/academic/academicTestUtils"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/academic", () => ({
  deleteAcademicRecord: vi.fn().mockResolvedValue({ message: "Eliminado." }),
  setAcademicRecordStatus: vi.fn().mockResolvedValue({ message: "Registro desactivado sin borrar su historial." }),
  updateAcademicRecord: vi.fn(),
}))
vi.mock("@/api/libraryCatalog", () => ({ getCatalogLibraries: vi.fn().mockResolvedValue([]) }))
const process = vi.hoisted(() => ({ props: null as null | { onSaved?: (message: string) => void } }))
vi.mock("@/components/domain/syllabus/SyllabusProcessDialog", () => ({
  SyllabusProcessDialog: (props: { onSaved?: (message: string) => void }) => {
    process.props = props
    return null
  },
}))

type ActionsProps = ComponentProps<typeof CatalogActions>

const changed = vi.fn()
const base: Omit<ActionsProps, "editOpen" | "onEditOpenChange"> = {
  entity: "facultad",
  recordId: "r1",
  recordName: "Software",
  modalityOptions: [],
  campusOptions: [],
  faculties: [],
  active: true,
  onChanged: changed,
}

function Harness(props: Partial<ActionsProps>) {
  const [open, setOpen] = useState(true)

  return <CatalogActions {...base} {...props} editOpen={open} onEditOpenChange={setOpen} />
}

const open = async (props: Partial<ActionsProps>) => {
  const view = renderWithProviders(<Harness {...props} />)
  await flush()
  const edit = buttonWithText("Editar")
  if (edit && !edit.disabled) fireEvent.click(edit)
  await flush()

  return view
}

beforeEach(() => {
  changed.mockReset()
  vi.mocked(setAcademicRecordStatus).mockClear()
})
afterEach(() => vi.useRealTimers())

describe("CatalogActions", () => {
  it("una facultad no se elimina: se desactiva con confirmación, desde la hoja de edición", async () => {
    await open({ entity: "facultad", recordName: "Ingeniería" })

    expect(document.body.querySelector('button[aria-label="Eliminar"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label^="Acciones para"]')).toBeNull()
    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Desactivar facultad"]')!)
    await flush()
    vi.useFakeTimers()
    fireEvent.click(buttonWithText("Desactivar")!)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(setAcademicRecordStatus).toHaveBeenCalledWith("facultad", "r1", false)
    expect(changed).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(changed.mock.calls[0]).toEqual(["Registro desactivado sin borrar su historial."])
  })

  it("una facultad con carreras activas tiene Desactivar deshabilitado y dice por qué", async () => {
    await open({ entity: "facultad", recordName: "Ingeniería", active: true, deactivateBlockedReason: "No se puede desactivar: tiene 2 carreras activas" })

    expect(document.body.querySelector<HTMLButtonElement>('button[aria-label="Desactivar facultad"]')!.disabled).toBe(true)
    expect(document.body.textContent).toContain("No se puede desactivar: tiene 2 carreras activas")
  })

  it("al desactivar una carrera avisa cuántos usuarios se retirarán", async () => {
    await open({ entity: "carrera", deactivateUsers: { coordinators: 1, teachers: 12 } })

    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Desactivar carrera"]')!)
    await flush()

    expect(document.body.textContent).toContain(
      "«Software» dejará de participar en nuevas convocatorias. Se retirarán 1 coordinador y 12 docentes de esta carrera; quien tenga rol en otra carrera lo conserva. Su historial se conserva y podrá reactivarla después",
    )
  })

  it("una carrera activa muestra desactivar, sin coordinador, eliminar ni menú", async () => {
    await open({ entity: "carrera" })

    expect(document.body.querySelector('button[aria-label="Acciones para Software"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label$="coordinador"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label="Desactivar carrera"]')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label="Eliminar"]')).toBeNull()
  })

  it("con una convocatoria bloqueando no se abre la hoja ni hay acciones", async () => {
    await open({ entity: "facultad", lockReason: "Convocatoria activa" })

    expect(document.body.querySelector('button[aria-label="Desactivar facultad"]')).toBeNull()
  })

  it("avisa que abrió la convocatoria del período cuando el formulario terminó de cerrarse", async () => {
    await open({ entity: "periodo", recordName: "2026-2027" })
    vi.useFakeTimers()
    act(() => process.props!.onSaved!("Convocatoria abierta."))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(changed).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(changed.mock.calls).toEqual([["Convocatoria abierta."]])
  })

  it("un período sigue teniendo Eliminar", async () => {
    await open({ entity: "periodo", recordName: "2026-2027" })

    expect(document.body.querySelector('button[aria-label="Eliminar"]')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label^="Desactivar"]')).toBeNull()
  })

  it("una carrera se desactiva con confirmación y una inactiva ofrece Reactivar", async () => {
    const view = await open({ entity: "carrera" })

    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Desactivar carrera"]')!)
    await flush()
    vi.useFakeTimers()
    fireEvent.click(buttonWithText("Desactivar")!)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    vi.useRealTimers()

    expect(setAcademicRecordStatus).toHaveBeenCalledWith("carrera", "r1", false)
    expect(changed.mock.calls[0]).toEqual(["Registro desactivado sin borrar su historial."])
    view.unmount()

    await open({ entity: "carrera", active: false })
    expect(document.body.querySelector('button[aria-label="Reactivar carrera"]')).not.toBeNull()
  })
})
