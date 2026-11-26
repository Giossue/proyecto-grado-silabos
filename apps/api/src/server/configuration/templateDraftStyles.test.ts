// @vitest-environment node
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import draftGolden from "./__fixtures__/draft-golden.json"
import { canonicalJson } from "../documents/canonicalJson"
import type { PhpRecord } from "./phpValues"
import { DraftRequest, prepareDraft, toRuntime } from "./templateDraft"
import { TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { goldenTemplate } from "./testing"

const cases = draftGolden as Record<string, { payload: PhpRecord }>
const official = cases.official!.payload

const draftOf = (payload: unknown, current: TemplateDefinition = goldenTemplate().definition): DraftRequest =>
  new DraftRequest(prepareDraft(toRuntime(payload) as PhpRecord), current)

const definitionOf = (payload: unknown): TemplateDefinition => draftOf(payload).definition()

const fingerprint = (payload: unknown): string => {
  try {
    return createHash("sha256").update(canonicalJson(definitionOf(payload))).digest("hex")
  } catch (error) {
    if (error instanceof TemplateValidationError) return `error: ${JSON.stringify(error.errors)}`
    throw error
  }
}

const styles = {
  paper: "a4",
  orientation: "landscape",
  font_family: "Georgia",
  line_height: 1.5,
  paragraph_spacing_pt: 12,
  colors: { text: "#112233", title: "#445566", table_header_background: "#ddeeff", table_header_text: null, table_border: "#778899", empty_text: "#999999" },
  title: { bold: false, italic: true, alignment: "right" },
  section_title: { bold: false, italic: true, alignment: "center" },
  body: { alignment: "justify" },
  empty_text: "  Sin información  ",
}

describe("version-1 draft with document styles", () => {
  it("puts the styles in the definition document, keeping layout, title, header and choices", () => {
    const current = goldenTemplate().definition.document as PhpRecord
    const document = definitionOf({ ...official, document: styles }).document as unknown as PhpRecord

    expect(document).toMatchObject({
      paper: "a4",
      orientation: "landscape",
      font_family: "Georgia",
      line_height: 1.5,
      paragraph_spacing_pt: 12,
      margin_cm: 2.5,
      sizes: { title: 16, section: 12, body: 11 },
      colors: { text: "#112233", title: "#445566", table_header_background: "#DDEEFF", table_header_text: null, table_border: "#778899", empty_text: "#999999" },
      title: { text: "Sílabo de prueba", bold: false, italic: true, alignment: "right" },
      section_title: { bold: false, italic: true, alignment: "center" },
      body: { alignment: "justify" },
      empty_text: "Sin información",
    })
    expect(document.header).toEqual(current.header)
    expect(document.choices).toEqual(current.choices)
  })

  it("changes only the styles it carries", () => {
    const before = definitionOf(official).document as unknown as PhpRecord
    const after = definitionOf({ ...official, document: { colors: { title: "#AA0000" }, title: { italic: true } } }).document as unknown as PhpRecord

    expect(after).toEqual({ ...before, colors: { ...(before.colors as PhpRecord), title: "#AA0000" }, title: { ...(before.title as PhpRecord), italic: true } })
  })

  it("gives the same definition when the builder sends back the styles it already had", () => {
    const current = goldenTemplate().definition.document as PhpRecord
    const title = current.title as PhpRecord
    const unchanged = {
      paper: current.paper,
      orientation: current.orientation,
      font_family: current.font_family,
      line_height: current.line_height,
      paragraph_spacing_pt: current.paragraph_spacing_pt,
      colors: current.colors,
      title: { bold: title.bold, italic: title.italic, alignment: title.alignment },
      section_title: current.section_title,
      body: current.body,
      empty_text: current.empty_text,
    }

    expect(definitionOf({ ...official, document: unchanged })).toEqual(definitionOf(official))
  })

  it("accepts the Spanish payload keys of the JSON import", () => {
    const document = definitionOf({ ...official, documento: { papel: "legal" } }).document as unknown as PhpRecord

    expect(document.paper).toBe("legal")
  })

  it.each([
    [{ paper: "a3" }, "«document.paper»: use letter, a4, legal."],
    [{ font_family: "Comic Sans" }, "«document.font_family»: use Arial, Calibri, Times New Roman, Verdana, Georgia."],
    [{ line_height: 4 }, "«document.line_height»: debe ser un número entre 1 y 3."],
    [{ paragraph_spacing_pt: -1 }, "«document.paragraph_spacing_pt»: debe ser un número entre 0 y 36."],
    [{ colors: { text: "red" } }, "«document.colors.text»: debe ser un color #RRGGBB."],
    [{ title: { bold: "sí" } }, "«document.title.bold»: debe ser true o false."],
    [{ section_title: { alignment: "middle" } }, "«document.section_title.alignment»: use left, center, right, justify."],
    [{ empty_text: "x".repeat(121) }, "«document.empty_text»: debe ser un texto de hasta 120 caracteres."],
    [{ margin_cm: 3 }, "Clave desconocida en «document»: «margin_cm»."],
    [{ header: { logos: [] } }, "Clave desconocida en «document»: «header»."],
  ])("rejects %j with a Spanish error", async (document, message) => {
    expect(await draftOf({ ...official, document }).errors()).toEqual({ definition: [message] })
  })
})

describe("version-1 drafts without document styles", () => {
  const legacy = Object.entries(cases).filter(([, golden]) => (golden.payload as PhpRecord).version === 1)

  it.each(legacy)("builds the same definition as before for the «%s» draft", (name, golden) => {
    expect(fingerprint(golden.payload)).toMatchSnapshot()
  })
})
