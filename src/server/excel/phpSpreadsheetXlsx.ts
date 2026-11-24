import JSZip from "jszip"
import { randomString } from "../identity/accountRules"
import { PHPSPREADSHEET_THEME } from "./phpSpreadsheetTheme"

export const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships"
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g

export function xmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\r/g, "&#13;")
}

export function xmlAttribute(value: string): string {
  return xmlText(value).replace(/\n/g, "&#10;").replace(/\t/g, "&#9;")
}

export function ooxmlText(value: string): string {
  return value
    .replace(/_(x[0-9A-F]{4}_)/g, "_x005F_$1")
    .replace(CONTROL, (character) => `_x${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`)
}

export function legacyPasswordHash(password: string): string {
  const bytes = [password.length & 0xff, ...Buffer.from(password, "latin1")]
  let verifier = 0
  for (let index = bytes.length - 1; index >= 0; index--) {
    const high = (verifier & 0x4000) === 0 ? 0 : 1
    verifier = (high | ((verifier * 2) & 0x7fff)) ^ bytes[index]
  }
  return (verifier ^ 0xce4b).toString(16).toUpperCase()
}

export function randomPasswordHash(random: (length: number) => string = randomString): string {
  return legacyPasswordHash(random(24))
}

export class SharedStrings {
  private readonly indexes = new Map<string, number>()

  index(text: string): number {
    const known = this.indexes.get(text)
    if (known !== undefined) return known
    const next = this.indexes.size
    this.indexes.set(text, next)
    return next
  }

  xml(): string {
    let body = ""
    for (const text of this.indexes.keys()) {
      const escaped = ooxmlText(text)
      const space = escaped !== escaped.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "") ? ' xml:space="preserve"' : ""
      body += `<si><t${space}>${xmlText(escaped)}</t></si>`
    }
    return `${XML_HEADER}<sst xmlns="${MAIN}" uniqueCount="${this.indexes.size}">${body}</sst>`
  }
}

export type PackageSheet = { title: string; state?: "hidden" | "veryHidden"; xml: string }

export type PackageOptions = {
  sheets: PackageSheet[]
  sharedStrings: SharedStrings
  styles: string
  created: number
  workbookPassword?: string
  preCalculateFormulas?: boolean
}

function w3c(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}+00:00`
}

function contentTypes(sheets: number): string {
  const sheetTypes = Array.from(
    { length: sheets },
    (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("")
  return (
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    sheetTypes +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    "</Types>"
  )
}

function rootRelationships(): string {
  return (
    `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">` +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>"
  )
}

function workbookRelationships(sheets: number): string {
  const worksheets = Array.from(
    { length: sheets },
    (_, index) => `<Relationship Id="rId${index + 4}" Type="${RELATIONSHIPS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("")
  return (
    `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">` +
    `<Relationship Id="rId1" Type="${RELATIONSHIPS}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="${RELATIONSHIPS}/theme" Target="theme/theme1.xml"/>` +
    `<Relationship Id="rId3" Type="${RELATIONSHIPS}/sharedStrings" Target="sharedStrings.xml"/>` +
    worksheets +
    "</Relationships>"
  )
}

function appProperties(titles: string[]): string {
  const parts = titles.map((title) => `<vt:lpstr>${xmlText(title)}</vt:lpstr>`).join("")
  return (
    `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    "<Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>" +
    `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${titles.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
    `<TitlesOfParts><vt:vector size="${titles.length}" baseType="lpstr">${parts}</vt:vector></TitlesOfParts>` +
    "<Company></Company><Manager></Manager><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinkBase></HyperlinkBase><HyperlinksChanged>false</HyperlinksChanged><AppVersion>12.0000</AppVersion></Properties>"
  )
}

function coreProperties(created: number): string {
  const date = w3c(created)
  return (
    `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    "<dc:creator>Unknown Creator</dc:creator><cp:lastModifiedBy>Unknown Creator</cp:lastModifiedBy>" +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${date}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${date}</dcterms:modified>` +
    "<dc:title>Untitled Spreadsheet</dc:title><dc:description></dc:description><dc:subject></dc:subject><cp:keywords></cp:keywords><cp:category></cp:category></cp:coreProperties>"
  )
}

function workbookXml(options: PackageOptions): string {
  const sheets = options.sheets
    .map((sheet, index) => `<sheet name="${xmlAttribute(sheet.title)}" sheetId="${index + 1}"${sheet.state ? ` state="${sheet.state}"` : ""} r:id="rId${index + 4}"/>`)
    .join("")
  return (
    `${XML_HEADER}<workbook xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}">` +
    '<fileVersion appName="xl" lastEdited="4" lowestEdited="4" rupBuild="4505"/><workbookPr codeName="ThisWorkbook"/>' +
    (options.workbookPassword === undefined
      ? ""
      : `<workbookProtection lockRevision="false" lockStructure="true" lockWindows="false" workbookPassword="${options.workbookPassword}"/>`) +
    `<bookViews><workbookView activeTab="0" autoFilterDateGrouping="true" firstSheet="0" minimized="false" showHorizontalScroll="true" showSheetTabs="true" showVerticalScroll="true" tabRatio="600" visibility="visible"/></bookViews>` +
    `<sheets>${sheets}</sheets><definedNames/>` +
    (options.preCalculateFormulas === false
      ? '<calcPr calcId="999999" calcMode="auto" calcCompleted="0" fullCalcOnLoad="1" forceFullCalc="0"/>'
      : '<calcPr calcId="999999" calcMode="auto" calcCompleted="1" fullCalcOnLoad="0" forceFullCalc="0"/>') +
    "</workbook>"
  )
}

export async function xlsxPackage(options: PackageOptions): Promise<Buffer> {
  const zip = new JSZip()
  const count = options.sheets.length
  const date = new Date(options.created * 1000)
  const add = (name: string, content: string) => zip.file(name, content, { date, createFolders: false })
  add("[Content_Types].xml", contentTypes(count))
  add("_rels/.rels", rootRelationships())
  add("xl/_rels/workbook.xml.rels", workbookRelationships(count))
  add("docProps/app.xml", appProperties(options.sheets.map((sheet) => sheet.title)))
  add("docProps/core.xml", coreProperties(options.created))
  add("xl/theme/theme1.xml", PHPSPREADSHEET_THEME)
  add("xl/sharedStrings.xml", options.sharedStrings.xml())
  add("xl/styles.xml", options.styles)
  add("xl/workbook.xml", workbookXml(options))
  options.sheets.forEach((sheet, index) => add(`xl/worksheets/sheet${index + 1}.xml`, sheet.xml))
  options.sheets.forEach((_, index) => add(`xl/worksheets/_rels/sheet${index + 1}.xml.rels`, `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"/>`))
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "UNIX" })
}

export const WORKSHEET_OPEN =
  `${XML_HEADER}<worksheet xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}" xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x14ac" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac">` +
  '<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>'

export const WORKSHEET_CLOSE =
  '<printOptions gridLines="false" gridLinesSet="true"/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="1" orientation="default" scale="100" fitToHeight="1" fitToWidth="1" pageOrder="downThenOver"/></worksheet>'

export const SHEET_FORMAT = '<sheetFormatPr defaultRowHeight="14.4" outlineLevelRow="0" outlineLevelCol="0"/>'
