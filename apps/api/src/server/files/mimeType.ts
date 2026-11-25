import { CFB_STORAGE, CFB_STREAM, isCfb, readCfb, type Cfb, type CfbEntry } from "./cfb"

const PNG_HEADER = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")
const CGBI_HEADER = Buffer.from("89504e470d0a1a0a0000000443674249", "hex")
const ZIP_LOCAL = Buffer.from("504b0304", "hex")
const PDF = Buffer.from("%PDF-")
const MSI_CLSID = Buffer.from("84100c0000000000c000000000000046", "hex")

const APP_TO_MIME: [string, string][] = [
  ["Word", "msword"],
  ["Excel", "vnd.ms-excel"],
  ["Powerpoint", "vnd.ms-powerpoint"],
  ["Crystal Reports", "x-rpt"],
  ["Advanced Installer", "vnd.ms-msi"],
  ["InstallShield", "vnd.ms-msi"],
  ["Microsoft Patch Compiler", "vnd.ms-msi"],
  ["NAnt", "vnd.ms-msi"],
  ["Windows Installer", "vnd.ms-msi"],
]

const NAME_TO_MIME: [string, string][] = [
  ["Book", "vnd.ms-excel"],
  ["Workbook", "vnd.ms-excel"],
  ["WordDocument", "msword"],
  ["PowerPoint", "vnd.ms-powerpoint"],
  ["DigitalSignature", "vnd.ms-msi"],
]

const SECTIONS: { mime: string; sections: [string, number][] }[] = [
  { mime: "encrypted", sections: [["EncryptedPackage", CFB_STREAM], ["EncryptedSummary", CFB_STREAM]] },
  { mime: "quickbooks", sections: [["mfbu_header", CFB_STREAM]] },
  { mime: "vnd.ms-excel", sections: [["Book", CFB_STREAM], ["Workbook", CFB_STREAM]] },
  { mime: "msword", sections: [["WordDocument", CFB_STREAM]] },
  { mime: "vnd.ms-powerpoint", sections: [["PowerPoint", CFB_STREAM]] },
  { mime: "vnd.ms-outlook", sections: [["__properties_version1.0", CFB_STREAM], ["__recip_version1.0_#00000000", CFB_STORAGE]] },
]

const HANDLED_TYPES = new Set([0x01, 0x02, 0x03, 0x04, 0x05, 0x13, 0x1e, 0x1f, 0x40, 0x47])

function lookup(text: string, table: [string, string][]): string | null {
  const lower = text.toLowerCase()
  for (const [pattern, mime] of table) if (lower.includes(pattern.toLowerCase())) return mime
  return null
}

class Unexpandable extends Error {}

function printable(bytes: Buffer, step: number, length: number): string {
  let text = ""
  for (let offset = 0, left = length; offset < Math.min(bytes.length, length) && text.length < 1023 && left-- > 0; offset += step) {
    const code = bytes[offset]
    if (code === 0) break
    if (code >= 0x20 && code < 0x7f) text += String.fromCharCode(code)
  }
  return text
}

function summaryMime(stream: Buffer, root: CfbEntry | null): string | null {
  if (stream.length < 48) throw new Unexpandable()
  const sectionOffset = stream.readUInt32LE(44)
  if (sectionOffset + 8 > stream.length) throw new Unexpandable()
  const sectionLength = stream.readUInt32LE(sectionOffset)
  const count = stream.readUInt32LE(sectionOffset + 4)
  const end = sectionOffset + sectionLength
  if (end > stream.length || sectionOffset + 8 >= end) throw new Unexpandable()
  let mime: string | null = root !== null && root.clsid.equals(MSI_CLSID) ? "x-msi" : null
  for (let index = 0; index < count; index++) {
    const pair = sectionOffset + 8 + index * 8
    if (pair + 8 > end) throw new Unexpandable()
    const id = stream.readUInt32LE(pair)
    const position = sectionOffset + stream.readUInt32LE(pair + 4)
    if (position + 4 > end) throw new Unexpandable()
    const type = stream.readUInt32LE(position)
    if (!HANDLED_TYPES.has(type)) throw new Unexpandable()
    if (type !== 0x1e && type !== 0x1f) continue
    if (position + 8 > end) throw new Unexpandable()
    const length = stream.readUInt32LE(position + 4)
    if (position + 8 + length > end) throw new Unexpandable()
    if (length <= 1) continue
    const text = printable(stream.subarray(position + 8, position + 8 + length), type === 0x1f ? 2 : 1, length)
    if (mime === null && id === 0x12) mime = lookup(text, APP_TO_MIME)
  }
  return mime
}

function rawName(entry: CfbEntry): string {
  let text = ""
  for (const unit of entry.rawName) {
    const byte = unit & 0xff
    if (byte === 0) break
    text += String.fromCharCode(byte)
  }
  return text
}

function checkSummary(cfb: Cfb, stream: Buffer, root: CfbEntry | null): string {
  const fromApp = summaryMime(stream, root)
  if (fromApp !== null) return `application/${fromApp}`
  for (const entry of cfb.entries) {
    const found = lookup(rawName(entry), NAME_TO_MIME)
    if (found !== null) return `application/${found}`
  }
  return "application/vnd.ms-office"
}

function trySummary(cfb: Cfb, name: string, root: CfbEntry | null): string | null {
  const entry = cfb.find(name, CFB_STREAM)
  if (entry === null) return null
  try {
    return checkSummary(cfb, cfb.read(entry), root)
  } catch {
    return null
  }
}

function validCfbHeader(bytes: Buffer): boolean {
  return bytes.length >= 512 && isCfb(bytes) && bytes.readUInt16LE(0x1e) <= 20 && bytes.readUInt16LE(0x20) <= 20
}

function cdfMime(bytes: Buffer): string | null {
  if (!validCfbHeader(bytes)) return null
  let cfb: Cfb
  try {
    cfb = readCfb(bytes)
    cfb.miniStream()
  } catch {
    return "application/x-ole-storage"
  }
  const root = cfb.root
  const header = cfb.find("FileHeader", CFB_STREAM)
  if (header !== null) {
    try {
      if (cfb.read(header).subarray(0, 17).toString("latin1") === "HWP Document File") return "application/x-hwp"
    } catch {}
  }
  const summary = trySummary(cfb, "\u0005SummaryInformation", root) ?? trySummary(cfb, "\u0005DocumentSummaryInformation", root)
  if (summary !== null) return summary
  for (const section of SECTIONS) if (section.sections.some(([name, type]) => cfb.find(name, type) !== null)) return `application/${section.mime}`
  return "application/x-ole-storage"
}

function ooxmlName(bytes: Buffer, offset: number): string | null {
  const at = (prefix: string) => bytes.subarray(offset, offset + prefix.length).toString("latin1") === prefix
  if (at("word/")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (at("ppt/")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  if (at("xl/")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (at("visio/")) return "application/vnd.ms-visio.drawing.main+xml"
  if (at("AppManifest.xaml")) return "application/x-silverlight-app"
  return null
}

function search(bytes: Buffer, needle: Buffer, from: number, range: number): number {
  if (from < 0 || from >= bytes.length) return -1
  const found = bytes.subarray(from, Math.min(bytes.length, from + range - 1 + needle.length)).indexOf(needle)
  return found < 0 ? -1 : from + found
}

function regexLine(bytes: Buffer, offset: number): string {
  const slice = bytes.subarray(offset, Math.min(bytes.length, offset + 8192))
  const end = slice.indexOf(0)
  return slice.subarray(0, end < 0 ? slice.length : end).toString("latin1")
}

function nextNames(bytes: Buffer, start: number, levels: number): string | null {
  let from = start
  for (let level = 0; level < levels; level++) {
    const header = search(bytes, ZIP_LOCAL, from, 6000)
    if (header < 0) return null
    const name = header + 30
    const mime = ooxmlName(bytes, name)
    if (mime !== null) return mime
    from = name + 26
  }
  return null
}

function ooxmlMime(bytes: Buffer): string | null {
  if (bytes.length < 0x1e) return null
  const direct = ooxmlName(bytes, 0x1e)
  if (direct !== null) return direct
  const line = regexLine(bytes, 0x1e)
  let matched = false
  if (/\[Content_Types\]\.xml|_rels\/\.rels|docProps|customXml/.test(line) && bytes.length >= 22) {
    matched = true
    const found = nextNames(bytes, bytes.readUInt32LE(18) + 49, 5)
    if (found !== null) return found
  }
  if (/\[trash\]/.test(line)) {
    matched = true
    const second = search(bytes, ZIP_LOCAL, 0x1e + 26, 6000)
    const third = second < 0 ? -1 : search(bytes, ZIP_LOCAL, second + 4 + 26, 6000)
    if (third >= 0) {
      const mime = ooxmlName(bytes, third + 30)
      if (mime !== null) return mime
      const fourth = search(bytes, ZIP_LOCAL, third + 30 + 26, 6000)
      if (fourth >= 0) {
        const last = ooxmlName(bytes, fourth + 30)
        if (last !== null) return last
      }
    }
  }
  return matched ? "application/octet-stream" : null
}

function isJson(bytes: Buffer): boolean {
  const text = bytes.toString("utf8").trim()
  if (!text.startsWith("{") && !text.startsWith("[")) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

const BYTES_MAX = 7 * 1024 * 1024

function looksLikeText(bytes: Buffer): boolean {
  const end = Math.min(bytes.length, BYTES_MAX)
  for (let index = 0; index < end; index++) {
    const byte = bytes[index]
    if (byte <= 0x06 || (byte >= 0x0e && byte <= 0x1a) || (byte >= 0x1c && byte <= 0x1f) || byte === 0x7f) return false
  }
  return true
}

export function detectMimeType(bytes: Buffer): string {
  if (bytes.length === 0) return "application/x-empty"
  if (isJson(bytes)) return "application/json"
  const cdf = cdfMime(bytes)
  if (cdf !== null) return cdf
  if (bytes.subarray(0, 16).equals(PNG_HEADER)) return "image/png"
  if (bytes.subarray(0, 16).equals(CGBI_HEADER) && bytes.subarray(24, 32).toString("latin1") === "\u0000\u0000\u0000\rIHDR") return "image/png"
  const start = bytes.subarray(0, 8).toString("latin1")
  if (start.startsWith("%PDF-") || start.startsWith("\n%PDF-") || start.startsWith("\u00ef\u00bb\u00bf%PDF-")) return "application/pdf"
  if (bytes.subarray(0, 4).equals(ZIP_LOCAL)) return ooxmlMime(bytes) ?? "application/zip"
  if (!looksLikeText(bytes)) return "application/octet-stream"
  if (search(bytes, PDF, 0, 1024) >= 0) return "application/pdf"
  return "text/plain"
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/zip": "zip",
  "application/json": "json",
  "image/png": "png",
  "text/plain": "txt",
  "application/octet-stream": "bin",
}

export function guessExtension(mime: string): string | null {
  return EXTENSIONS[mime] ?? null
}
