import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ScheduledSubjects } from "@/api/career-academics"
import { ScheduledSubjectsTab } from "@/components/domain/academic/ScheduledSubjectsTab"
import { flush, renderWithProviders } from "@/test/render"
import type { Malla } from "@/types/academic"

const api = vi.hoisted(() => ({
  createParallels: vi.fn(),
  updateParallel: vi.fn(),
  createCareerRecord: vi.fn(),
  deleteCareerRecord: vi.fn(),
  replaceParallelTeacher: vi.fn(),
}))
vi.mock("@/api/career-academics", () => api)

vi.mock("@/components/domain/academic/ParallelCreationDialog", () => ({
  ParallelCreationDialog: ({ subjectLabel }: { subjectLabel: string }) => <div className="parallel-sheet">{subjectLabel}</div>,
}))

type Row = ScheduledSubjects["scheduledSubjects"][number]

const row = (id: string, name: string, code: string, cycle: number | null, parallels: Array<{ code: string; shift: string | null }>): Row => ({
  subject_id: `s-${id}`,
  label: name,
  subject_code: code,
  subject_name: name,
  subject_cycle: cycle,
  generates_syllabus: true,
  modality_name: "Presencial",
  malla_name: "Malla SW-9",
  parallels: parallels.map((parallel, index) => ({ id: `${id}-${index}`, ...parallel })),
  editable: true,
})

const data: ScheduledSubjects = {
  career: { id: "c1", name: "Software", lock_reason: null },
  scheduledSubjects: [
    row("1", "Arquitectura de Software", "SW-601", 6, [{ code: "A", shift: "matutina" }]),
    row("2", "Bases de Datos", "SW-301", 3, [{ code: "B", shift: "nocturna" }]),
    row("3", "Cálculo", "MA-101", 1, [{ code: "A", shift: "nocturna" }]),
  ],
  options: {
    shiftOptions: [
      { value: "matutina", label: "Matutina" },
      { value: "nocturna", label: "Nocturna" },
    ],
    activeSubjects: [],
  },
}

const malla = (code: string, state: Malla["state"] = "vigente"): Malla => ({ id: `malla-${code}`, code, cycle_count: 8, state, subject_count: 3 })
const MALLAS = [malla("SW-9"), malla("SW-8"), malla("SW-7", "cerrada")]
const tab = (value: ScheduledSubjects, mallas: Malla[]) => <ScheduledSubjectsTab data={value} mallas={mallas} assignments={[]} teacherUsers={[]} onChanged={vi.fn()} onFailed={vi.fn()} />
const mountTab = (value: ScheduledSubjects = data, mallas: Malla[] = [MALLAS[0]!]) => renderWithProviders(tab(value, mallas))
const subjectNames = (): string[] =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((item) => item.querySelectorAll("td")[1]?.textContent ?? item.textContent ?? "")
const bulkBar = (): HTMLElement | null => screen.queryByRole("region", { name: "Acciones masivas de materias" })
const checkedBoxes = (): number => screen.queryAllByRole("checkbox").filter((box) => box.getAttribute("aria-checked") !== "false").length
const mark = async (name: string): Promise<void> => {
  fireEvent.click(screen.getByRole("checkbox", { name }))
  await flush()
}
const rowOf = (name: string): HTMLElement => screen.getAllByRole("row").find((item) => item.textContent?.startsWith(name))!
const optionsOf = async (actor: ReturnType<typeof userEvent.setup>, label: string): Promise<string[]> => {
  await actor.click(screen.getByRole("combobox", { name: label }))
  const listbox = await screen.findByRole("listbox")
  const names = within(listbox)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "")
  await actor.keyboard("{Escape}")

  return names
}
const choose = async (actor: ReturnType<typeof userEvent.setup>, label: string, option: string): Promise<void> => {
  await actor.click(screen.getByRole("combobox", { name: label }))
  await actor.click(await screen.findByRole("option", { name: option }))
  await flush()
}

describe("ScheduledSubjectsTab", () => {
  it("marca las materias que no generan sílabo", () => {
    const withoutSyllabus = { ...row("4", "Prácticas preprofesionales", "SW-801", 8, []), generates_syllabus: false }
    mountTab({ ...data, scheduledSubjects: [...data.scheduledSubjects, withoutSyllabus] })

    expect(document.body.textContent).toContain("Prácticas preprofesionalesSin sílabo")
    expect(document.body.textContent).not.toContain("CálculoSin sílabo")
  })

  it("ordena por materia y por ciclo con «Sin ciclo» al final y los paralelos siguen con su materia", () => {
    mountTab({ ...data, scheduledSubjects: [...data.scheduledSubjects, row("4", "Ética", "GE-001", null, [{ code: "C", shift: "matutina" }])] })
    const subjects = () => screen.getAllByRole("row").slice(1).map((item) => item.querySelectorAll("td")[1]!.textContent)

    fireEvent.click(screen.getByRole("button", { name: "Ciclo" }))
    expect(subjects()).toEqual(["Cálculo", "Bases de Datos", "Arquitectura de Software", "Ética"])
    expect(screen.getByRole("columnheader", { name: "Ciclo" }).getAttribute("aria-sort")).toBe("ascending")
    fireEvent.click(screen.getByRole("button", { name: "Ciclo" }))
    expect(subjects()).toEqual(["Arquitectura de Software", "Bases de Datos", "Cálculo", "Ética"])
    expect(rowOf("Arquitectura de Software").querySelectorAll("td")[3]!.textContent).toBe("A")
    fireEvent.click(screen.getByRole("button", { name: "Materia" }))
    fireEvent.click(screen.getByRole("button", { name: "Materia" }))
    expect(subjects()).toEqual(["Ética", "Cálculo", "Bases de Datos", "Arquitectura de Software"])
    expect(screen.getByRole("columnheader", { name: "Materia" }).getAttribute("aria-sort")).toBe("descending")
    expect(rowOf("Ética").querySelectorAll("td")[3]!.textContent).toBe("C")
  })

  it("no muestra la ficha: vive en Proyecto de carrera", () => {
    mountTab()
    expect(document.body.textContent).not.toContain("Ficha")
    expect(screen.queryByRole("button", { name: "Ficha" })).toBeNull()
  })

  it("ofrece selectores de ciclo, paralelo y jornada derivados de los datos", async () => {
    const actor = userEvent.setup()
    mountTab()

    expect(await optionsOf(actor, "Ciclo")).toEqual(["Todos los ciclos", "1", "3", "6"])
    expect(await optionsOf(actor, "Paralelo")).toEqual(["Todos los paralelos", "A", "B"])
    expect(await optionsOf(actor, "Jornada")).toEqual(["Todas las jornadas", "Matutina", "Nocturna"])
  })

  it("filtra por ciclo, paralelo y jornada por separado", async () => {
    const actor = userEvent.setup()
    mountTab()
    await choose(actor, "Jornada", "Nocturna")
    expect(document.body.textContent).not.toContain("Arquitectura de Software")
    expect(document.body.textContent).toContain("Bases de Datos")
    expect(document.body.textContent).toContain("Cálculo")

    await choose(actor, "Paralelo", "A")
    expect(document.body.textContent).not.toContain("Bases de Datos")
    expect(document.body.textContent).toContain("Cálculo")

    await choose(actor, "Ciclo", "3")
    expect(document.body.textContent).toContain("No hay materias que coincidan con los filtros")
  })

  it("no tiene columna de acciones: un clic en la fila abre Paralelos y docentes", async () => {
    mountTab()
    expect(document.body.textContent).not.toContain("Acciones")
    expect(document.body.querySelector(".parallel-sheet")).toBeNull()

    fireEvent.click(rowOf("Bases de Datos").querySelectorAll("td")[1]!)
    await flush()
    expect(document.body.querySelector(".parallel-sheet")?.textContent).toBe("Bases de Datos")
  })

  it("abre la hoja aunque el periodo académico esté abierto: paralelos y docentes no se bloquean", async () => {
    mountTab({ ...data, career: { ...data.career, lock_reason: "Periodo académico activo" } })
    fireEvent.click(rowOf("Bases de Datos").querySelectorAll("td")[1]!)
    await flush()
    expect(document.body.querySelector(".parallel-sheet")).not.toBeNull()
  })

  it("no abre la hoja si el período es de solo lectura", async () => {
    mountTab({ ...data, scheduledSubjects: data.scheduledSubjects.map((item) => ({ ...item, editable: false })) })
    fireEvent.click(rowOf("Bases de Datos").querySelectorAll("td")[1]!)
    await flush()
    expect(document.body.querySelector(".parallel-sheet")).toBeNull()
  })

  it("al marcar una materia aparecen las acciones masivas con lo seleccionado", async () => {
    mountTab()
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Bases de Datos" }))
    await flush()

    expect(screen.getByRole("region", { name: "Acciones masivas de materias" }).textContent).toContain("1 materia y 1 paralelo seleccionado")
  })
})

describe("ScheduledSubjectsTab, una malla a la vez", () => {
  const inMalla = (item: Row, code: string): Row => ({ ...item, malla_name: `Malla ${code}` })
  const twoMallas: ScheduledSubjects = {
    ...data,
    scheduledSubjects: [data.scheduledSubjects[0]!, data.scheduledSubjects[1]!, inMalla(row("3", "Cálculo", "MA-101", 1, [{ code: "C", shift: "nocturna" }]), "SW-8")],
  }
  const chooseMalla = async (actor: ReturnType<typeof userEvent.setup>, code: string): Promise<void> => {
    await actor.click(screen.getByRole("combobox", { name: "Malla" }))
    await actor.click(await screen.findByRole("option", { name: new RegExp(`^Malla ${code} `) }))
    await flush()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    api.updateParallel.mockResolvedValue({ message: "ok" })
    api.createParallels.mockResolvedValue({ message: "ok" })
  })

  it("abre la malla vigente con el desplegable de la pantalla Malla y solo sus materias, sin etiqueta en las filas", () => {
    mountTab(twoMallas, MALLAS)

    expect(screen.getByRole("combobox", { name: "Malla" }).textContent).toBe("Malla SW-9 · Vigente · 8 ciclos")
    expect(subjectNames()).toEqual(["Arquitectura de Software", "Bases de Datos"])
    expect(document.querySelector('[data-tour="filters"] [aria-label="Malla"]')).toBeNull()
    expect(document.querySelector('[data-tour="malla-selector"]')).toHaveClass("max-w-72", "max-sm:max-w-none")
  })

  it("el desplegable ofrece las mallas abiertas, sin «Todas las mallas», «Nueva malla» ni las cerradas", async () => {
    const actor = userEvent.setup()
    mountTab(twoMallas, MALLAS)

    expect(await optionsOf(actor, "Malla")).toEqual(["Malla SW-9 · Vigente · 8 ciclos", "Malla SW-8 · Vigente · 8 ciclos"])
    expect(document.body.textContent).not.toContain("Todas las mallas")
  })

  it("las opciones de ciclo, paralelo y jornada salen solo de la malla que se ve", async () => {
    const actor = userEvent.setup()
    mountTab(twoMallas, MALLAS)
    expect(await optionsOf(actor, "Paralelo")).toEqual(["Todos los paralelos", "A", "B"])

    await chooseMalla(actor, "SW-8")

    expect(subjectNames()).toEqual(["Cálculo"])
    expect(await optionsOf(actor, "Ciclo")).toEqual(["Todos los ciclos", "1"])
    expect(await optionsOf(actor, "Paralelo")).toEqual(["Todos los paralelos", "C"])
    expect(await optionsOf(actor, "Jornada")).toEqual(["Todas las jornadas", "Nocturna"])
  })

  it("al cambiar de malla se quitan la búsqueda y los filtros de la anterior", async () => {
    const actor = userEvent.setup()
    mountTab(twoMallas, MALLAS)
    await choose(actor, "Ciclo", "3")
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bases" } })
    await flush()

    await chooseMalla(actor, "SW-8")

    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("combobox", { name: "Ciclo" }).textContent).toBe("Todos los ciclos")
    expect(subjectNames()).toEqual(["Cálculo"])
  })

  it("al cambiar de malla no queda nada marcado, tampoco al volver", async () => {
    const actor = userEvent.setup()
    mountTab(twoMallas, MALLAS)
    await mark("Seleccionar las materias visibles")
    expect(bulkBar()!.textContent).toContain("2 materias y 2 paralelos seleccionados")

    await chooseMalla(actor, "SW-8")
    expect(bulkBar()).toBeNull()
    expect(checkedBoxes()).toBe(0)

    await chooseMalla(actor, "SW-9")
    expect(bulkBar()).toBeNull()
    expect(checkedBoxes()).toBe(0)
  })

  it("una acción en lote sobre paralelos, después de cambiar de malla, solo toca los que se ven", async () => {
    const actor = userEvent.setup()
    mountTab(twoMallas, MALLAS)
    await mark("Seleccionar las materias visibles")
    await chooseMalla(actor, "SW-8")
    await mark("Seleccionar las materias visibles")
    expect(bulkBar()!.textContent).toContain("1 materia y 1 paralelo seleccionado")

    await actor.click(screen.getByRole("button", { name: /Acciones masivas/ }))
    await actor.click(await screen.findByRole("menuitem", { name: "Asignar jornada" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Matutina" }))
    await flush()

    expect(api.updateParallel.mock.calls).toEqual([["3-0", { code: "C", shift: "matutina" }, "unconfirmed"]])
    expect(api.createParallels).not.toHaveBeenCalled()
  })

  it("agregar un paralelo en lote después de cambiar de malla solo lo crea en las materias que se ven", async () => {
    const actor = userEvent.setup()
    renderWithProviders(
      <ScheduledSubjectsTab data={twoMallas} mallas={MALLAS} assignments={[]} teacherUsers={[{ id: "01a1c5ba-2222-7000-8000-999999999999", name: "Docente Uno", email: "a@b.c" }]} onChanged={vi.fn()} onFailed={vi.fn()} />,
    )
    await mark("Seleccionar Bases de Datos")
    await chooseMalla(actor, "SW-8")
    await mark("Seleccionar Cálculo")

    await actor.click(screen.getByRole("button", { name: /Acciones masivas/ }))
    await actor.click(await screen.findByRole("menuitem", { name: "Agregar un paralelo" }))
    await flush()
    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Docente de los nuevos paralelos"]')!)
    await flush()
    fireEvent.click(document.body.querySelector<HTMLElement>('[data-slot="command-item"]')!)
    await flush()
    fireEvent.click(screen.getByRole("button", { name: "Agregar paralelos" }))
    await flush()

    expect(api.createParallels.mock.calls.map(([input]) => input.subject_id)).toEqual(["s-3"])
    expect(api.updateParallel).not.toHaveBeenCalled()
  })

  it("mientras una acción en lote está en curso no se puede cambiar de malla", async () => {
    let finish: (value: { message: string }) => void = () => undefined
    api.updateParallel.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const actor = userEvent.setup()
    mountTab(twoMallas, MALLAS)
    await mark("Seleccionar Bases de Datos")
    expect(screen.getByRole("combobox", { name: "Malla" })).toBeEnabled()

    await actor.click(screen.getByRole("button", { name: /Acciones masivas/ }))
    await actor.click(await screen.findByRole("menuitem", { name: "Asignar jornada" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Matutina" }))
    await flush()
    expect(screen.getByRole("combobox", { name: "Malla" })).toBeDisabled()

    finish({ message: "ok" })
    await flush()
    expect(screen.getByRole("combobox", { name: "Malla" })).toBeEnabled()
    expect(api.updateParallel).toHaveBeenCalledTimes(1)
  })

  it("si una recarga saca de la malla que se ve una materia marcada, deja de estar marcada", async () => {
    const view = mountTab(twoMallas, MALLAS)
    await mark("Seleccionar Bases de Datos")
    expect(bulkBar()).not.toBeNull()

    view.rerender(tab({ ...twoMallas, scheduledSubjects: twoMallas.scheduledSubjects.map((item) => (item.subject_id === "s-2" ? inMalla(item, "SW-8") : item)) }, MALLAS))
    await flush()

    expect(subjectNames()).toEqual(["Arquitectura de Software"])
    expect(bulkBar()).toBeNull()
  })

  it("al recargar los datos sigue en la malla elegida y conserva lo marcado de ella", async () => {
    const actor = userEvent.setup()
    const view = mountTab(twoMallas, MALLAS)
    await chooseMalla(actor, "SW-8")
    await mark("Seleccionar Cálculo")

    view.rerender(tab({ ...twoMallas, scheduledSubjects: twoMallas.scheduledSubjects.map((item) => ({ ...item })) }, MALLAS.map((item) => ({ ...item }))))
    await flush()

    expect(subjectNames()).toEqual(["Cálculo"])
    expect(bulkBar()!.textContent).toContain("1 materia y 1 paralelo seleccionado")
  })

  it("al cambiar de malla vuelve a la primera página", async () => {
    const actor = userEvent.setup()
    const many = (code: string) => Array.from({ length: 22 }, (_, index) => inMalla(row(`${code}-${index}`, `${code} materia ${String(index).padStart(2, "0")}`, `${code}-${index}`, 1, []), code))
    mountTab({ ...data, scheduledSubjects: [...many("SW-9"), ...many("SW-8")] }, MALLAS)
    await actor.click(screen.getByRole("button", { name: "Página siguiente" }))
    await flush()
    expect(subjectNames()).toEqual(["SW-9 materia 20", "SW-9 materia 21"])

    await chooseMalla(actor, "SW-8")

    expect(subjectNames()).toHaveLength(20)
    expect(subjectNames()[0]).toBe("SW-8 materia 00")
  })

  it("una malla sin materias lo dice", async () => {
    const actor = userEvent.setup()
    mountTab(data, MALLAS)

    await chooseMalla(actor, "SW-8")

    expect(document.body.textContent).toContain("No hay materias en la malla")
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0)
  })

  it("con una sola malla muestra el desplegable con esa malla y todas sus materias", async () => {
    const actor = userEvent.setup()
    mountTab()

    expect(await optionsOf(actor, "Malla")).toEqual(["Malla SW-9 · Vigente · 8 ciclos"])
    expect(subjectNames()).toEqual(["Arquitectura de Software", "Bases de Datos", "Cálculo"])
    expect(rowOf("Cálculo").textContent).not.toContain("Malla SW-9")
  })

  it.each([
    ["no tiene mallas", [] as Malla[]],
    ["solo tiene mallas cerradas", [MALLAS[2]!]],
  ])("si la carrera %s no muestra el desplegable y lo dice", (_case, mallas) => {
    mountTab({ ...data, scheduledSubjects: [] }, mallas)

    expect(screen.queryByRole("combobox", { name: "Malla" })).toBeNull()
    expect(document.body.textContent).toContain("La carrera no tiene mallas vigentes")
  })
})
