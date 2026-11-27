// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join("src", "app", "globals.css"), "utf8").replace(/\s+/g, " ")

describe("flecha de las filas que se pueden pulsar", () => {
  it("se dibuja en la última celda visible de cada fila marcada, no en la que es solo para celular", () => {
    expect(css).toContain("table[data-slot='table'] > tbody > tr.cursor-pointer > :nth-last-child(1 of :not(.sm\\:hidden))::after,")
  })

  it("cada tabla que abre algo al pulsar una fila la marca con cursor-pointer", () => {
    const sources = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((path) => path.endsWith(".tsx") && !path.includes(".test."))
      .map((path) => ({ path, source: readFileSync(join("src", path), "utf8") }))
      .filter(({ source }) => source.includes("activateRow("))

    expect(sources.length).toBeGreaterThan(10)
    expect(sources.filter(({ source }) => !source.includes("cursor-pointer")).map(({ path }) => path)).toEqual([])
  })
})
