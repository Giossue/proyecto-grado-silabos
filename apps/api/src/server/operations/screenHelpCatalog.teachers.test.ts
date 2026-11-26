// @vitest-environment node
import { describe, expect, it } from "vitest"
import catalog from "./screenHelpCatalog.json"

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
