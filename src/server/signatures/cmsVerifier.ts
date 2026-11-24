import { readFile, stat } from "node:fs/promises"
import { webcrypto } from "node:crypto"
import * as asn1js from "asn1js"
import * as pkijs from "pkijs"
import { distinguishedName, mbSubstr, nameEntries, phpTrim, secondsOf, serialHex } from "./certificateFields"

export class SignatureRejected extends Error {}

export type SignerCertificate = { holder: string; serial: string; issuer: string; validTo: number }

export type SignatureSettings = { trustedBundle: string | null; production: boolean; now: () => number }

type Env = Record<string, string | undefined>

function laravelEnvBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback
  const value = raw.toLowerCase()
  if (value === "true" || value === "(true)") return true
  if (["false", "(false)", "empty", "(empty)", "null", "(null)", "", "0"].includes(value)) return false
  return true
}

export function signatureSettings(env: Env = process.env): SignatureSettings & { requireHolderMatch: boolean } {
  const bundle = env.SIGNATURE_TRUSTED_CA_BUNDLE
  return {
    trustedBundle: bundle === undefined || bundle === "" ? null : bundle,
    production: (env.APP_ENV ?? "production") === "production",
    now: () => Date.now() / 1000,
    requireHolderMatch: laravelEnvBoolean(env.SIGNATURE_REQUIRE_HOLDER_MATCH, true),
  }
}

const engine = new pkijs.CryptoEngine({ name: "node", crypto: webcrypto as unknown as Crypto })
const SIGNED_DATA = "1.2.840.113549.1.7.2"
const KEY_USAGE = "2.5.29.15"
const BASIC_CONSTRAINTS = "2.5.29.19"
const EXTENDED_KEY_USAGE = "2.5.29.37"
const NETSCAPE_TYPE = "2.16.840.1.113730.1.1"
const EMAIL_PROTECTION = "1.3.6.1.5.5.7.3.4"
const SUPPORTED_CRITICAL = [
  NETSCAPE_TYPE,
  KEY_USAGE,
  "2.5.29.17",
  BASIC_CONSTRAINTS,
  "2.5.29.32",
  "2.5.29.31",
  EXTENDED_KEY_USAGE,
  "1.3.6.1.5.5.7.1.7",
  "1.3.6.1.5.5.7.1.8",
  "1.3.6.1.5.5.7.48.1.5",
  "2.5.29.36",
  "1.3.6.1.5.5.7.1.14",
  "2.5.29.30",
  "2.5.29.33",
  "2.5.29.54",
]
const MISSING_AUTHORITIES = "No se puede verificar la firma: falta configurar las entidades certificadoras de confianza. Avise a Administración."
const PEM_CERTIFICATE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g

function fail(message: string): never {
  throw new SignatureRejected(message)
}

function strictBase64(encoded: string): Buffer | null {
  const match = /^([A-Za-z0-9+/]*)(=*)$/.exec(encoded)
  if (match === null) return null
  const [, data, padding] = match
  if (data.length % 4 === 1) return null
  if (padding.length > 0 && (padding.length > 2 || (data.length + padding.length) % 4 !== 0)) return null
  return Buffer.from(data, "base64")
}

function firstElement(binary: Buffer): Buffer {
  if (binary.length < 2 || binary[0] !== 0x30) fail("La firma no es válida.")
  const lengthByte = binary[1]
  if (lengthByte < 0x80) return binary.subarray(0, 2 + lengthByte)
  const octets = lengthByte & 0x7f
  if (octets < 1 || octets > 4 || binary.length < 2 + octets) fail("La firma no es válida.")
  let bodyLength = 0
  for (let index = 0; index < octets; index++) bodyLength = bodyLength * 256 + binary[2 + index]
  const total = 2 + octets + bodyLength
  if (total > binary.length) fail("La firma está incompleta.")
  return binary.subarray(0, total)
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function signedDataOf(der: Buffer): pkijs.SignedData | null {
  try {
    const parsed = asn1js.fromBER(arrayBuffer(der))
    if (parsed.offset === -1) return null
    const info = new pkijs.ContentInfo({ schema: parsed.result })
    if (info.contentType !== SIGNED_DATA) return null
    const signedData = new pkijs.SignedData({ schema: info.content })
    signedData.encapContentInfo.eContent = undefined
    return signedData
  } catch {
    return null
  }
}

function certificatesOf(signedData: pkijs.SignedData): pkijs.Certificate[] {
  return (signedData.certificates ?? []).filter((item): item is pkijs.Certificate => item instanceof pkijs.Certificate)
}

async function signerCertificates(signedData: pkijs.SignedData, content: Buffer): Promise<pkijs.Certificate[] | null> {
  if (signedData.signerInfos.length === 0) return null
  const signers: pkijs.Certificate[] = []
  for (let index = 0; index < signedData.signerInfos.length; index++) {
    try {
      const result = await signedData.verify({ signer: index, data: arrayBuffer(content), extendedMode: true }, engine)
      if (!result.signatureVerified || !result.signerCertificate) return null
      signers.push(result.signerCertificate)
    } catch {
      return null
    }
  }
  return signers
}

function extensionOf(certificate: pkijs.Certificate, id: string): pkijs.Extension | null {
  return (certificate.extensions ?? []).find((extension) => extension.extnID === id) ?? null
}

function keyUsageBits(certificate: pkijs.Certificate): number | null {
  const extension = extensionOf(certificate, KEY_USAGE)
  if (extension === null) return null
  const bits = extension.parsedValue as asn1js.BitString | undefined
  const view = bits ? new Uint8Array(bits.valueBlock.valueHexView) : new Uint8Array()
  return (view[0] ?? 0) | ((view[1] ?? 0) << 8)
}

function extendedKeyUsages(certificate: pkijs.Certificate): string[] | null {
  const extension = extensionOf(certificate, EXTENDED_KEY_USAGE)
  if (extension === null) return null
  return (extension.parsedValue as pkijs.ExtKeyUsage | undefined)?.keyPurposes ?? []
}

function isAuthority(certificate: pkijs.Certificate): boolean {
  const constraints = extensionOf(certificate, BASIC_CONSTRAINTS)?.parsedValue as pkijs.BasicConstraints | undefined
  return constraints?.cA === true
}

function pathLength(certificate: pkijs.Certificate): number | null {
  const constraints = extensionOf(certificate, BASIC_CONSTRAINTS)?.parsedValue as pkijs.BasicConstraints | undefined
  const value = constraints?.pathLenConstraint
  if (value === undefined || value === null) return null
  return typeof value === "number" ? value : value.valueBlock.valueDec
}

function isSigningCertificate(certificate: pkijs.Certificate): boolean {
  const usage = keyUsageBits(certificate)
  if (usage !== null && (usage & 0xc0) === 0) return false
  const extended = extendedKeyUsages(certificate)
  return extended === null || extended.includes(EMAIL_PROTECTION)
}

function signingPurpose(certificate: pkijs.Certificate, leaf: boolean): boolean {
  const extended = extendedKeyUsages(certificate)
  if (extended !== null && !extended.includes(EMAIL_PROTECTION)) return false
  if (!leaf) {
    const usage = keyUsageBits(certificate)
    if (usage !== null && (usage & 0x04) === 0) return false
    return isAuthority(certificate) || certificate.issuer.isEqual(certificate.subject)
  }
  const usage = keyUsageBits(certificate)
  return usage === null || (usage & 0xc0) !== 0
}

function handlesCriticalExtensions(certificate: pkijs.Certificate): boolean {
  return (certificate.extensions ?? []).every((extension) => !extension.critical || SUPPORTED_CRITICAL.includes(extension.extnID))
}

function within(certificate: pkijs.Certificate, now: number): boolean {
  return secondsOf(certificate.notBefore.value) <= now && secondsOf(certificate.notAfter.value) > now
}

async function trustedPath(signer: pkijs.Certificate, others: pkijs.Certificate[], trusted: pkijs.Certificate[], now: number): Promise<boolean> {
  const signerDer = Buffer.from(signer.toSchema().toBER())
  const intermediates = others.filter((certificate) => !Buffer.from(certificate.toSchema().toBER()).equals(signerDer))
  try {
    const chain = new pkijs.CertificateChainValidationEngine({ trustedCerts: trusted, certs: [...intermediates, signer], checkDate: new Date(now * 1000) })
    const result = await chain.verify({}, engine)
    const path = result.certificatePath ?? []
    if (!result.result || path.length < 2) return false
    const anchor = path[path.length - 1]
    if (!anchor.issuer.isEqual(anchor.subject)) return false
    for (const [index, certificate] of path.entries()) {
      if (!handlesCriticalExtensions(certificate) || !signingPurpose(certificate, index === 0)) return false
      const limit = index > 1 ? pathLength(certificate) : null
      if (limit !== null && index - 1 > limit) return false
    }
    return true
  } catch {
    return false
  }
}

function parsePem(pem: string): pkijs.Certificate | null {
  try {
    const body = pem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s+/g, "")
    return pkijs.Certificate.fromBER(arrayBuffer(Buffer.from(body, "base64")))
  } catch {
    return null
  }
}

async function issuedByListedAuthority(signer: pkijs.Certificate, authorities: pkijs.Certificate[], now: number): Promise<boolean> {
  if (!isSigningCertificate(signer)) return false
  const issuer = JSON.stringify(nameEntries(signer.issuer))
  for (const authority of authorities) {
    if (JSON.stringify(nameEntries(authority.subject)) !== issuer || !isAuthority(authority) || !within(authority, now)) continue
    try {
      if (await signer.verify(authority, engine)) return true
    } catch {
      continue
    }
  }
  return false
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

async function assertTrustedChain(signers: pkijs.Certificate[], others: pkijs.Certificate[], settings: SignatureSettings): Promise<void> {
  const bundle = settings.trustedBundle
  const configured = bundle !== null && bundle !== ""
  if (settings.production && (!configured || !(await fileExists(bundle)))) fail(MISSING_AUTHORITIES)
  if (!configured) return
  if (!(await fileExists(bundle))) throw new Error("No se encontró el archivo de entidades certificadoras de confianza.")
  const authorities = ((await readFile(bundle, "latin1")).match(PEM_CERTIFICATE) ?? []).map(parsePem).filter((item): item is pkijs.Certificate => item !== null)
  const now = settings.now()
  let trusted = true
  for (const signer of signers) {
    if (!(await trustedPath(signer, others, authorities, now))) trusted = false
  }
  if (!trusted && !(await issuedByListedAuthority(signers[0], authorities, now))) fail("El certificado no es de una entidad reconocida.")
}

function described(certificate: pkijs.Certificate, now: number): SignerCertificate {
  const validFrom = secondsOf(certificate.notBefore.value)
  const validTo = secondsOf(certificate.notAfter.value)
  if (validTo < now) fail("El certificado está vencido.")
  if (validFrom > now) fail("El certificado todavía no es válido.")
  const common = nameEntries(certificate.subject).find(([key]) => key === "CN")?.[1][0] ?? ""
  const holder = phpTrim(common)
  if (holder === "") fail("El certificado no identifica a su titular.")
  return {
    holder: mbSubstr(holder, 255),
    serial: mbSubstr(serialHex(certificate), 255),
    issuer: mbSubstr(distinguishedName(nameEntries(certificate.issuer)), 500),
    validTo,
  }
}

export async function verifyCmsSignature(content: string, signature: string, settings: SignatureSettings): Promise<SignerCertificate> {
  const encoded = signature.replace(/-----(BEGIN|END) [A-Z0-9 ]+-----|[ \t\n\v\f\r]+/g, "")
  const binary = encoded === "" ? null : strictBase64(encoded)
  if (binary === null) fail("La firma no es válida.")
  const signedData = signedDataOf(firstElement(binary))
  const bytes = Buffer.from(content, "utf8")
  const signers = signedData === null ? null : await signerCertificates(signedData, bytes)
  if (signedData === null || signers === null) fail("La firma no corresponde a la declaración.")
  await assertTrustedChain(signers, certificatesOf(signedData), settings)
  return described(signers[0], settings.now())
}
