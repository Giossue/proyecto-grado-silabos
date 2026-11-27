import { afterEach, describe, expect, it, vi } from "vitest"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import AcademicGovernancePage from "./AcademicGovernancePage"

const api = vi.hoisted(() => ({ getAcademicGovernance: vi.fn(), getSession: vi.fn(), params: {} as Record<string, string> }))
vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => api.params }))
vi.mock("@/api/academic", async (importOriginal) => ({ ...(await importOriginal<object>()), getAcademicGovernance: api.getAcademicGovernance }))
vi.mock("@/api/session", () => ({ getSession: api.getSession }))
vi.mock("@/components/domain/academic/CatalogSection", () => ({ CatalogSection: () => null }))
vi.mock("@/components/domain/academic/CatalogRecordDialog", () => ({ CatalogRecordDialog: () => null }))

const governance = { lock_reason: null, catalogs: { faculties: [], careers: [], periods: [] }, options: {} }

afterEach(() => {
  vi.clearAllMocks()
  navigation.reset()
})

describe("AcademicGovernancePage", () => {
  it("la ruta antigua de Periodos redirige a Procesos de sílabos", async () => {
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.params = { section: "periodos-academicos" }
    renderWithProviders(<AcademicGovernancePage />)
    await flush()

    expect(navigation.replace).toHaveBeenCalledWith("/admin/periodos")
    expect(api.getAcademicGovernance).not.toHaveBeenCalled()
  })

  it.each([[{}], [{ section: "facultades" }], [{ section: "carreras" }]] as Array<[Record<string, string>]>)(
    "es una sola pantalla sin pestañas y solo ofrece crear carrera: %o",
    async (params) => {
      api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
      api.params = params
      api.getAcademicGovernance.mockResolvedValue(governance)
      renderWithProviders(<AcademicGovernancePage />)
      await flush()

      expect(document.querySelector("h1")?.textContent).toBe("Facultades y carreras")
      expect(document.querySelector('[role="tablist"]')).toBeNull()
      const buttons = [...document.querySelectorAll("button")].map((button) => button.getAttribute("aria-label") ?? button.textContent)
      expect(buttons).toContain("Crear carrera")
      expect(buttons).not.toContain("Crear facultad")
    },
  )

  it("mientras carga no anuncia pestañas en el skeleton", async () => {
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.params = {}
    let resolve: (value: unknown) => void = () => undefined
    api.getAcademicGovernance.mockReturnValue(new Promise((done) => (resolve = done)))
    renderWithProviders(<AcademicGovernancePage />)
    await flush()

    expect(document.querySelector('[data-skeleton="table-tabs"]')).toBeNull()

    resolve(governance)
    await flush()
    expect(document.querySelector('[role="tablist"]')).toBeNull()
  })

  it("el aviso de cambios solo sale con un proceso de sílabos en curso, no con uno finalizado", async () => {
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.params = {}
    const base = { ...governance, lock_reason: "Proceso de sílabos cerrado" }
    api.getAcademicGovernance.mockResolvedValue({ ...base, convocation_in_progress: false })
    const finalized = renderWithProviders(<AcademicGovernancePage />)
    await flush()
    expect(document.body.textContent).not.toContain("vuelven a Borrador")
    finalized.unmount()

    api.getAcademicGovernance.mockResolvedValue({ ...base, convocation_in_progress: true })
    renderWithProviders(<AcademicGovernancePage />)
    await flush()
    expect(document.body.textContent).toContain("Hay un proceso de sílabos en curso")
    expect(document.body.textContent).toContain("vuelven a Borrador")
  })
})
