import { describe, expect, it } from "vitest"
import { requirementPath } from "@/components/domain/academic/curriculum/CurriculumRequirementEdge"
import { buildRequirementEdges, canvasMetrics, laneInset, subjectStep } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import type { CurriculumBuilderSubject } from "@/types/academic"

const subject = (id: string, cycle: number, position: number): CurriculumBuilderSubject =>
  ({ id, code: id, name: id, cycle, position, organization_unit: null, organization_unit_label: null }) as unknown as CurriculumBuilderSubject

const edgesFor = (subjects: CurriculumBuilderSubject[], pairs: Array<[string, string]>) => {
  const byId = new Map(subjects.map((item) => [item.id, item]))
  const requirements = pairs.map(([from, to], index) => ({ id: `r${index}`, subject_id: to, requirement_id: from }))

  return buildRequirementEdges(requirements, byId)
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

  it("dibuja toda relación como prerrequisito, incluso una guardada entre materias del mismo ciclo", () => {
    const [edge] = edgesFor([subject("A", 1, 0), subject("B", 1, 1)], [["A", "B"]])

    expect(edge!.ariaLabel).toBe("Prerrequisito: A → B")
    expect(edge!.style).toEqual({ stroke: "var(--curriculum-prerequisite)", strokeWidth: 2 })
    expect(edge!.markerStart).toBeUndefined()
    expect(edge!.data).toEqual({ label: "Prerrequisito", sourceOffset: expect.any(Number), targetOffset: expect.any(Number), channelIndex: expect.any(Number), channelCount: expect.any(Number) })
  })

  it("baja recta cuando origen y destino están en la misma columna de niveles seguidos", () => {
    const edges = edgesFor([subject("A", 1, 0), subject("B", 2, 0)], [["A", "B"]])

    expect(edges[0]!.data!.sourceOffset).toBe(edges[0]!.data!.targetOffset)
    expect(subjectStep).toBeGreaterThan(0)
  })
})

describe("medidas de la malla según el tamaño del texto", () => {
  it.each([[1, 165], [1.15, 189], [1.3, 214], [1.5, 247]])("con el texto a escala %s la tarjeta cabe y queda centrada en su fila", (scale, drawnCard) => {
    const { laneHeight, subjectHeight, subjectOffset } = canvasMetrics(scale)
    const below = laneHeight - laneInset - subjectOffset - subjectHeight

    expect(Math.abs(subjectHeight - drawnCard)).toBeLessThanOrEqual(3)
    expect(subjectOffset).toBeGreaterThanOrEqual(24)
    expect(Math.abs(below - subjectOffset)).toBeLessThanOrEqual(1)
  })

  it.each([1, 1.15, 1.5])("a escala %s las flechas cruzan por el hueco entre las tarjetas, sin pisarlas", (scale) => {
    const { laneHeight, subjectHeight, subjectOffset } = canvasMetrics(scale)
    const sourceY = subjectOffset + subjectHeight
    const targetY = laneHeight + subjectOffset

    for (let channelIndex = 0; channelIndex < 3; channelIndex += 1) {
      const [, , channelY] = requirementPath({ sourceX: 0, targetX: 300, sourceY, targetY, data: { label: "Prerrequisito", sourceOffset: 0, targetOffset: 0, channelIndex, channelCount: 3 } }, laneHeight - subjectHeight)
      expect(channelY).toBeGreaterThan(sourceY)
      expect(channelY).toBeLessThan(targetY)
    }
  })
})
