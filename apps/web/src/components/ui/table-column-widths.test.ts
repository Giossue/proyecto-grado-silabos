// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join("src", "app", "globals.css"), "utf8").replace(/\s+/g, " ")

describe("ancho de las columnas en las tablas de listas", () => {
  it("las columnas que no son la principal se ajustan a su contenido", () => {
    expect(css).toContain("table[data-slot='table'][data-cards='true'] > tbody > tr > td[data-card-role]:not([data-card-role='title']) { width: 1%; white-space: nowrap; }")
  })

  it("las de texto largo conservan un ancho cómodo y parten en líneas", () => {
    expect(css).toContain("td[data-card-role='data'][data-card-wide='true'] { min-width: 16rem; white-space: normal; }")
  })
})
