import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { serializeString, unserializeString } from "./phpSerialize"

export class DecryptError extends Error {}

const CIPHER = "aes-256-cbc"
const KEY_BYTES = 32
const IV_BYTES = 16

type Envelope = { iv: string; value: string; mac: string; tag?: string }

export function parseAppKey(appKey: string): Buffer {
  const key = appKey.startsWith("base64:") ? Buffer.from(appKey.slice(7), "base64") : Buffer.from(appKey, "utf8")
  if (key.length !== KEY_BYTES) throw new Error("Unsupported APP_KEY length.")
  return key
}

function mac(iv: string, value: string, key: Buffer): string {
  return createHmac("sha256", key).update(iv + value).digest("hex")
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function readEnvelope(payload: string): Envelope {
  let envelope: unknown
  try {
    envelope = JSON.parse(Buffer.from(payload, "base64").toString("utf8"))
  } catch {
    throw new DecryptError("The payload is invalid.")
  }
  if (typeof envelope !== "object" || envelope === null) throw new DecryptError("The payload is invalid.")
  const { iv, value, mac: givenMac, tag } = envelope as Record<string, unknown>
  if (typeof iv !== "string" || typeof value !== "string" || typeof givenMac !== "string") {
    throw new DecryptError("The payload is invalid.")
  }
  if (Buffer.from(iv, "base64").length !== IV_BYTES) throw new DecryptError("The payload is invalid.")
  if (typeof tag === "string" && tag !== "") throw new DecryptError("Unable to use tag because the cipher algorithm does not support AEAD.")
  return { iv, value, mac: givenMac }
}

export function decrypt(payload: string, key: Buffer, unserialize: boolean): string {
  const envelope = readEnvelope(payload)
  if (!sameText(mac(envelope.iv, envelope.value, key), envelope.mac)) throw new DecryptError("The MAC is invalid.")
  let plain: string
  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(envelope.iv, "base64"))
    plain = Buffer.concat([decipher.update(Buffer.from(envelope.value, "base64")), decipher.final()]).toString("utf8")
  } catch {
    throw new DecryptError("Could not decrypt the data.")
  }
  if (!unserialize) return plain
  try {
    return unserializeString(plain)
  } catch {
    throw new DecryptError("Could not unserialize the data.")
  }
}

export function encrypt(value: string, key: Buffer, serialize: boolean): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(CIPHER, key, iv)
  const plain = serialize ? serializeString(value) : value
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("base64")
  const ivText = iv.toString("base64")
  const envelope = { iv: ivText, value: encrypted, mac: mac(ivText, encrypted, key), tag: "" }
  return Buffer.from(JSON.stringify(envelope)).toString("base64")
}
