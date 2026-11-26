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

describe("screen help about bulk actions in the career project", () => {
  it("explains both bulk actions on the coordination and administration lists", () => {
    for (const path of ["/coordinacion/proyecto-carrera", "/admin/estructura-academica/carreras/:career/proyecto-carrera"] as const) {
      const text = JSON.stringify(catalog[path])
      expect(text).toContain("«Acciones masivas»")
      expect(text).toContain("«Usar el texto de la plantilla»")
      expect(text).toContain("«Que lo escriba el docente»")
      expect(text).toContain("los que ya están definidos no cambian")
    }
  })
})
