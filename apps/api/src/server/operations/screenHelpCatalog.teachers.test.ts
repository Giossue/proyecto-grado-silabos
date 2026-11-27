// @vitest-environment node
import { describe, expect, it } from "vitest"
import catalog from "./screenHelpCatalog.json"

describe("screen help about the career project of a subject", () => {
  it("names the preview and save buttons as the screen does", () => {
    const text = JSON.stringify(catalog)
    expect(text).toContain("«Vista previa» muestra cómo recibirá el sílabo el docente. Pulse «Guardar información» antes de salir")
    expect(text).not.toMatch(/El ojo muestra cómo recibirá|Guardar proyecto de carrera/)
  })
})

describe("screen help about career teachers", () => {
  it("explains deactivating and reactivating, never removing from the career", () => {
    const texts = [...JSON.stringify(catalog).matchAll(/Pulse un docente[^"]*/g)].map(([text]) => text)
    expect(texts).toHaveLength(2)
    for (const text of texts) {
      expect(text).toContain("desactivarlo o reactivarlo")
      expect(text).toContain("«Inactivo»")
      expect(text).not.toMatch(/quitar/i)
    }
  })
})

const CAREER_PROJECT_SCREENS = [
  "/coordinacion/proyecto-carrera",
  "/admin/carreras/:career/proyecto-carrera",
  "/coordinacion/proyecto-carrera/:malla/:subject",
  "/admin/carreras/:career/proyecto-carrera/:malla/:subject",
] as const

describe("screen help about who fills each field", () => {
  it("never names removed controls in the template or the career project", () => {
    for (const path of ["/admin/plantilla", ...CAREER_PROJECT_SCREENS] as const) {
      expect(JSON.stringify(catalog[path])).not.toMatch(/editable|Se puede editar|Acciones masivas|Restaurar texto original|El docente puede editar este texto|El docente llena esta tabla|Usar el texto de la plantilla|Que lo escriba el docente|«Elegir una» o/i)
    }
  })

  it("describes the three choices of «¿Quién lo llena?» on the template screen", () => {
    const text = JSON.stringify(catalog["/admin/plantilla"])
    for (const name of ["«¿Quién lo llena?»", "«Nadie (texto fijo)»", "«Coordinación»", "«Solo el docente»"]) expect(text).toContain(name)
  })

  it("says which fields the career project lists and how the teacher sees the rest", () => {
    for (const path of CAREER_PROJECT_SCREENS) {
      const text = JSON.stringify(catalog[path])
      expect(text).toContain("«¿Quién lo llena?»")
      expect(text).toContain("«Solo el docente»")
      expect(text).toContain("«Bloqueado»")
    }
  })
})
