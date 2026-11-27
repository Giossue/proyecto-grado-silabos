import { describe, expect, it } from "vitest"
import { rowButtonClass, rowLinkClass } from "./rowActivation"

const underlineRules = (classes: string): string[] => classes.split(/\s+/).filter((token) => token === "underline" || token.endsWith(":underline"))

describe("enlaces de una fila", () => {
  it.each([
    ["enlace", rowLinkClass],
    ["botón con aspecto de enlace", rowButtonClass],
  ])("el %s se subraya solo con el cursor o el foco sobre él, no con el cursor en otra parte de la fila", (_kind, classes) => {
    expect(underlineRules(classes)).toEqual(["hover:underline", "focus-visible:underline"])
  })
})
