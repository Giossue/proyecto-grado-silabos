import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"

describe("esqueletos de paneles, ajustes y estructura académica", () => {
  it("marca el primer paso de la puesta en marcha con su acción y deja un indicador en los demás", () => {
    const { container } = render(<LoadingSkeleton variant="setup" />)
    const steps = Array.from(container.querySelector('[data-skeleton="setup"]')!.querySelectorAll<HTMLElement>(".rounded-md.p-2"))

    expect(steps).toHaveLength(5)
    expect(steps[0]?.classList.contains("ring-1")).toBe(true)
    expect(Array.from(steps[0]!.querySelectorAll('[data-slot="skeleton"]')).some((item) => item.classList.contains("h-8"))).toBe(true)
    expect(steps.slice(1).every((step) => !step.classList.contains("ring-1") && step.querySelector(".size-3") !== null)).toBe(true)
  })

  it("dibuja el perfil solo para consulta: cabecera fija, 2 campos, su ayuda y sin guardar ni flecha de acordeón", () => {
    const { container } = render(<LoadingSkeleton variant="settings" settingsSection="profile" />)

    expect(container.querySelector('[data-skeleton="settings-profile-header"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-skeleton="settings-field"]')).toHaveLength(2)
    expect(container.querySelector('[data-skeleton="settings-identity-help"]')).not.toBeNull()
    expect(container.querySelector('[data-skeleton="settings-save"]')).toBeNull()
    expect(container.querySelector('[data-skeleton="settings-accordion-item"]')).toBeNull()
  })

  it("dibuja la malla por niveles con sus materias, sin controles enfocables", () => {
    const { container } = render(<LoadingSkeleton variant="academic-structure" mode="curriculum" />)

    expect(container.querySelectorAll('[data-skeleton="curriculum-level"]').length).toBeGreaterThan(1)
    expect(container.querySelectorAll('[data-skeleton="curriculum-subject"]').length).toBeGreaterThan(1)
    expect(container.querySelector("button")).toBeNull()
    // Like the page: the malla selector sits over the board, and zoom, help and legend make five canvas buttons.
    const board = container.querySelector('[data-skeleton="curriculum-board"]')!
    expect(board.firstElementChild!.getAttribute("data-skeleton")).toBe("curriculum-selector")
    expect(board.querySelectorAll('[data-skeleton="curriculum-level"]').length).toBeGreaterThan(1)
    expect(container.querySelector('[data-skeleton="curriculum-controls"]')!.children).toHaveLength(5)
    // The malla has no floating legend: it opens from the canvas buttons.
    expect(container.querySelector(".top-3.right-3")).toBeNull()
  })

  it.each([
    ["schedule", "scheduled-subjects", 3],
    ["teachers", "teachers", 1],
  ] as const)("dibuja la tabla del modo %s con sus filtros", (mode, marker, filters) => {
    const { container } = render(<LoadingSkeleton variant="academic-structure" mode={mode} rows={2} />)

    expect(container.querySelector(`[data-skeleton="${marker}"]`)).not.toBeNull()
    expect(container.querySelectorAll('[data-skeleton="table-filters"] [data-slot="skeleton"]')).toHaveLength(filters)
  })

  it("en materias y asignaciones el desplegable de malla va sobre la búsqueda; en docentes no hay", () => {
    const schedule = render(<LoadingSkeleton variant="academic-structure" mode="schedule" rows={2} />)
    const marker = schedule.container.querySelector('[data-skeleton="scheduled-subjects"]')!
    expect(marker.firstElementChild!.getAttribute("data-skeleton")).toBe("malla-selector")
    expect(marker.querySelector('[data-skeleton="table-toolbar"]')).not.toBeNull()
    schedule.unmount()

    const teachers = render(<LoadingSkeleton variant="academic-structure" mode="teachers" rows={2} />)
    expect(teachers.container.querySelector('[data-skeleton="malla-selector"]')).toBeNull()
  })
})
