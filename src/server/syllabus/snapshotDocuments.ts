import { isPhpArray, list, phpString, record, type PhpRecord } from "../configuration/phpValues"
import { resolveVariables } from "../configuration/templatePresentation"
import { isDocument, resolveDocument, trustedDefinition, type TemplateDefinition } from "../configuration/templateRuntime"

export class NeedsLaravel extends Error {}

export const SIGNATURE_ORDER = ["docente", "biblioteca", "coordinacion"]

const SIGNATURE_LABELS: Record<string, string> = { docente: "Firma del docente", coordinacion: "Firma de coordinación", biblioteca: "Firma de biblioteca" }
const SIGNATURE_ROLES: Record<string, string> = { docente: "Docente", coordinacion: "Coordinación", biblioteca: "Biblioteca" }
const SIGNING_ACTIONS: Record<string, string> = { docente: "envio_docente", coordinacion: "aprobacion_coordinacion", biblioteca: "aprobacion_biblioteca" }
const LEGACY_TYPES = ["fijo", "automatico", "tabla", "unidades"]
const EMPTY_DOCUMENT: PhpRecord = { type: "doc", content: [{ type: "paragraph" }] }

export type SignatureRecord = { role: string; name: string; signedAt: number; certificateName: string; serial: string; issuer: string }

export function snapshotDefinition(snapshot: PhpRecord): TemplateDefinition {
  if (isPhpArray(snapshot.template_definition)) return trustedDefinition(record(snapshot.template_definition))
  throw new NeedsLaravel()
}

function historicalDocument(field: PhpRecord): PhpRecord {
  if (isPhpArray(field.document)) return record(field.document)
  const value = field.value ?? null
  if (isDocument(value)) return record(value)
  if (LEGACY_TYPES.includes(phpString(field.type ?? "")) || value !== null) throw new NeedsLaravel()
  return EMPTY_DOCUMENT
}

function responsibleOf(field: PhpRecord): unknown {
  if (field.quien_llena !== undefined && field.quien_llena !== null) return field.quien_llena
  if (field.type === "automatico" || field.type === "fijo") return "institucional"
  return field.type === "ficha" ? "coordinacion" : "docente"
}

function sectionFields(section: PhpRecord): unknown[] {
  if (section.fields !== undefined && section.fields !== null) return list(section.fields)
  return list(section.blocks ?? []).flatMap((block) => list(record(block).fields ?? []))
}

export function presentSnapshot(snapshot: PhpRecord): PhpRecord {
  const definition = snapshotDefinition(snapshot)
  const ownVariables = isPhpArray(snapshot.template_variables) ? (record(snapshot.template_variables) as Record<string, string>) : {}
  const variables = { ...resolveVariables(definition, snapshot), ...ownVariables }
  if (snapshot.sections === undefined || snapshot.sections === null) return snapshot
  const sections = list(snapshot.sections).map((raw) => {
    const section = record(raw)
    const fields = sectionFields(section).map((item) => {
      const field = record(item)
      const document = historicalDocument(field)
      return {
        id: field.definition_id ?? field.id ?? field.key ?? null,
        definition_id: field.definition_id ?? null,
        key: field.key ?? null,
        label: field.label ?? "",
        quien_llena: responsibleOf(field),
        teacher_editable: false,
        required: false,
        value: document,
        document: resolveDocument(document, variables, definition),
      }
    })
    return { ...section, orientation: section.orientation ?? "portrait", fields }
  })
  return { ...snapshot, sections }
}

export function signingStatement(syllabusId: string, role: string, fingerprint: string): string {
  return `silabos-ueb|silabo:${syllabusId}|accion:${SIGNING_ACTIONS[role]}|huella:${fingerprint}`
}

const GUAYAQUIL_OFFSET = -5 * 3600

function guayaquil(seconds: number): { date: string; time: string } {
  const shifted = new Date((seconds + GUAYAQUIL_OFFSET) * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return {
    date: `${pad(shifted.getUTCDate())}-${pad(shifted.getUTCMonth() + 1)}-${shifted.getUTCFullYear()}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  }
}

export function guayaquilDate(seconds: number): string {
  return guayaquil(seconds).date
}

function stamp(signature: SignatureRecord): string {
  const match = /(?:^|,\s*)CN=([^,]+)/.exec(signature.issuer)
  const issuer = match ? phpTrimmed(match[1]) : signature.issuer
  const { date, time } = guayaquil(signature.signedAt)
  return `\n\nFirmado electrónicamente por ${signature.certificateName} · ${SIGNATURE_ROLES[signature.role]} · ${date} ${time} · certificado N.º ${signature.serial} · ${issuer}\n${SIGNATURE_LABELS[signature.role]}`
}

function phpTrimmed(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
}

export type SignedFacts = {
  submittedAt: number
  coordination: { reviewer: string; at: number } | null
  approval: { approver: string; at: number } | null
  verification: { verifier: string; at: number } | null
  signatures: SignatureRecord[]
}

export function signedDocumentVariables(snapshot: PhpRecord, facts: SignedFacts): Record<string, unknown> {
  const definition = snapshotDefinition(snapshot)
  const own = isPhpArray(snapshot.template_variables) ? record(snapshot.template_variables) : {}
  const dates: Record<string, string> = { submitted_on: guayaquilDate(facts.submittedAt) }
  const coordinator = facts.coordination?.reviewer ?? facts.approval?.approver ?? null
  const approvedOn = facts.coordination !== null ? facts.coordination.at : (facts.approval?.at ?? null)
  if (coordinator !== null && approvedOn !== null) {
    dates.coordinator = coordinator
    dates.approved_on = guayaquilDate(approvedOn)
  }
  const librarian = facts.verification?.verifier ?? facts.approval?.approver ?? null
  const verifiedOn = facts.verification !== null ? facts.verification.at : (facts.approval?.at ?? null)
  if (librarian !== null && verifiedOn !== null) {
    dates.librarian = librarian
    dates.verified_on = guayaquilDate(verifiedOn)
  }
  const approvalValues = resolveVariables(definition, { approval: dates })
  const approval: Record<string, string> = {}
  const signatures: Record<string, string> = {}
  const stamps: Record<string, string> = {}
  for (const signature of facts.signatures) stamps[signature.role] = stamp(signature)
  for (const [key, variable] of Object.entries(definition.variables)) {
    const source = phpString(variable.source)
    if (source.startsWith("approval.") && approvalValues[key] !== "") approval[key] = approvalValues[key]
    if (source.startsWith("signature.") && stamps[source.slice("signature.".length)] !== undefined) signatures[key] = stamps[source.slice("signature.".length)]
  }
  return { ...own, ...approval, ...signatures }
}
