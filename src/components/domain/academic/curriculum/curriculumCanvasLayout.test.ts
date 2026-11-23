import { describe, expect, it } from "vitest"
import { buildRequirementEdges, subjectStep } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import type { CurriculumBuilderSubject } from "@/types/academic"

const subject = (id: string, cycle: number, position: number): CurriculumBuilderSubject =>
  ({ id, code: id, name: id, cycle, position, organization_unit: null, organization_unit_label: null }) as unknown as CurriculumBuilderSubject

const edgesFor = (subjects: CurriculumBuilderSubject[], pairs: Array<[string, string]>) => {
  const byId = new Map(subjects.map((item) => [item.id, item]))
  const requirements = pairs.map(([from, to], index) => ({ id: `r${index}`, subject_id: to, requirement_id: from, type: "prerrequisito" as const }))

  return buildRequirementEdges(requirements, subjects, byId)
}

describe("trazado de relaciones de la malla", () => {
  it("separa en abscisa la bajada y la subida que caen en la misma columna del mismo hueco", () => {
    const edges = edgesFor([subject("A", 1, 0), subject("C", 1, 1), subject("X", 2, 0), subject("B", 2, 1), subject("D", 2, 2)], [["A", "B"], ["C", "D"]])
    const [toB, fromC] = edges.map((edge) => edge.data!)

    expect(toB!.targetOffset).toBeLessThan(fromC!.sourceOffset)
    expect(toB!.channelIndex).not.toBe(fromC!.channelIndex)
    expect(toB!.channelCount).toBe(2)
  })

  it("elige el orden de carriles que evita cruces cuando existe uno", () => {
    const edges = edgesFor([subject("A", 1, 0), subject("B", 1, 1), subject("X", 2, 0), subject("Y", 2, 1), subject("C", 2, 2)], [["A", "C"], ["B", "C"]])
    const [aToC, bToC] = edges.map((edge) => edge.data!)

    expect(aToC!.targetOffset).toBeLessThan(bToC!.targetOffset)
    expect(bToC!.channelIndex).toBeLessThan(aToC!.channelIndex)
  })

  it("baja recta cuando origen y destino están en la misma columna de niveles seguidos", () => {
    const edges = edgesFor([subject("A", 1, 0), subject("B", 2, 0)], [["A", "B"]])

    expect(edges[0]!.data!.sourceOffset).toBe(edges[0]!.data!.targetOffset)
    expect(subjectStep).toBeGreaterThan(0)
  })
})
