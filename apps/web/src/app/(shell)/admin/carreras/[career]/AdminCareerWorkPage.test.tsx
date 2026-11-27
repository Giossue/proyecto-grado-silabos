import { act, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAcademicGovernance, type AcademicGovernance } from "@/api/academic"
import { ApiError } from "@/api/client"
import { getSession } from "@/api/session"
import { academicKeys } from "@/queries/academic"
import { NotFoundBoundary } from "@/test/notFoundBoundary"
import { createTestQueryClient, flush, renderWithProviders } from "@/test/render"
import AdminCareerWorkPage, { type AdminCareerWork } from "./AdminCareerWorkPage"

const route = vi.hoisted(() => ({ params: {} as Record<string, string> }))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => route.params }))
vi.mock("@/api/academic", () => ({ getAcademicGovernance: vi.fn() }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/app/(shell)/coordinacion/malla/CoordinationAcademicStructurePage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(shell)/coordinacion/malla/CoordinationAcademicStructurePage")>()),
  CoordinationAcademicStructurePage: ({ mode, adminCareer }: { mode: string; adminCareer: { id: string; code: string } }) => (
    <p data-testid="work">{`${mode} ${adminCareer.id} ${adminCareer.code}`}</p>
  ),
}))
vi.mock("@/app/(shell)/coordinacion/proyecto-carrera/CoordinationCareerProjectPage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(shell)/coordinacion/proyecto-carrera/CoordinationCareerProjectPage")>()),
  default: ({ adminCareer }: { adminCareer: { id: string; code: string } }) => <p data-testid="work">{`project ${adminCareer.id} ${adminCareer.code}`}</p>,
}))
vi.mock("@/app/(shell)/coordinacion/proyecto-carrera/[malla]/[subject]/CoordinationSubjectProfilePage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(shell)/coordinacion/proyecto-carrera/[malla]/[subject]/CoordinationSubjectProfilePage")>()),
  default: ({ adminCareer }: { adminCareer: { id: string; code: string } }) => <p data-testid="work">{`subject ${adminCareer.id} ${adminCareer.code}`}</p>,
}))

const governance = (careers: Array<{ id: string; code: string }>) => ({ catalogs: { careers } }) as unknown as AcademicGovernance
const mount = (work: AdminCareerWork, queryClient = createTestQueryClient()) =>
  renderWithProviders(<NotFoundBoundary><AdminCareerWorkPage work={work} /></NotFoundBoundary>, { queryClient })

describe("Trabajo de una carrera elegida por Administración (enlaces con código)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.params = { career: "SW" }
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "administrador" } } as never)
    vi.mocked(getAcademicGovernance).mockResolvedValue(governance([{ id: "career-9", code: "SW" }, { id: "career-1", code: "RD" }]))
  })
  afterEach(() => vi.restoreAllMocks())

  it.each(["curriculum", "schedule", "teachers", "project", "subject"] as const)("%s recibe el identificador de la carrera del código", async (work) => {
    mount(work)
    await flush()
    expect(screen.getByTestId("work").textContent).toBe(`${work} career-9 SW`)
  })

  it("la dirección en minúsculas abre la carrera aunque su código esté en mayúsculas", async () => {
    route.params = { career: "sw" }
    mount("curriculum")
    await flush()
    expect(screen.getByTestId("work").textContent).toBe("curriculum career-9 sw")
  })

  it.each(["nope", "01a1c5bc-79ca-7331-8f0f-66d63f61c699"])("%s no es un código de carrera: 404", async (code) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    route.params = { career: code }
    mount("curriculum")
    await flush()
    expect(screen.getByTestId("not-found")).toBeInTheDocument()
  })

  it.each([
    ["curriculum", '[data-skeleton="curriculum-canvas"]'],
    ["schedule", '[data-skeleton="scheduled-subjects"]'],
    ["teachers", '[data-skeleton="teachers"]'],
    ["project", '[data-skeleton="accordion-row"]'],
    ["subject", '[data-skeleton="form-editor"]'],
  ] as const)("%s: mientras busca el código muestra su esqueleto, sin 404", async (work, selector) => {
    vi.mocked(getAcademicGovernance).mockImplementation(() => new Promise(() => undefined))
    const { container } = mount(work)
    await flush()
    expect(container.querySelector(selector)).not.toBeNull()
    expect(screen.queryByTestId("not-found")).toBeNull()
  })

  it("con una lista guardada que todavía no tiene el código espera la lista nueva antes de decidir", async () => {
    const client = createTestQueryClient()
    client.setQueryData(academicKeys.governance(), governance([{ id: "career-9", code: "SW-OLD" }]))
    mount("teachers", client)
    expect(screen.queryByTestId("not-found")).toBeNull()
    await flush()
    expect(screen.getByTestId("work").textContent).toBe("teachers career-9 SW")
  })

  it("una vez abierta, la pantalla no se pierde si el código deja de estar en la lista", async () => {
    const client = createTestQueryClient()
    mount("curriculum", client)
    await flush()
    vi.mocked(getAcademicGovernance).mockResolvedValue(governance([{ id: "career-9", code: "SW-NEW" }]))
    await act(() => client.refetchQueries({ queryKey: academicKeys.governance() }))
    await flush()
    expect(screen.getByTestId("work").textContent).toBe("curriculum career-9 SW")
  })

  it("si no se puede leer la lista ofrece reintentar, sin 404", async () => {
    vi.mocked(getAcademicGovernance).mockRejectedValue(new ApiError("Sin conexión", 503))
    mount("schedule")
    await flush()
    expect(document.body.textContent).toContain("Sin conexión")
    expect(screen.queryByTestId("not-found")).toBeNull()
  })
})
