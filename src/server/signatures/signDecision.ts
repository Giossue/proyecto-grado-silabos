import { signingStatement } from "../syllabus/snapshotDocuments"
import { SignatureRejected, verifyCmsSignature, type SignatureSettings, type SignerCertificate } from "./cmsVerifier"
import type { DecisionSignature } from "./decisionSignature"
import { holderMatches } from "./holderMatcher"

export type SignatureRow = {
  syllabusId: string
  revisionId: string
  role: string
  userId: string
  statement: string
  cms: string
  holder: string
  serial: string
  issuer: string
  validTo: number
  signedAt: number
}

export interface SignatureTx {
  signed(syllabusId: string, role: string): Promise<boolean>
  insertSignature(row: SignatureRow): Promise<string>
}

export type SignedRevision = { id: string; syllabusId: string; number: number; fingerprint: string }
export type Signer = { id: string; name: string }
export type DecisionToSign = { revision: SignedRevision; role: string; signature: DecisionSignature | null; actor: Signer; now: number }
export type Verifier = (content: string, signature: string, settings: SignatureSettings) => Promise<SignerCertificate>

export async function signatureRequired(tx: Pick<SignatureTx, "signed">, syllabusId: string, role: string): Promise<boolean> {
  return !(await tx.signed(syllabusId, role))
}

export async function signDecision(
  tx: SignatureTx,
  decision: DecisionToSign,
  settings: SignatureSettings & { requireHolderMatch: boolean },
  verify: Verifier = verifyCmsSignature,
): Promise<string | null> {
  const { revision, role, signature, actor } = decision
  if (!(await signatureRequired(tx, revision.syllabusId, role))) return null
  if (signature === null) throw new SignatureRejected("Firme con su firma electrónica.")
  const expected = signingStatement(revision.syllabusId, role, revision.fingerprint)
  if (expected !== signature.statement) throw new SignatureRejected("La declaración firmada no corresponde. Vuelva a firmar.")
  const certificate = await verify(expected, signature.cms, settings)
  if (settings.requireHolderMatch && !holderMatches(certificate.holder, actor.name)) {
    throw new SignatureRejected(`El certificado es de «${certificate.holder}», no de ${actor.name}.`)
  }
  const id = await tx.insertSignature({
    syllabusId: revision.syllabusId,
    revisionId: revision.id,
    role,
    userId: actor.id,
    statement: expected,
    cms: signature.cms.replace(/[ \t\n\v\f\r]+/g, ""),
    holder: certificate.holder,
    serial: certificate.serial,
    issuer: certificate.issuer,
    validTo: certificate.validTo,
    signedAt: decision.now,
  })
  return id
}
