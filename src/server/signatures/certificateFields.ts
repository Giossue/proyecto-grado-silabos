import * as asn1js from "asn1js"
import type { Certificate, RelativeDistinguishedNames } from "pkijs"

const SHORT_NAMES: Record<string, string> = {
  "2.5.4.3": "CN",
  "2.5.4.4": "SN",
  "2.5.4.5": "serialNumber",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.9": "street",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.12": "title",
  "2.5.4.13": "description",
  "2.5.4.15": "businessCategory",
  "2.5.4.16": "postalAddress",
  "2.5.4.17": "postalCode",
  "2.5.4.18": "postOfficeBox",
  "2.5.4.20": "telephoneNumber",
  "2.5.4.41": "name",
  "2.5.4.42": "GN",
  "2.5.4.43": "initials",
  "2.5.4.44": "generationQualifier",
  "2.5.4.45": "x500UniqueIdentifier",
  "2.5.4.46": "dnQualifier",
  "2.5.4.54": "dmdName",
  "2.5.4.65": "pseudonym",
  "2.5.4.72": "role",
  "2.5.4.97": "organizationIdentifier",
  "1.2.840.113549.1.9.1": "emailAddress",
  "1.2.840.113549.1.9.2": "unstructuredName",
  "1.2.840.113549.1.9.8": "unstructuredAddress",
  "0.9.2342.19200300.100.1.1": "UID",
  "0.9.2342.19200300.100.1.25": "DC",
  "1.3.6.1.4.1.311.60.2.1.1": "jurisdictionL",
  "1.3.6.1.4.1.311.60.2.1.2": "jurisdictionST",
  "1.3.6.1.4.1.311.60.2.1.3": "jurisdictionC",
}

export type NameEntries = [string, string[]][]

function attributeText(value: unknown): string | null {
  if (value instanceof asn1js.BaseStringBlock) return value.getValue()
  return null
}

export function nameEntries(name: RelativeDistinguishedNames): NameEntries {
  const entries: NameEntries = []
  for (const attribute of name.typesAndValues) {
    const text = attributeText(attribute.value)
    if (text === null) continue
    const key = SHORT_NAMES[attribute.type] ?? "UNDEF"
    const existing = entries.find(([name]) => name === key)
    if (existing) existing[1].push(text)
    else entries.push([key, [text]])
  }
  return entries
}

export function distinguishedName(entries: NameEntries): string {
  return entries.flatMap(([key, values]) => values.map((value) => `${key}=${value}`)).join(", ")
}

export function serialHex(certificate: Certificate): string {
  const bytes = Buffer.from(certificate.serialNumber.valueBlock.valueHexView)
  if (bytes.length === 0) return "0"
  let value = BigInt(`0x${bytes.toString("hex")}`)
  const negative = (bytes[0] & 0x80) !== 0
  if (negative) value = (BigInt(1) << BigInt(bytes.length * 8)) - value
  if (value === BigInt(0)) return "0"
  let hex = value.toString(16).toUpperCase()
  if (hex.length % 2 === 1) hex = `0${hex}`
  return `${negative ? "-" : ""}${hex}`
}

export function secondsOf(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

export function phpTrim(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
}

export function mbSubstr(value: string, length: number): string {
  return Array.from(value).slice(0, length).join("")
}
