import { act, fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { reactivateCareerTeacher, removeCareerTeacher, resendCareerTeacherInvitation, type TeacherAssignments } from "@/api/career-academics"
import { TeacherAssignmentsPanel } from "@/components/domain/academic/TeacherAssignmentsPanel"
import { buttonWithText, keepClosingDialogs } from "@/components/domain/academic/academicTestUtils"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/components/ui/select", async () => (await import("@/components/domain/academic/curriculum/curriculumTestUtils")).selectStub)
vi.mock("@/api/career-academics", () => ({
  reactivateCareerTeacher: vi.fn(),
  removeCareerTeacher: vi.fn(),
  resendCareerTeacherInvitation: vi.fn(),
}))

const data: TeacherAssignments = {
  canCreateTeacher: true,
  career: { id: "career-1", name: "Software", lock_reason: null },
  pendingTeachers: [{ id: "teacher-pending", name: "Docente pendiente", email: "pendiente@example.test" }],
  careerTeachers: [
    { id: "teacher-pending", name: "Docente pendiente", email: "pendiente@example.test", pending_activation: true, invitation_expired: false, active: true },
    { id: "teacher-active", name: "Docente activo", email: "activo@example.test", pending_activation: false, invitation_expired: false, active: true },
    { id: "teacher-free", name: "Docente sin paralelo", email: "docente2.pruebas@example.test", pending_activation: false, invitation_expired: false, active: true },
  ],
  teacherAssignments: [
    {
      id: "assignment-1",
      user_id: "teacher-active",
      parallel_id: "parallel-1",
      user_name: "Docente activo",
      user_email: "activo@example.test",
      parallel_code: "A",
      subject_name: "Inteligencia Artificial",
      active: true,
      editable: true,
    },
  ],
  options: { parallels: [], teacherUsers: [] },
}

const inactivePendingData: TeacherAssignments = {
  ...data,
  pendingTeachers: [{ id: "teacher-inactive", name: "Docente retirado", email: "retirado@example.test" }],
  careerTeachers: [{ id: "teacher-inactive", name: "Docente retirado", email: "retirado@example.test", pending_activation: true, invitation_expired: false, active: true }],
  teacherAssignments: [
    {
      ...data.teacherAssignments[0]!,
      id: "assignment-inactive",
      user_id: "teacher-inactive",
      user_name: "Docente retirado",
      user_email: "retirado@example.test",
      active: false,
      editable: false,
    },
  ],
}

const changed = vi.fn()
const mountPanel = (value: TeacherAssignments = data) => renderWithProviders(<TeacherAssignmentsPanel data={value} onChanged={changed} />)
const rowOf = (name: string): HTMLElement => [...document.body.querySelectorAll<HTMLElement>("tbody tr")].find((item) => item.textContent?.includes(name))!
const openRow = async (name: string): Promise<void> => {
  fireEvent.click(rowOf(name))
  await flush()
}

describe("TeacherAssignmentsPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    changed.mockReset()
  })

  it("muestra la invitación pendiente dentro de la tabla", () => {
    mountPanel()

    expect(document.body.textContent).toContain("Docente pendiente")
    expect(document.body.textContent).toContain("Pendiente")
    expect(document.body.textContent).toContain("activo@example.test")
    expect(document.body.textContent).not.toContain("Acciones")
    expect(document.body.textContent).not.toContain("Reenviar invitación")
    expect(document.body.textContent).not.toContain("Editar docente")
  })

  it("ordena por el estado visible al pulsar su encabezado y marca aria-sort en esa columna", () => {
    mountPanel()
    const names = () => [...document.body.querySelectorAll("tbody tr td:first-child button")].map((button) => button.textContent)

    expect(names()).toEqual(["Docente pendiente", "Docente activo", "Docente sin paralelo"])
    fireEvent.click(screen.getByRole("button", { name: "Estado" }))
    expect(names()).toEqual(["Docente activo", "Docente sin paralelo", "Docente pendiente"])
    expect(screen.getByRole("columnheader", { name: "Estado" }).getAttribute("aria-sort")).toBe("ascending")
    fireEvent.click(screen.getByRole("button", { name: "Docente" }))
    expect(names()).toEqual(["Docente activo", "Docente pendiente", "Docente sin paralelo"])
    expect(screen.getByRole("columnheader", { name: "Estado" }).hasAttribute("aria-sort")).toBe(false)
  })

  it("muestra al docente pendiente sin datos de paralelos", () => {
    mountPanel(inactivePendingData)

    expect(document.body.textContent).toContain("Docente retirado")
    expect(document.body.textContent).toContain("Pendiente")
    expect(document.body.textContent).not.toContain("Inteligencia Artificial")
  })

  it("muestra al docente activo sin paralelo con estado Activo", () => {
    mountPanel({ ...data, pendingTeachers: [], careerTeachers: [data.careerTeachers[2]!], teacherAssignments: [] })

    // Only the table: the stubbed filter prints its options as text.
    const text = document.querySelector("table")!.textContent ?? ""
    expect(text).toContain("Docente sin paralelo")
    expect(text).toContain("docente2.pruebas@example.test")
    expect(text).toContain("Activo")
    expect(text).not.toContain("Activa")
    expect(text).not.toContain("Pendiente")
    expect(text).not.toContain("Reenviar invitación")
  })

  it("abre la ficha del docente pendiente con «Desactivar» en el pie", async () => {
    mountPanel()
    await openRow("Docente pendiente")

    expect(screen.getByRole("dialog").textContent).toContain("Docente")
    expect(document.body.querySelector('button[aria-label="Desactivar"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain("Quitar de la carrera")
  })

  it("cada acción es un botón con texto, sin menú", async () => {
    mountPanel()
    await openRow("Docente activo")

    expect(document.body.querySelector('button[aria-label="Desactivar"]')?.textContent?.trim()).toBe("Desactivar")
    expect(document.body.querySelector('button[aria-label="Acciones para Docente activo"]')).toBeNull()
    expect(document.body.querySelector('[data-slot="tooltip-content"]')).toBeNull()
  })

  it("con la cuenta pendiente no deja editar nombre ni correo ni reenviar la invitación", async () => {
    mountPanel()
    await openRow("Docente pendiente")

    const dialog = screen.getByRole("dialog")
    const inputs = [...dialog.querySelectorAll<HTMLInputElement>("input")]
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs.every((input) => input.disabled)).toBe(true)
    expect(inputs.map((input) => input.value)).toContain("pendiente@example.test")
    const buttons = [...dialog.querySelectorAll("button")].map((button) => button.textContent?.trim())
    expect(buttons).not.toContain("Guardar cambios")
    expect(dialog.textContent).not.toContain("Reenviar invitación")
    expect(dialog.querySelector('button[aria-label="Acciones para Docente pendiente"]')).toBeNull()
  })

  it("si la invitación venció sin aceptarse, la tabla lo dice y la ficha ofrece reenviarla", async () => {
    vi.mocked(resendCareerTeacherInvitation).mockResolvedValue({ message: "Invitación de activación enviada a pendiente@example.test." })
    const expired = { ...data, careerTeachers: [{ ...data.careerTeachers[0]!, invitation_expired: true, active: true }, ...data.careerTeachers.slice(1)] }
    mountPanel(expired)
    expect(rowOf("Docente pendiente").textContent).toContain("Invitación vencida")
    await openRow("Docente pendiente")

    vi.useFakeTimers()
    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Reenviar invitación"]')!)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })

    expect(resendCareerTeacherInvitation).toHaveBeenCalledWith("teacher-pending")
    expect(changed.mock.calls[0]).toEqual(["Invitación de activación enviada a pendiente@example.test."])
  })

  it("con la cuenta activa solo ofrece cerrar, sin guardar cambios", async () => {
    mountPanel()
    await openRow("Docente activo")

    const buttons = [...screen.getByRole("dialog").querySelectorAll("button")].map((button) => button.textContent?.trim())
    expect(buttons).toContain("Cerrar")
    expect(buttons).not.toContain("Guardar cambios")
    expect(buttons).not.toContain("Cancelar")
  })

  it("al desactivar explica qué pasa y el modal conserva el nombre mientras se cierra", async () => {
    keepClosingDialogs()
    vi.mocked(removeCareerTeacher).mockResolvedValue({ message: "Docente desactivado en su carrera." } as never)
    mountPanel()
    await openRow("Docente activo")
    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Desactivar"]')!)
    await flush()
    const dialog = document.body.querySelector('[role="dialog"][data-state="open"]')!
    expect(dialog.textContent).toContain("Queda como inactivo en esta carrera y sus paralelos quedan sin docente")
    expect(dialog.textContent).toContain("Puede reactivarlo después")
    fireEvent.click(buttonWithText("Desactivar", dialog)!)
    await flush()

    expect(removeCareerTeacher).toHaveBeenCalledWith("teacher-active")
    expect(changed.mock.calls).toEqual([["Docente desactivado en su carrera."]])
    const closing = [...document.body.querySelectorAll('[role="dialog"][data-state="closed"]')].map((item) => item.textContent ?? "")
    expect(closing.some((text) => text.includes("Desactivar a Docente activo"))).toBe(true)
  })

  const former = { ...data.careerTeachers[0]!, id: "teacher-former", name: "Docente anterior", email: "anterior@example.test", invitation_expired: true, active: false }
  const withFormer = { ...data, careerTeachers: [...data.careerTeachers, former] }

  it("el docente desactivado sigue en la tabla como «Inactivo» y se puede filtrar", () => {
    mountPanel(withFormer)
    const names = () => [...document.body.querySelectorAll("tbody tr td:first-child button")].map((button) => button.textContent)
    const choose = (value: string): void => void fireEvent.click(document.querySelector(`[data-value="${value}"]`)!)

    expect(rowOf("Docente anterior").textContent).toContain("Inactivo")
    expect(rowOf("Docente anterior").textContent).not.toContain("Invitación vencida")
    expect(document.querySelector('[data-value="active"]')!.textContent).toBe("Activo")
    expect(document.querySelector('[data-value="inactive"]')!.textContent).toBe("Inactivo")
    choose("inactive")
    expect(names()).toEqual(["Docente anterior"])
    choose("pending")
    expect(names()).toEqual(["Docente pendiente"])
    choose("active")
    expect(names()).toEqual(["Docente activo", "Docente sin paralelo"])
    choose("all")
    expect(names()).toHaveLength(4)
  })

  it("la ficha del inactivo solo ofrece reactivarlo, también con el periodo en curso", async () => {
    vi.mocked(reactivateCareerTeacher).mockResolvedValue({ message: "Docente reactivado en su carrera." })
    mountPanel({ ...withFormer, career: { ...data.career, lock_reason: "Periodo académico activo" } })
    await openRow("Docente anterior")

    const dialog = screen.getByRole("dialog")
    expect(dialog.querySelector('button[aria-label="Desactivar"]')).toBeNull()
    expect(dialog.textContent).not.toContain("Reenviar invitación")
    const reactivate = dialog.querySelector<HTMLButtonElement>('button[aria-label="Reactivar"]')!
    expect(reactivate).toBeEnabled()

    vi.useFakeTimers()
    fireEvent.click(reactivate)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(reactivateCareerTeacher).toHaveBeenCalledWith("teacher-former")
    expect(changed.mock.calls[0]).toEqual(["Docente reactivado en su carrera."])
  })

  it("con el periodo en curso no deja desactivar y dice por qué", async () => {
    mountPanel({ ...data, career: { ...data.career, lock_reason: "Periodo académico activo" } })
    await openRow("Docente activo")

    const dialog = screen.getByRole("dialog")
    expect(dialog.querySelector('button[aria-label="Desactivar"]')).toBeDisabled()
    expect(dialog.textContent).toContain("No se puede desactivar mientras el periodo académico esté en curso")
  })

  it("la ficha del docente se retira cuando termina la animación de salida", async () => {
    keepClosingDialogs()
    mountPanel()
    await openRow("Docente activo")
    vi.useFakeTimers()
    fireEvent.click(buttonWithText("Cerrar", screen.getByRole("dialog"))!)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(document.body.textContent).toContain("Datos del docente en su carrera")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
    })
    expect(document.body.textContent).not.toContain("Datos del docente en su carrera")
  })
})
