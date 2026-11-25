import JSZip from "jszip"

const LANDSCAPE_FROM_COLUMNS = 8

const BEFORE_PAGE_SETUP = [
  "pageMargins",
  "printOptions",
  "hyperlinks",
  "dataValidations",
  "conditionalFormatting",
  "phoneticPr",
  "mergeCells",
  "customSheetViews",
  "dataConsolidate",
  "sortState",
  "autoFilter",
  "scenarios",
  "protectedRanges",
  "sheetProtection",
  "sheetCalcPr",
  "sheetData",
]

function columnIndex(letters: string): number {
  let index = 0
  for (const letter of letters.toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index
}

export function highestDataColumn(xml: string): number {
  let highest = 1
  const data = /<(?:\w+:)?sheetData[\s>][\s\S]*?<\/(?:\w+:)?sheetData>/.exec(xml)?.[0] ?? ""
  for (const row of data.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    let position = 0
    for (const cell of (row[1] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)\/?>/g)) {
      const reference = /\br="([A-Za-z]+)\d+"/.exec(cell[1])
      position = reference ? columnIndex(reference[1]) : position + 1
      highest = Math.max(highest, position)
    }
  }
  return highest
}

function setAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}="[^"]*"`)
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${value}"`)
  return tag.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`)
}

function withSheetPr(xml: string, prefix: string): string {
  const pageSetUpPr = `<${prefix}pageSetUpPr fitToPage="1"/>`
  const sheetPr = new RegExp(`<${prefix}sheetPr\\b[^>]*?(\\/?)>`).exec(xml)
  if (sheetPr === null) return xml.replace(new RegExp(`(<${prefix}worksheet\\b[^>]*>)`), `$1<${prefix}sheetPr>${pageSetUpPr}</${prefix}sheetPr>`)
  if (sheetPr[1] === "/") return xml.replace(sheetPr[0], `${sheetPr[0].replace(/\s*\/>$/, ">")}${pageSetUpPr}</${prefix}sheetPr>`)
  const existing = new RegExp(`<${prefix}pageSetUpPr\\b[^>]*?\\/?>`).exec(xml)
  if (existing !== null) return xml.replace(existing[0], setAttribute(existing[0], "fitToPage", "1"))
  const outline = new RegExp(`<${prefix}outlinePr\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${prefix}outlinePr>)`).exec(xml)
  if (outline !== null) return xml.replace(outline[0], `${outline[0]}${pageSetUpPr}`)
  const tab = new RegExp(`<${prefix}tabColor\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${prefix}tabColor>)`).exec(xml)
  if (tab !== null) return xml.replace(tab[0], `${tab[0]}${pageSetUpPr}`)
  return xml.replace(sheetPr[0], `${sheetPr[0]}${pageSetUpPr}`)
}

function withPageSetup(xml: string, prefix: string, landscape: boolean): string {
  const apply = (tag: string) => {
    let result = setAttribute(setAttribute(tag, "fitToWidth", "1"), "fitToHeight", "0")
    if (landscape) result = setAttribute(result, "orientation", "landscape")
    return result
  }
  const existing = new RegExp(`<${prefix}pageSetup\\b[^>]*?\\/?>`).exec(xml)
  if (existing !== null) return xml.replace(existing[0], apply(existing[0]))
  const fresh = apply(`<${prefix}pageSetup/>`)
  for (const name of BEFORE_PAGE_SETUP) {
    const element = new RegExp(`<${prefix}${name}\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${prefix}${name}>)`).exec(xml)
    if (element !== null) return xml.replace(element[0], `${element[0]}${fresh}`)
  }
  return xml.replace(new RegExp(`(<\\/${prefix}worksheet>)`), `${fresh}$1`)
}

export function fitSheetXml(xml: string): string {
  const prefix = /<(\w+:)?worksheet\b/.exec(xml)?.[1] ?? ""
  const landscape = highestDataColumn(xml) > LANDSCAPE_FROM_COLUMNS
  return withPageSetup(withSheetPr(xml, prefix), prefix, landscape)
}

export async function fitSheetsToPageWidth(content: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(content)
  const sheets = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name))
  if (sheets.length === 0) throw new Error("No se pudo ajustar el Excel al ancho de la página.")
  for (const name of sheets) zip.file(name, fitSheetXml(await (zip.file(name) as JSZip.JSZipObject).async("string")))
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } })
}
