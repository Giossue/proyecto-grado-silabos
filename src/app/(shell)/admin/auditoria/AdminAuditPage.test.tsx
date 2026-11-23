import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { downloadAuditWorkbook, getAuditEvents, type AuditPayload } from "@/api/operations"
import { getSession } from "@/api/session"
import AdminAuditPage from "./AdminAuditPage"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/operations")>()),
  getAuditEvents: vi.fn(),
  downloadAuditWorkbook: vi.fn(),
}))

const payload: AuditPayload = {
  filters: {},
  action_options: [{ value: "usuario.desactivado", label: "Cuenta desactivada" }],
  period_options: [{ value: "p1", label: "Agosto-Diciembre 2026" }],
  role_options: [{ value: "docente", label: "Docente" }],
  career_options: [{ value: "c1", label: "Software" }],
  events: {
    data: [
      {
        id: "event-1",
        action: "Cuenta desactivada",
        resource: "Usuario",
        result: "exito",
        actor: "Ada Administradora",
        role: "Administrador",
        career: null,
        details: [{ label: "Activo", value: false }],
        occurred_at: "2026-09-23T14:30:00Z",
      },
    ],
    current_page: 1,
    last_page: 1,
    per_page: 20,
    from: 1,
    to: 1,
    total: 1,
  },
}

describe("AdminAuditPage", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    navigation.reset("/admin/auditoria")
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", name: "Ada Administradora", email: "ada@example.test", email_verified: true, can_edit_identity: true },
      active_role: { id: "role-1", code: "administrador", career_id: null, career_name: null },
      available_roles: [],
    })
    vi.mocked(getAuditEvents).mockResolvedValue(payload)
  })

  it("presenta un único registro con qué cambió y sobre qué registro, sin procesos", async () => {
    renderWithProviders(<AdminAuditPage />)
    await flush()

    expect(getAuditEvents).toHaveBeenCalledWith({ page: "1" })
    expect([...document.body.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(["Fecha", "Actividad", "Responsable"])
    const text = document.body.textContent ?? ""
    expect(text).toContain("Cuenta desactivada")
    expect(text).toContain("Ada Administradora")
    expect(text).not.toContain("Procesos")
    expect(text).toContain("Activo: No")
    expect(document.body.querySelector('[role="tablist"]')).toBeNull()
    expect(document.body.querySelector('[data-slot="badge"]')).toBeNull()
  })

  it("filtra por período, rol, carrera, actividad, resultado y tipo de actividad, sin búsqueda de texto libre", async () => {
    renderWithProviders(<AdminAuditPage />)
    await flush()

    expect(document.body.querySelector('input[type="search"]')).toBeNull()
    expect([...document.body.querySelectorAll('[data-slot="select-trigger"]')].map((trigger) => trigger.id)).toEqual([
      "audit-period",
      "audit-role",
      "audit-career",
      "audit-action",
      "audit-result",
      "audit-technical",
    ])
    expect(document.body.querySelector("td")!.classList).not.toContain("text-xs")
    expect(document.body.querySelector("td .text-xs")).toBeNull()
  })

  it("lee los filtros de la dirección y los manda a la API", async () => {
    navigation.reset("/admin/auditoria?period=p1&technical=1&page=3")
    renderWithProviders(<AdminAuditPage />)
    await flush()

    expect(getAuditEvents).toHaveBeenCalledWith({ period: "p1", technical: "1", page: "3" })
  })

  it("«Exportar a Excel» descarga los eventos con los filtros elegidos", async () => {
    vi.mocked(downloadAuditWorkbook).mockResolvedValue()
    renderWithProviders(<AdminAuditPage />)
    await flush()

    fireEvent.click([...document.body.querySelectorAll("button")].find((button) => button.textContent === "Exportar a Excel")!)
    await flush()
    expect(downloadAuditWorkbook).toHaveBeenCalledWith({}, expect.stringMatching(/^auditoria-.*\.xlsx$/))
  })
})
