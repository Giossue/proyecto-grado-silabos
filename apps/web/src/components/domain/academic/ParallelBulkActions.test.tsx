import { act, fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ParallelBulkActions } from "@/components/domain/academic/ParallelBulkActions"
import { buttonWithText } from "@/components/domain/academic/academicTestUtils"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { flush, renderWithProviders } from "@/test/render"

const TEACHER_ID = "01a1c5ba-2222-7000-8000-999999999999"

const api = vi.hoisted(() => ({
  createParallels: vi.fn(),
  updateParallel: vi.fn(),
  deleteCareerRecord: vi.fn(),
  createCareerRecord: vi.fn(),
  replaceParallelTeacher: vi.fn(),
}))
vi.mock("@/api/career-academics", () => api)
const purge = vi.hoisted(() => ({ announcePurge: vi.fn() }))
vi.mock("@/lib/purgeNotice", () => purge)
const deadline = vi.hoisted(() => ({ state: null as string | null }))
vi.mock("@/state/deadline", () => ({
  deadlineState: {
    deadline: {
      get value() {
        return deadline.state ? { state: deadline.state } : null
      },
    },
  },
}))

afterEach(() => {
  deadline.state = null
  vi.useRealTimers()
  vi.clearAllMocks()
})

type BarProps = ComponentProps<typeof ParallelBulkActions>
type Row = BarProps["items"][number]
type Parallel = Row["parallels"][number]

const item = (id: string, parallels: Parallel[]): Row => ({
  subject_id: id,
  label: id,
  subject_code: id,
  subject_name: id,
  subject_cycle: 1,
  generates_syllabus: true,
  modality_name: null,
  parallels,
  editable: true,
})
const changed = vi.fn()
const failed = vi.fn()
const clear = vi.fn()
const base: BarProps = {
  parallelIds: ["p1"],
  items: [item("s1", [{ id: "p1", code: "A", shift: "matutina" }]), item("s2", [])],
  shiftOptions: [
    { value: "matutina", label: "Matutina" },
    { value: "vespertina", label: "Vespertina" },
  ],
  teacherUsers: [{ id: TEACHER_ID, name: "Docente Uno", email: "a@b.c" }],
  assignments: [{ id: "as1", user_id: "t9", parallel_id: "p1", user_name: "Otro", user_email: "o@b.c", parallel_code: "A", subject_name: "s1", active: true, editable: true }],
  onChanged: changed,
  onFailed: failed,
  onClear: clear,
}
const mountBar = (extra: Partial<BarProps> = {}) => renderWithProviders(<ParallelBulkActions {...base} {...extra} />)

const openMenu = async (actor: ReturnType<typeof userEvent.setup>) => {
  await actor.click(screen.getByRole("button", { name: /Acciones masivas/ }))
}
const chooseFromSubmenu = async (actor: ReturnType<typeof userEvent.setup>, submenu: string, option: string) => {
  await openMenu(actor)
  await actor.click(await screen.findByRole("menuitem", { name: submenu }))
  fireEvent.click(await screen.findByRole("menuitem", { name: option }))
  await flush()
}
const openAdd = async (actor: ReturnType<typeof userEvent.setup>) => {
  await openMenu(actor)
  await actor.click(await screen.findByRole("menuitem", { name: "Agregar un paralelo" }))
  await flush()
}


describe("ParallelBulkActions", () => {
  it("muestra cuántas materias hay seleccionadas", () => {
    mountBar()
    expect(document.body.textContent).toContain("2 materias y 1 paralelo seleccionado")
  })

  it("agrega el siguiente paralelo libre a cada materia con jornada y docente juntos", async () => {
    api.createParallels.mockResolvedValue({ message: "ok" })
    const actor = userEvent.setup()
    mountBar()
    await openAdd(actor)
    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Docente de los nuevos paralelos"]')!)
    await flush()
    fireEvent.click(document.body.querySelector<HTMLElement>('[data-slot="command-item"]')!)
    await flush()
    vi.useFakeTimers()
    fireEvent.click(buttonWithText("Agregar paralelos")!)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(api.createParallels).toHaveBeenCalledWith({ subject_id: "s1", codes: ["B"], shift: "matutina", user_id: TEACHER_ID }, "unconfirmed")
    expect(api.createParallels).toHaveBeenCalledWith({ subject_id: "s2", codes: ["A"], shift: "matutina", user_id: TEACHER_ID }, "unconfirmed")
    expect(changed.mock.calls[0]).toEqual(["Paralelo agregado a 2 materias"])
    expect(clear).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it("«Agregar paralelos» queda deshabilitado mientras falte la jornada o el docente", async () => {
    const actor = userEvent.setup()
    mountBar()
    await openAdd(actor)
    const add = buttonWithText("Agregar paralelos")!
    fireEvent.click(add)
    await flush()

    expect(add.disabled).toBe(true)
    expect(api.createParallels).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it("reemplaza el docente solo donde cambia y avisa los fallos parciales", async () => {
    api.replaceParallelTeacher.mockRejectedValue(new Error("x"))
    const actor = userEvent.setup()
    mountBar()
    await chooseFromSubmenu(actor, "Asignar docente", "Docente Uno")

    expect(api.replaceParallelTeacher).toHaveBeenCalledWith("p1", TEACHER_ID, "unconfirmed")
    expect(api.deleteCareerRecord).not.toHaveBeenCalled()
    expect(failed.mock.calls[0]?.[0]).toContain("0 de 1 cambios aplicados")
    expect(changed.mock.calls[0]).toEqual(["Se aplicaron los cambios posibles"])
  })

  it("cambio masivo de jornada: aplica directo, confirma solo los sílabos enviados y avisa una vez", async () => {
    const actor = userEvent.setup()
    mountBar({
      parallelIds: ["p1", "p2", "p3"],
      items: [
        item("s1", [
          { id: "p1", code: "A", shift: "vespertina", sent_syllabus: true },
          { id: "p2", code: "B", shift: "vespertina" },
        ]),
        item("s2", [{ id: "p3", code: "A", shift: "vespertina" }]),
      ],
      shiftOptions: [{ value: "matutina", label: "Matutina" }],
      teacherUsers: [],
      assignments: [],
    })

    api.updateParallel.mockResolvedValue({ message: "ok" })
    await chooseFromSubmenu(actor, "Asignar jornada", "Matutina")
    expect(purge.announcePurge).toHaveBeenCalledTimes(1)
    expect(purge.announcePurge.mock.calls[0]![0]).toContain("El sílabo de 1 paralelo seleccionado ya está en revisión o aprobado")
    expect(purge.announcePurge.mock.calls[0]![0]).not.toContain("Si cancela")
    expect(api.updateParallel.mock.calls).toEqual([
      ["p1", { code: "A", shift: "matutina" }, "confirmed"],
      ["p2", { code: "B", shift: "matutina" }, "unconfirmed"],
      ["p3", { code: "A", shift: "matutina" }, "unconfirmed"],
    ])
    expect(changed.mock.calls.at(-1)).toEqual(["Jornada actualizada en los paralelos seleccionados"])
  })

  it("con el periodo académico finalizado, asignar docente aplica directo con confirmación y avisa una vez", async () => {
    deadline.state = "closed"
    const actor = userEvent.setup()
    mountBar()

    api.replaceParallelTeacher.mockResolvedValue({ message: "ok" })
    await chooseFromSubmenu(actor, "Asignar docente", "Docente Uno")
    expect(api.replaceParallelTeacher).toHaveBeenCalledWith("p1", TEACHER_ID, "confirmed")
    expect(purge.announcePurge).toHaveBeenCalledTimes(1)
    expect(purge.announcePurge.mock.calls[0]![0]).toContain("El periodo académico de su carrera ya finalizó")
  })

  it("asignar otro docente donde el sílabo ya tiene trabajo aplica directo y avisa una vez", async () => {
    const actor = userEvent.setup()
    mountBar({
      parallelIds: ["p1", "p2"],
      items: [
        item("s1", [
          { id: "p1", code: "A", shift: "matutina", started_syllabus: true },
          { id: "p2", code: "B", shift: "matutina" },
        ]),
      ],
      shiftOptions: [],
      teacherUsers: [{ id: TEACHER_ID, name: "Docente Uno", email: "a@b.c" }],
      assignments: [],
    })

    api.createCareerRecord.mockResolvedValue({ message: "ok" })
    await chooseFromSubmenu(actor, "Asignar docente", "Docente Uno")
    expect(purge.announcePurge).toHaveBeenCalledTimes(1)
    expect(purge.announcePurge.mock.calls[0]![0]).toContain("el nuevo docente lo empieza de cero")
    expect(api.createCareerRecord.mock.calls).toEqual([
      ["asignacion_docente", { user_id: TEACHER_ID, parallel_id: "p1" }, "confirmed"],
      ["asignacion_docente", { user_id: TEACHER_ID, parallel_id: "p2" }, "unconfirmed"],
    ])
  })

  it("Quitar selección avisa a la tabla", () => {
    mountBar()
    fireEvent.click(buttonWithText("Quitar selección")!)
    expect(clear).toHaveBeenCalledTimes(1)
  })
})
