import { describe, expect, it } from "vitest"
import { drawnInDocument, shownInCard } from "./teacherFormation"

describe("teacher fields shown in the identification card", () => {
  it("draws the campus, the corequisites and the formation inside the card, not as their own block", () => {
    for (const key of ["nombre_campus", "correquisitos_asignatura", "formacion_docente"]) {
      expect(shownInCard({ key })).toBe(true)
      expect(drawnInDocument({ key })).toBe(false)
    }
    expect(drawnInDocument({ key: "descripcion" })).toBe(true)
    expect(drawnInDocument({ key: null })).toBe(true)
  })
})
