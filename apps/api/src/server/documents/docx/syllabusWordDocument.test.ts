// @vitest-environment node
import { createHash } from "node:crypto"
import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import golden from "../__fixtures__/laravel-word-golden.json"
import type { PhpRecord } from "../../configuration/phpValues"
import textGolden from "../__fixtures__/laravel-text-pdf-golden.json"
import { renderDocx, renderSyllabusDocuments, validateBundle, type DocumentBundle, type DocumentRenderInput } from "../syllabusRenderer"
import { imageInfo, InvalidImage } from "./imageInfo"
import { columnWidths } from "./tableGrid"

type GoldenCase = (typeof golden.cases)[number]

function replaceRecursive(base: PhpRecord, replacement: PhpRecord): PhpRecord {
  const merged: PhpRecord = { ...base }
  for (const [key, value] of Object.entries(replacement)) {
    const current = merged[key]
    merged[key] =
      value !== null && typeof value === "object" && !Array.isArray(value) && current !== null && typeof current === "object" && !Array.isArray(current)
        ? replaceRecursive(current as PhpRecord, value as PhpRecord)
        : value
  }
  return merged
}

function inputOf(testCase: Pick<GoldenCase, "document" | "snapshot">, snapshot: PhpRecord = {}): DocumentRenderInput {
  const overrides = testCase.document as PhpRecord
  const document = replaceRecursive(golden.definition.document as PhpRecord, overrides)
  if ("header" in overrides) document.header = overrides.header
  return {
    subject: "Biología",
    subjectCode: "C2",
    academicPeriod: "2026-2",
    revisionNumber: 2,
    revisionFingerprint: "ab".repeat(32),
    generatedAt: "2026-11-24T15:30:00+00:00",
    locale: "es-EC",
    snapshot: { ...(testCase.snapshot as PhpRecord), template_definition: { ...golden.definition, document }, template_variables: golden.template_variables, ...snapshot },
  }
}

async function partsOf(docx: Buffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(docx)
  const parts: Record<string, string> = {}
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) parts[name] = createHash("sha256").update(await entry.async("nodebuffer")).digest("hex")
  }
  return Object.fromEntries(Object.entries(parts).sort(([left], [right]) => (left < right ? -1 : 1)))
}

async function documentXml(docx: Buffer): Promise<string> {
  return (await JSZip.loadAsync(docx)).file("word/document.xml")?.async("string") as Promise<string>
}

const noLogos = async () => null
const plantilla = golden.cases[0]

describe("Word document like PhpWordDocumentRenderer", () => {
  it.each(golden.cases.map((testCase) => [testCase.name, testCase] as const))("%s: every DOCX part matches Laravel byte for byte", async (_name, testCase) => {
    expect(await partsOf(await renderDocx(inputOf(testCase), noLogos))).toEqual(testCase.parts)
  })

  it("renders the same DOCX twice", async () => {
    const input = inputOf(plantilla)
    expect(await renderDocx(input, noLogos)).toEqual(await renderDocx(input, noLogos))
  })

  it("prints the three signature stamps, has no page numbers and keeps the revision fingerprint out", async () => {
    const xml = await documentXml(await renderDocx(inputOf(plantilla), noLogos))
    for (const name of ["ANA PEREZ · Docente", "LUCIA BIBLIOTECA · Biblioteca", "CARLOS COORDINADOR · Coordinación"]) expect(xml).toContain(`Firmado electrónicamente por ${name} · 24-11-2026 10:15`)
    expect(xml).not.toContain("Página")
    expect(xml).not.toContain("ab".repeat(16))
  })

  it("switches page orientation with a section break and keeps the last section properties at the end", async () => {
    const xml = await documentXml(await renderDocx(inputOf(plantilla), noLogos))
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(3)
    expect(xml).toContain('<w:pgSz w:orient="landscape" w:w="15840" w:h="12240"/>')
    expect(xml.endsWith('<w:cols w:num="1" w:space="720"/></w:sectPr></w:body></w:document>\n')).toBe(true)
  })

  it("uses the stored logo files when the snapshot has no usable copy", async () => {
    const asked: string[] = []
    const png = Buffer.from(plantilla.snapshot.logos.faculty, "base64")
    const docx = await renderDocx(inputOf(plantilla, { logos: { institution: "", faculty: "no es base64!" } }), async (source, facultyId) => {
      asked.push(`${source}:${facultyId}`)
      return { bytes: png, key: `/logos/${source}.png` }
    })
    expect(asked).toEqual(["institution:f0000000-0000-4000-8000-000000000001", "faculty:f0000000-0000-4000-8000-000000000001"])
    const zip = await JSZip.loadAsync(docx)
    expect(Object.keys(zip.files).filter((name) => name.startsWith("word/media/"))).toEqual(["word/media/section_image1.png", "word/media/section_image2.png"])
  })

  it("leaves the logo table out when no logo is available", async () => {
    const xml = await documentXml(await renderDocx(inputOf(plantilla, { logos: null }), noLogos))
    expect(xml).not.toContain("<w:pict>")
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document')).toBe(true)
    expect(xml).toContain('<w:body><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr>')
  })

  it("renders snapshots without a frozen template and legacy blocks natively, like SyllabusWordDocument and WordFieldRenderer", async () => {
    expect(await documentXml(await renderDocx(inputOf(plantilla, { template_definition: null }), noLogos))).toContain("<w:document")
    const legacy = {
      sections: [
        {
          key: "x",
          title: "X",
          blocks: [
            { title: "Primero", fields: [{ key: "k", label: "Campo", value: "línea uno\n- viñeta" }] },
            { title: "Segundo", fields: [{ key: "v", value: "" }] },
          ],
        },
      ],
    }
    const xml = await documentXml(await renderDocx(inputOf(plantilla, legacy), noLogos))
    expect(xml).toContain("Campo")
    expect(xml).toContain("línea uno")
    expect(xml).toMatch(/<w:numPr><w:numId w:val="2"\/><w:ilvl w:val="0"\/><\/w:numPr>[\s\S]*?viñeta/)
  })

  it("gives a plain table header the document header background and bold, like a header styled with them", async () => {
    const header = (text: string, attrs: PhpRecord) => ({
      type: "table",
      content: [{ type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1, rowspan: 1, ...attrs }, content: [{ type: "paragraph", content: [{ type: "text", text }] }] }] }],
    })
    const sections = [
      {
        key: "tablas",
        title: "Tablas",
        orientation: "portrait",
        fields: [
          {
            definition_id: "01a1c5ba-0000-7000-8000-000000000099",
            key: "tablas",
            label: "",
            quien_llena: "institucional",
            document: { type: "doc", content: [header("Estilado", { backgroundColor: "#C3D4EA", bold: true }), header("Simple", { backgroundColor: null, bold: null })] },
          },
        ],
      },
    ]
    const xml = await documentXml(await renderDocx(inputOf(plantilla, { sections }), noLogos))
    const cellOf = (text: string) => (xml.match(new RegExp(`<w:tc>(?:(?!<w:tc>).)*?${text}.*?</w:tc>`)) ?? [""])[0].replace(text, "TEXTO")
    const styled = cellOf("Estilado")
    expect(styled).toContain('w:fill="C3D4EA"')
    expect(styled).toContain('<w:b w:val="1"/>')
    expect(golden.definition.document.colors.text).toBe(golden.definition.document.colors.table_header_text)
    expect(cellOf("Simple").replace('<w:color w:val="000000"/>', "")).toBe(styled)
  })

  it("keeps a plain table header normal weight when the document has no header background", async () => {
    const sections = [
      {
        key: "tablas",
        title: "Tablas",
        orientation: "portrait",
        fields: [
          {
            definition_id: "01a1c5ba-0000-7000-8000-000000000099",
            key: "tablas",
            label: "",
            quien_llena: "institucional",
            document: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Simple" }] }] }] }] }] },
          },
        ],
      },
    ]
    const input = inputOf({ document: { colors: { table_header_background: null, table_header_text: null } }, snapshot: plantilla.snapshot } as never, { sections })
    const xml = await documentXml(await renderDocx(input, noLogos))
    const cell = (xml.match(/<w:tc>(?:(?!<w:tc>).)*?Simple.*?<\/w:tc>/) ?? [""])[0]
    expect(cell).toContain("Simple")
    expect(cell).not.toContain("<w:b ")
    expect(cell).not.toContain("w:fill")
  })

  it("writes Laravel's plain-text PDF when Gotenberg is off", async () => {
    const bundle = await renderSyllabusDocuments(inputOf(plantilla), noLogos, null)
    expect(bundle.pdf.bytes.toString("base64")).toBe(textGolden.cases[0].pdf)
    expect(bundle.pdf.reproducible).toBe(true)
    expect(bundle.docx.bytes.equals(await renderDocx(inputOf(plantilla), noLogos))).toBe(true)
  })
})

describe("table grid like WordTableGrid::columns", () => {
  it("takes each column edge from the first row that defines it", () => {
    expect(
      columnWidths([
        [
          { span: 2, width: 300 },
          { span: 1, width: 100 },
        ],
        [
          { span: 1, width: 120 },
          { span: 2, width: 280 },
        ],
      ]),
    ).toEqual([120, 180, 100])
  })

  it("splits columns that no row defines and never returns a zero width", () => {
    expect(columnWidths([[{ span: 3, width: 300 }]])).toEqual([100, 100, 100])
    expect(columnWidths([[{ span: 1, width: 0 }, { span: 1, width: 50 }]])).toEqual([1, 50])
    expect(columnWidths([])).toEqual([])
  })
})

describe("image sizes like getimagesizefromstring", () => {
  it("reads PNG, GIF and JPEG headers", () => {
    expect(imageInfo(Buffer.from(golden.cases[0].snapshot.logos.institution, "base64"))).toEqual({ width: 160, height: 30, extension: "png", mime: "image/png" })
    expect(imageInfo(Buffer.from(golden.cases[1].snapshot.logos.institution, "base64"))).toEqual({ width: 60, height: 20, extension: "gif", mime: "image/gif" })
    expect(imageInfo(Buffer.from(golden.cases[1].snapshot.logos.faculty, "base64"))).toEqual({ width: 90, height: 30, extension: "jpg", mime: "image/jpeg" })
  })

  it("rejects anything else", () => {
    expect(() => imageInfo(Buffer.from("<svg/>"))).toThrow(InvalidImage)
  })
})

describe("bundle validation like DocumentBundleValidator", () => {
  async function bundle(docx: Buffer, pdf: Buffer): Promise<DocumentBundle> {
    return {
      docx: { format: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", bytes: docx, reproducible: true },
      pdf: { format: "pdf", mime: "application/pdf", extension: "pdf", bytes: pdf, reproducible: false },
    }
  }
  const pdf = Buffer.from("%PDF-1.7\n%%EOF\n")

  it("accepts a rendered DOCX with a PDF", async () => {
    await expect(validateBundle(await bundle(await renderDocx(inputOf(plantilla), noLogos), pdf))).resolves.toBeUndefined()
  })

  it("rejects broken packages with Laravel's messages", async () => {
    await expect(validateBundle(await bundle(Buffer.from("no"), pdf))).rejects.toThrow("El renderer no produjo un DOCX válido.")
    await expect(validateBundle(await bundle(Buffer.from("PK"), Buffer.from("%PDF-1.7\n")))).rejects.toThrow("El renderer no produjo un PDF válido.")
    await expect(validateBundle(await bundle(Buffer.from("PK roto"), pdf))).rejects.toThrow("El paquete DOCX no puede abrirse.")
    const partial = new JSZip()
    partial.file("word/document.xml", "<w:document/>")
    await expect(validateBundle(await bundle(await partial.generateAsync({ type: "nodebuffer" }), pdf))).rejects.toThrow("El paquete DOCX está incompleto.")
    const invalid = new JSZip()
    for (const name of ["[Content_Types].xml", "_rels/.rels"]) invalid.file(name, "<x/>")
    invalid.file("word/document.xml", "<w:document><sin cerrar></w:document>")
    await expect(validateBundle(await bundle(await invalid.generateAsync({ type: "nodebuffer" }), pdf))).rejects.toThrow("El contenido principal del DOCX no es XML válido.")
  })
})
