// @vitest-environment node
import { describe, expect, it } from "vitest"
import catalog from "./screenHelpCatalog.json"

describe("screen help about seeing one malla at a time", () => {
  it.each(["/coordinacion/malla", "/admin/carreras/:career/malla"] as const)("%s explains the list over the malla, also while editing", (path) => {
    for (const part of ["Se ve una malla a la vez", "«Nueva malla»", "mientras edita", "el sistema le pregunta antes de pasar a otra"]) expect(catalog[path].content, part).toContain(part)
  })

  it.each(["/coordinacion/materias-asignaciones", "/admin/carreras/:career/materias-asignaciones"] as const)("%s explains the list, what switching clears and how a parallel is chosen", (path) => {
    for (const part of ["Se ve una malla a la vez", "Al cambiar de malla se quitan la búsqueda, los filtros y lo marcado", "El paralelo se elige de una lista", "conserva su código"]) {
      expect(catalog[path].content, part).toContain(part)
    }
    expect(catalog[path].content).not.toContain("Todas las mallas")
  })

  it.each(["/coordinacion/proyecto-carrera", "/admin/carreras/:career/proyecto-carrera"] as const)("%s says its subjects and counters are those of the chosen malla", (path) => {
    for (const part of ["Se ve una malla a la vez", "los ciclos, las materias y los contadores son de esa malla", "Al volver de una materia sigue en la misma"]) {
      expect(catalog[path].content, part).toContain(part)
    }
  })

  it.each(["/coordinacion/proyecto-carrera/:malla/:subject", "/admin/carreras/:career/proyecto-carrera/:malla/:subject"] as const)("%s says the subject list stays in the malla", (path) => {
    expect(catalog[path].content).toContain("«Cambiar de materia» ofrece las materias de la misma malla")
  })
})
