import { inflateRawSync } from "node:zlib"

export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; localOffset: number }

export class ZipError extends Error {}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

function findEndOfCentralDirectory(bytes: Buffer): number {
  const lowest = Math.max(0, bytes.length - 22 - 0xffff)
  for (let offset = bytes.length - 22; offset >= lowest; offset--) if (bytes.readUInt32LE(offset) === EOCD) return offset
  throw new ZipError("No es un .zip.")
}

export function zipEntries(bytes: Buffer): ZipEntry[] {
  if (bytes.length < 22) throw new ZipError("No es un .zip.")
  const end = findEndOfCentralDirectory(bytes)
  const count = bytes.readUInt16LE(end + 10)
  let offset = bytes.readUInt32LE(end + 16)
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== CENTRAL) throw new ZipError("Directorio central dañado.")
    const nameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    entries.push({
      name: bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      method: bytes.readUInt16LE(offset + 10),
      compressedSize: bytes.readUInt32LE(offset + 20),
      size: bytes.readUInt32LE(offset + 24),
      localOffset: bytes.readUInt32LE(offset + 42),
    })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export function zipRead(bytes: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localOffset
  if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== LOCAL) throw new ZipError("Entrada dañada.")
  const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28)
  const data = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return Buffer.from(data)
  if (entry.method === 8) return inflateRawSync(data)
  throw new ZipError("Compresión no soportada.")
}

export function zipFile(bytes: Buffer, name: string): Buffer | null {
  const entry = zipEntries(bytes).find((candidate) => candidate.name === name)
  return entry === undefined ? null : zipRead(bytes, entry)
}
