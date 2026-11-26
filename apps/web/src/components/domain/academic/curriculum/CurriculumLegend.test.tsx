import { describe, expect, it } from "vitest"
import { CurriculumLegend } from "@/components/domain/academic/curriculum/CurriculumLegend"
import { renderWithProviders } from "@/test/render"

describe("CurriculumLegend", () => {
  it("solo explica el prerrequisito como relación entre materias", () => {
    const { container } = renderWithProviders(<CurriculumLegend units={[]} rows={[]} />)

    expect([...container.querySelectorAll("dd")].map((item) => item.textContent)).toEqual(["Prerrequisito"])
    expect(container.innerHTML).not.toMatch(/correquisito|corequisite/i)
  })
})
