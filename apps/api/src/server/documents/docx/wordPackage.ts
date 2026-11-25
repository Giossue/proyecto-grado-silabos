import JSZip from "jszip"
import { FONT_TABLE_XML, THEME_XML } from "./phpWordParts"
import { documentXml, type WordDocument } from "./wordDocument"
import { element, escapeText, xmlDocument } from "./xml"

export type DocumentInfo = { creator: string; title: string; description: string; created: number }

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const WORD_NAMESPACES =
  'xmlns:ve="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"'
const ZIP_DATE = new Date(Date.UTC(1980, 0, 1))
const BULLET_LEVELS: [string, number, string][] = [
  ["•", 360, "Symbol"],
  ["o", 720, "Courier New"],
  ["•", 1080, "Symbol"],
]
const NUMBER_LEVELS: [string, string, number][] = [
  ["decimal", "%1.", 360],
  ["lowerLetter", "%2.", 720],
  ["lowerRoman", "%3.", 1080],
]

function level(index: number, format: string, text: string, left: number, font: string | null): string {
  const fonts = font === null ? "<w:rFonts/>" : element("w:rFonts", [["w:ascii", font], ["w:hAnsi", font], ["w:cs", font]])
  return element(
    "w:lvl",
    [["w:ilvl", index]],
    element("w:start", [["w:val", 1]]) +
      element("w:numFmt", [["w:val", format]]) +
      element("w:suff", [["w:val", "tab"]]) +
      element("w:lvlText", [["w:val", text]]) +
      element("w:pPr", [], element("w:tabs", [], element("w:tab", [["w:val", "num"]])) + element("w:ind", [["w:left", left], ["w:hanging", 360]])) +
      element("w:rPr", [], fonts),
  )
}

function numberingXml(): string {
  const bullets = BULLET_LEVELS.map(([text, left, font], index) => level(index, "bullet", text, left, font)).join("")
  const numbers = NUMBER_LEVELS.map(([format, text, left], index) => level(index, format, text, left, null)).join("")
  const abstract = (id: number, nsid: string, levels: string) =>
    element("w:abstractNum", [["w:abstractNumId", id]], element("w:nsid", [["w:val", nsid]]) + element("w:multiLevelType", [["w:val", "multilevel"]]) + levels)
  return xmlDocument(
    `<w:numbering ${WORD_NAMESPACES}>${abstract(2, "511AB000", bullets)}${abstract(3, "511AB001", numbers)}${element("w:num", [["w:numId", 2]], element("w:abstractNumId", [["w:val", 2]]))}${element("w:num", [["w:numId", 3]], element("w:abstractNumId", [["w:val", 3]]))}</w:numbering>`,
  )
}

function stylesXml(document: WordDocument): string {
  const style = document.style
  const font = style.fontName
  const normal = element(
    "w:pPr",
    [],
    element("w:jc", [["w:val", style.paragraph.alignment]]) +
      element("w:spacing", [["w:before", 0], ["w:after", style.paragraph.spaceAfter], ["w:line", (style.paragraph.lineHeight - 1) * 240 + 240], ["w:lineRule", "auto"]]),
  )
  return xmlDocument(
    `<w:styles xmlns:r="${R}" xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr>${element("w:rFonts", [["w:ascii", font], ["w:hAnsi", font], ["w:eastAsia", "Arial"], ["w:cs", font]])}${element("w:color", [["w:val", style.fontColor]])}${element("w:sz", [["w:val", style.fontSize * 2]])}${element("w:szCs", [["w:val", style.fontSize * 2]])}<w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>${normal}</w:style><w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="Footnote Reference"/><w:semiHidden/><w:unhideWhenUsed/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style></w:styles>`,
  )
}

const SETTINGS_XML = xmlDocument(
  `<w:settings xmlns:r="${R}" xmlns:w="${W}" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:sl="http://schemas.openxmlformats.org/schemaLibrary/2006/main" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/><w:decimalSymbol w:val="."/><w:listSeparator w:val=";"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="12"/></w:compat><m:mathPr><m:mathFont m:val="Cambria Math"/><m:brkBin m:val="before"/><m:brkBinSub m:val="--"/><m:smallFrac m:val="off"/><m:dispDef/><m:lMargin m:val="0"/><m:rMargin m:val="0"/><m:defJc m:val="centerGroup"/><m:wrapIndent m:val="1440"/><m:intLim m:val="subSup"/><m:naryLim m:val="undOvr"/></m:mathPr><w:clrSchemeMapping w:bg1="light1" w:t1="dark1" w:bg2="light2" w:t2="dark2" w:accent1="accent1" w:accent2="accent2" w:accent3="accent3" w:accent4="accent4" w:accent5="accent5" w:accent6="accent6" w:hyperlink="hyperlink" w:followedHyperlink="followedHyperlink"/><w:hideSpellingErrors w:val="false"/><w:hideGrammaticalErrors w:val="false"/><w:trackRevisions w:val="false"/><w:doNotTrackMoves w:val="false"/><w:doNotTrackFormatting w:val="false"/><w:evenAndOddHeaders w:val="false"/><w:updateFields w:val="false"/><w:bookFoldPrinting w:val="false"/><w:themeFontLang w:val="en-US"/><w:zoom w:percent="100"/></w:settings>`,
)
const WEB_SETTINGS_XML = xmlDocument(`<w:webSettings xmlns:r="${R}" xmlns:w="${W}"><w:optimizeForBrowser/></w:webSettings>`)
const COMMENTS_XML = xmlDocument(`<w:comments ${WORD_NAMESPACES}/>`)
const APP_XML = xmlDocument(
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PHPWord</Application><Company></Company><Manager></Manager></Properties>',
)
const CUSTOM_XML = xmlDocument('<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>')
const ROOT_RELS_XML = xmlDocument(
  `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="rId1" Type="${RELATIONSHIPS}/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId2" Type="${OFFICE_RELATIONSHIPS}/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId3" Type="${OFFICE_RELATIONSHIPS}/custom-properties" Target="docProps/custom.xml"/><Relationship Id="rId4" Type="${OFFICE_RELATIONSHIPS}/officeDocument" Target="word/document.xml"/></Relationships>`,
)
const PART_RELATIONS: [string, string][] = [
  ["styles", "styles.xml"],
  ["numbering", "numbering.xml"],
  ["settings", "settings.xml"],
  ["theme", "theme/theme1.xml"],
  ["webSettings", "webSettings.xml"],
  ["fontTable", "fontTable.xml"],
]
const OVERRIDES: [string, string][] = [
  ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"],
  ["/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"],
  ["/docProps/custom.xml", "application/vnd.openxmlformats-officedocument.custom-properties+xml"],
  ["/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
  ["/word/styles.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"],
  ["/word/numbering.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"],
  ["/word/settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"],
  ["/word/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
  ["/word/webSettings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"],
  ["/word/fontTable.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"],
  ["/word/comments.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"],
]

function contentTypesXml(document: WordDocument): string {
  const defaults = new Map<string, string>([
    ["rels", "application/vnd.openxmlformats-package.relationships+xml"],
    ["xml", "application/xml"],
  ])
  for (const media of document.images) if (!defaults.has(media.extension)) defaults.set(media.extension, media.mime)
  const entries = [...defaults].map(([extension, type]) => element("Default", [["Extension", extension], ["ContentType", type]]))
  const overrides = OVERRIDES.map(([part, type]) => element("Override", [["PartName", part], ["ContentType", type]]))
  return xmlDocument(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${entries.join("")}${overrides.join("")}</Types>`)
}

function documentRelsXml(document: WordDocument): string {
  const parts = PART_RELATIONS.map(([type, target], index) => element("Relationship", [["Id", `rId${index + 1}`], ["Type", `${OFFICE_RELATIONSHIPS}/${type}`], ["Target", target]]))
  const images = document.images.map((media) => element("Relationship", [["Id", `rId${media.relationId + PART_RELATIONS.length}`], ["Type", `${OFFICE_RELATIONSHIPS}/image`], ["Target", `media/${media.target}`]]))
  return xmlDocument(`<Relationships xmlns="${RELATIONSHIPS}">${[...parts, ...images].join("")}</Relationships>`)
}

function w3cDate(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}+00:00`
}

function coreXml(info: DocumentInfo): string {
  const date = w3cDate(info.created)
  return xmlDocument(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${escapeText(info.creator)}</dc:creator><dc:title>${escapeText(info.title)}</dc:title><dc:description>${escapeText(info.description)}</dc:description><dc:subject></dc:subject><cp:keywords></cp:keywords><cp:category></cp:category><cp:lastModifiedBy></cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${date}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${date}</dcterms:modified></cp:coreProperties>`,
  )
}

export function wordParts(document: WordDocument, info: DocumentInfo): [string, string | Buffer][] {
  return [
    ...document.images.map((media): [string, Buffer] => [`word/media/${media.target}`, media.bytes]),
    ["[Content_Types].xml", contentTypesXml(document)],
    ["_rels/.rels", ROOT_RELS_XML],
    ["word/_rels/document.xml.rels", documentRelsXml(document)],
    ["word/document.xml", `${xmlDocument(documentXml(document))}\n`],
    ["docProps/app.xml", APP_XML],
    ["docProps/core.xml", coreXml(info)],
    ["docProps/custom.xml", CUSTOM_XML],
    ["word/comments.xml", COMMENTS_XML],
    ["word/styles.xml", stylesXml(document)],
    ["word/numbering.xml", numberingXml()],
    ["word/settings.xml", SETTINGS_XML],
    ["word/webSettings.xml", WEB_SETTINGS_XML],
    ["word/fontTable.xml", FONT_TABLE_XML],
    ["word/theme/theme1.xml", THEME_XML],
  ]
}

export async function packageWord(document: WordDocument, info: DocumentInfo): Promise<Buffer> {
  const zip = new JSZip()
  for (const [name, content] of wordParts(document, info)) zip.file(name, content, { date: ZIP_DATE, binary: typeof content !== "string", createFolders: false })
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "UNIX" })
}
