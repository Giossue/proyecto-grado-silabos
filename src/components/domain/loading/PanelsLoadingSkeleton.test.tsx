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

  it.each([
    ["profile", true, 2, false],
    ["profile", false, 2, true],
    ["security", false, 3, true],
  ] as const)("dibuja el ajuste %s (solo lectura: %s) con %i campos y guardar: %s", (settingsSection, readonly, fields, save) => {
    const { container } = render(<LoadingSkeleton variant="settings" settingsSection={settingsSection} readonly={readonly} />)

    expect(container.querySelectorAll('[data-skeleton="settings-field"]')).toHaveLength(fields)
    expect(container.querySelector('[data-skeleton="settings-save"]') !== null).toBe(save)
    expect(container.querySelector('[data-skeleton="settings-two-factor"]') !== null).toBe(settingsSection === "security")
  })

  it("dibuja la malla por niveles con sus materias, sin controles enfocables", () => {
    const { container } = render(<LoadingSkeleton variant="academic-structure" mode="curriculum" />)

    expect(container.querySelectorAll('[data-skeleton="curriculum-level"]').length).toBeGreaterThan(1)
    expect(container.querySelectorAll('[data-skeleton="curriculum-subject"]').length).toBeGreaterThan(1)
    expect(container.querySelector("button")).toBeNull()
  })

  it.each([
    ["schedule", "scheduled-subjects", 3],
    ["teachers", "teachers", 1],
  ] as const)("dibuja la tabla del modo %s con sus filtros", (mode, marker, filters) => {
    const { container } = render(<LoadingSkeleton variant="academic-structure" mode={mode} rows={2} />)

    expect(container.querySelector(`[data-skeleton="${marker}"]`)).not.toBeNull()
    expect(container.querySelectorAll('[data-skeleton="table-filters"] [data-slot="skeleton"]')).toHaveLength(filters)
  })
})
