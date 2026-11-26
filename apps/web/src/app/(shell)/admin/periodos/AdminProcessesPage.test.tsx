import { act, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "@/lib/toast"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import AdminProcessesPage from "./AdminProcessesPage"

const api = vi.hoisted(() => ({ getAcademicGovernance: vi.fn(), getProcesses: vi.fn(), getSession: vi.fn(), getDashboard: vi.fn() }))
const stubs = vi.hoisted(() => ({ inlineSelect: false, stubOptions: false, rowChanged: null as ((message: string) => void) | null }))

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/academic", async (importOriginal) => ({ ...(await importOriginal<object>()), getAcademicGovernance: api.getAcademicGovernance }))
vi.mock("@/api/processes", async (importOriginal) => ({ ...(await importOriginal<object>()), getProcesses: api.getProcesses }))
vi.mock("@/api/session", () => ({ getSession: api.getSession }))
vi.mock("@/api/dashboard", () => ({ getDashboard: api.getDashboard }))
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock("@/components/domain/PageFrame", () => ({
  PageFrame: ({ title, banner, actions, children }: { title: string; banner?: ReactNode; actions?: ReactNode; children?: ReactNode }) => (
    <main>
      {banner}
      <h1>{title}</h1>
      {actions}
      {children}
    </main>
  ),
}))
vi.mock("@/components/domain/syllabus/ConvocationPeriodDialog", () => ({
  ConvocationPeriodDialog: ({ disabled }: { disabled?: boolean }) => <div data-period-dialog data-disabled={String(Boolean(disabled))} />,
}))
vi.mock("@/components/domain/syllabus/ConvocationRowActions", () => ({
  ConvocationRowActions: ({ onChanged }: { onChanged?: (message: string) => void }) => {
    stubs.rowChanged = onChanged ?? null
    return null
  },
}))
vi.mock("@/components/domain/syllabus/ConvocationOptionsDialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/domain/syllabus/ConvocationOptionsDialog")>()

  return { ConvocationOptionsDialog: (props: Parameters<typeof actual.ConvocationOptionsDialog>[0]) => (stubs.stubOptions ? null : <actual.ConvocationOptionsDialog {...props} />) }
})
vi.mock("@/components/ui/select", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/select")>()
  const inline = <P extends { children?: ReactNode },>(Original: (props: P) => ReactNode) =>
    function Inline(props: P) {
      return stubs.inlineSelect ? <div>{props.children}</div> : <Original {...props} />
    }

  return {
    ...actual,
    Select: inline(actual.Select),
    SelectTrigger: inline(actual.SelectTrigger),
    SelectContent: inline(actual.SelectContent),
    SelectGroup: inline(actual.SelectGroup),
    SelectValue: (props: Parameters<typeof actual.SelectValue>[0]) => (stubs.inlineSelect ? null : <actual.SelectValue {...props} />),
    SelectItem: (props: Parameters<typeof actual.SelectItem>[0]) =>
      stubs.inlineSelect ? (
        <div data-option data-value={props.value}>
          {props.children}
        </div>
      ) : (
        <actual.SelectItem {...props} />
      ),
  }
})

const period = (id: string, code: string, process: { id: string; state: "abierto" | "pausado" | "cerrado" } | null, lockReason: string | null = null) => ({
  id, code, starts_on: "2026-09-29", ends_on: "2027-03-01", teaching_weeks: 23, status: "en_curso", status_label: "En curso", institutional_process: process, lock_reason: lockReason,
})
const processOf = (state: "abierto" | "cerrado") => ({ id: "pr1", name: "Convocatoria", state, template: "x", period_id: "p1", period_name: "Septiembre-Marzo 2026-2027", starts_at: "2026-10-01", due_at: "2026-10-20", convocations_count: 0, configurable: true, deletable: true, extensions_used: 0, extensions_max: 2, extension_limit_on: "2027-03-31", extension_block_reason: null })
const closedProcess = processOf("cerrado")

const mountPage = () => renderWithProviders(<AdminProcessesPage />)
const periodDialog = (container: HTMLElement) => container.querySelector("[data-period-dialog]")!

beforeEach(() => {
  navigation.reset("/admin/periodos")
  api.getDashboard.mockResolvedValue({ metrics: [], setup: null, deadline: null, coordination_convocation: null })
})
afterEach(() => {
  document.body.innerHTML = ""
  vi.clearAllMocks()
  stubs.inlineSelect = false
  stubs.stubOptions = false
  stubs.rowChanged = null
})

describe("AdminProcessesPage", () => {
  it("muestra una fila por periodo, abierto o no", async () => {
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.getAcademicGovernance.mockResolvedValue({ lock_reason: null, catalogs: { faculties: [], careers: [], periods: [
      period("p1", "Septiembre-Marzo 2026-2027", { id: "pr1", state: "abierto" }), period("p2", "Abril-Agosto 2027", null),
    ] }, options: {} })
    api.getProcesses.mockResolvedValue({ processes: [processOf("abierto")], template: null, periods: [], active_process: null })
    const { container, unmount } = mountPage()
    await flush()

    const rows = [...container.querySelectorAll("tbody tr")]
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain("Abierto")
    expect(rows[1]!.textContent).toContain("Sin iniciar")
    expect(rows[1]!.textContent).toContain("Sin fechas")
    expect(container.textContent).not.toContain("Periodo académico en curso")
    expect(periodDialog(container).getAttribute("data-disabled")).toBe("true")
    unmount()
  })

  it("ordena por período al pulsar el encabezado y marca aria-sort en esa columna", async () => {
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.getAcademicGovernance.mockResolvedValue({ lock_reason: null, catalogs: { faculties: [], careers: [], periods: [
      { ...period("p1", "Septiembre-Marzo 2026-2027", null), starts_on: "2026-09-29" }, { ...period("p2", "Abril-Agosto 2026", null), starts_on: "2026-04-01" },
    ] }, options: {} })
    api.getProcesses.mockResolvedValue({ processes: [], template: null, periods: [], active_process: null })
    const { container, getByRole, unmount } = mountPage()
    await flush()
    const codes = () => [...container.querySelectorAll("tbody tr td:first-child button")].map((cell) => cell.textContent)

    expect(codes()).toEqual(["Septiembre-Marzo 2026-2027", "Abril-Agosto 2026"])
    fireEvent.click(getByRole("button", { name: "Período" }))

    expect(codes()).toEqual(["Abril-Agosto 2026", "Septiembre-Marzo 2026-2027"])
    expect(getByRole("columnheader", { name: "Período" }).getAttribute("aria-sort")).toBe("ascending")
    expect(getByRole("columnheader", { name: "Clases" }).hasAttribute("aria-sort")).toBe(false)
    unmount()
  })

  it("muestra arriba los indicadores y deja «Nuevo periodo académico» deshabilitada", async () => {
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.getAcademicGovernance.mockResolvedValue({ lock_reason: null, catalogs: { faculties: [], careers: [], periods: [] }, options: {} })
    api.getProcesses.mockResolvedValue({ processes: [], template: null, periods: [], active_process: null })
    const step = (key: string, done: boolean) => ({ key, label: `Paso ${key}`, hint: `Pista ${key}`, done, action: null })
    api.getDashboard.mockResolvedValue({
      metrics: [{ key: "careers_without_convocation", label: "Carreras sin abrir", value: 3, suffix: null, hint: "Pista" }],
      setup: { title: "Antes de empezar", intro: "", done: 1, total: 6, steps: [step("faculties", true), step("careers", false), step("accounts", false), step("coordinators", false), step("template", false), step("process", false)] },
      deadline: null, coordination_convocation: null,
    })
    const { container } = mountPage()
    await flush()

    expect(container.textContent).toContain("Carreras sin abrir")
    expect(periodDialog(container).getAttribute("data-disabled")).toBe("true")
  })

  it("con todo finalizado permite abrir una nuevo periodo académico", async () => {
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.getAcademicGovernance.mockResolvedValue({ lock_reason: "Periodo académico cerrado", catalogs: { faculties: [], careers: [], periods: [period("p1", "Septiembre-Marzo 2026-2027", { id: "pr1", state: "cerrado" })] }, options: {} })
    api.getProcesses.mockResolvedValue({ processes: [closedProcess], template: null, periods: [], active_process: null })
    const { container, unmount } = mountPage()
    await flush()

    expect(container.querySelector("tbody tr")!.textContent).toContain("Finalizado")
    expect(container.textContent).not.toContain("Cerrado")
    expect(container.textContent).not.toContain("Periodo académico en curso")
    expect(periodDialog(container).getAttribute("data-disabled")).toBe("false")
    unmount()
  })

  it("el filtro de estado llama «Finalizados» a los periodos académicos cerrados", async () => {
    stubs.inlineSelect = true
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.getAcademicGovernance.mockResolvedValue({ lock_reason: null, catalogs: { faculties: [], careers: [], periods: [period("p1", "Septiembre-Marzo 2026-2027", { id: "pr1", state: "cerrado" })] }, options: {} })
    api.getProcesses.mockResolvedValue({ processes: [closedProcess], template: null, periods: [], active_process: null })
    const { container, unmount } = mountPage()
    await flush()

    expect(container.querySelector('[data-option][data-value="cerrado"]')!.textContent).toBe("Finalizados")
    expect([...container.querySelectorAll("[data-option]")].map((option) => option.textContent)).not.toContain("Cerrados")
    unmount()
  })

  it("al prorrogar un periodo académico finalizado avisa con el mensaje del servidor y vuelve a cargar la lista", async () => {
    stubs.stubOptions = true
    api.getSession.mockResolvedValue({ active_role: { code: "administrador" } })
    api.getAcademicGovernance.mockResolvedValue({ lock_reason: null, catalogs: { faculties: [], careers: [], periods: [period("p1", "Septiembre-Marzo 2026-2027", { id: "pr1", state: "cerrado" })] }, options: {} })
    api.getProcesses.mockResolvedValue({ processes: [closedProcess], template: null, periods: [], active_process: null })
    const { container, unmount } = mountPage()
    await flush()

    fireEvent.click(container.querySelector("tbody tr")!)
    await flush()
    await act(async () => {
      stubs.rowChanged?.("Plazo prorrogado. El periodo académico se volvió a abrir.")
    })
    await flush()

    expect(toast.success).toHaveBeenCalledWith("Plazo prorrogado. El periodo académico se volvió a abrir.")
    expect(api.getProcesses).toHaveBeenCalledTimes(2)
    unmount()
  })
})
