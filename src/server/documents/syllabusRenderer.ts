import { createHash } from "node:crypto"
import { DOMParser } from "@xmldom/xmldom"
import JSZip from "jszip"
import type { PhpRecord } from "../configuration/phpValues"
import { NeedsLaravel } from "../syllabus/snapshotDocuments"
import { buildSyllabusWord, type DocumentRenderInput, type LogoSource } from "./docx/syllabusWordDocument"
import { packageWord } from "./docx/wordPackage"
import { plainTextPdf, syllabusLines } from "./plainTextPdf"

export type { DocumentRenderInput, LogoSource } from "./docx/syllabusWordDocument"

export const RENDERER_VERSION = "phpword-docx-v4+libreoffice-pdf-v1"
export const TEXT_RENDERER_VERSION = "phpword-docx-v4+text-pdf-v2"

export function rendererVersion(converterEnabled: boolean): string {
  return converterEnabled ? RENDERER_VERSION : TEXT_RENDERER_VERSION
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const REQUIRED_ENTRIES = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]

export type RenderedDocument = { format: string; mime: string; extension: string; bytes: Buffer; reproducible: boolean }
export type DocumentBundle = { docx: RenderedDocument; pdf: RenderedDocument }
export type PdfConverter = (docx: Buffer, generatedAt: string) => Promise<Buffer>

export function fingerprint(document: RenderedDocument): string {
  return createHash("sha256").update(document.bytes).digest("hex")
}

function timestamp(value: string): number {
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : Math.floor(time / 1000)
}

export async function renderDocx(input: DocumentRenderInput, logos: LogoSource): Promise<Buffer> {
  const word = await buildSyllabusWord(input, logos)
  return packageWord(word, { creator: "Sílabos UEB", title: input.subject, description: `Revisión ${input.revisionNumber}`, created: timestamp(input.generatedAt) })
}

export async function renderSyllabusDocuments(input: DocumentRenderInput, logos: LogoSource, convert: PdfConverter | null): Promise<DocumentBundle> {
  const docx = await renderDocx(input, logos)
  const pdf = convert === null ? plainTextPdf(syllabusLines(input)) : await convert(docx, input.generatedAt)
  return {
    docx: { format: "docx", mime: DOCX_MIME, extension: "docx", bytes: docx, reproducible: true },
    pdf: { format: "pdf", mime: "application/pdf", extension: "pdf", bytes: pdf, reproducible: convert === null },
  }
}

export async function rendersInNext(snapshot: PhpRecord, converterEnabled: boolean): Promise<boolean> {
  const input: DocumentRenderInput = { subject: "", subjectCode: "", academicPeriod: "", revisionNumber: 0, revisionFingerprint: "", generatedAt: "", locale: "es-EC", snapshot }
  try {
    await buildSyllabusWord(input, async () => null)
    if (!converterEnabled) syllabusLines(input)
    return true
  } catch (error) {
    return !(error instanceof NeedsLaravel)
  }
}

function wellFormed(xml: string): boolean {
  let valid = true
  const parser = new DOMParser({
    onError: (level) => {
      if (level !== "warning") valid = false
    },
  })
  try {
    parser.parseFromString(xml, "text/xml")
  } catch {
    return false
  }
  return valid
}

export async function validateBundle(bundle: DocumentBundle): Promise<void> {
  const { docx, pdf } = bundle
  if (docx.format !== "docx" || docx.mime !== DOCX_MIME || !docx.bytes.subarray(0, 2).equals(Buffer.from("PK"))) {
    throw new Error("El renderer no produjo un DOCX válido.")
  }
  if (pdf.format !== "pdf" || pdf.mime !== "application/pdf" || !pdf.bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || !pdf.bytes.subarray(-6).equals(Buffer.from("%%EOF\n"))) {
    throw new Error("El renderer no produjo un PDF válido.")
  }
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(docx.bytes)
  } catch {
    throw new Error("El paquete DOCX no puede abrirse.")
  }
  if (REQUIRED_ENTRIES.some((entry) => zip.file(entry) === null)) throw new Error("El paquete DOCX está incompleto.")
  const documentXml = await zip.file("word/document.xml")?.async("string")
  if (documentXml === undefined || !wellFormed(documentXml)) throw new Error("El contenido principal del DOCX no es XML válido.")
}
