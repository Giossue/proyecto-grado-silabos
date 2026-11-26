import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ScheduledSubjects } from "@/api/career-academics"
import { ScheduledSubjectsTab } from "@/components/domain/academic/ScheduledSubjectsTab"
import { flush, renderWithProviders } from "@/test/render"

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
  campus_name: "Matriz",
  modality_name: "Presencial",
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

const mountTab = (value: ScheduledSubjects = data) => renderWithProviders(<ScheduledSubjectsTab data={value} assignments={[]} teacherUsers={[]} onChanged={vi.fn()} onFailed={vi.fn()} />)
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
