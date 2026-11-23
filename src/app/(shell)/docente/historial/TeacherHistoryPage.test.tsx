import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getTeacherHistory } from "@/api/syllabi"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import TeacherHistoryPage from "./TeacherHistoryPage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/syllabi", () => ({ getTeacherHistory: vi.fn() }))

const mountPage = async () => {
  const view = renderWithProviders(<TeacherHistoryPage />)
  await flush()
  return view
}

describe("TeacherHistoryPage", () => {
  beforeEach(() => {
    vi.mocked(getTeacherHistory).mockReset()
    navigation.reset("/docente/historial")
  })

  it("lista las carreras con historial y abre la de la fila", async () => {
    vi.mocked(getTeacherHistory).mockResolvedValue({ careers: [{ id: "c1", name: "Software", syllabi_count: 3 }] })
    const { container } = await mountPage()

    expect(container.textContent).toContain("Software")
    fireEvent.click(container.querySelector("tbody tr")!)
    expect(navigation.push).toHaveBeenCalledWith("/docente/historial/c1")
  })

  it("avisa cuando todavía no hay períodos anteriores", async () => {
    vi.mocked(getTeacherHistory).mockResolvedValue({ careers: [] })
    const { container } = await mountPage()

    expect(container.textContent).toContain("Todavía no tiene sílabos de períodos anteriores")
    expect(container.textContent).toContain("0–0 de 0")
  })

  it("vuelve a mis sílabos", async () => {
    vi.mocked(getTeacherHistory).mockResolvedValue({ careers: [] })
    const { getByRole } = await mountPage()

    fireEvent.click(getByRole("button", { name: "Volver a mis sílabos" }))
    expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos")
  })
})
