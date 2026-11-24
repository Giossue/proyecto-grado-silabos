export const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

const END_OF_CHAIN = 0xfffffffe
const FREE = 0xffffffff
const MAX_CHAIN = 1 << 22

export const CFB_STORAGE = 1
export const CFB_STREAM = 2
export const CFB_ROOT = 5

export type CfbEntry = { name: string; rawName: number[]; type: number; start: number; size: number; clsid: Buffer }

export type Cfb = { entries: CfbEntry[]; root: CfbEntry | null; miniStream(): Buffer | null; read(entry: CfbEntry): Buffer; find(name: string, type: number): CfbEntry | null }

export class CfbError extends Error {}

export function isCfb(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(CFB_SIGNATURE)
}

export function readCfb(bytes: Buffer): Cfb {
  if (bytes.length < 512 || !isCfb(bytes)) throw new CfbError("No es un archivo OLE.")
  const sectorShift = bytes.readUInt16LE(0x1e)
  const miniShift = bytes.readUInt16LE(0x20)
  if (sectorShift > 20 || miniShift > 20 || sectorShift < 7) throw new CfbError("Tamaño de sector inválido.")
  const sectorSize = 1 << sectorShift
  const miniSize = 1 << miniShift
  const fatSectors = bytes.readUInt32LE(0x2c)
  const firstDirectory = bytes.readUInt32LE(0x30)
  const cutoff = bytes.readUInt32LE(0x38)
  const firstMiniFat = bytes.readUInt32LE(0x3c)
  let difatNext = bytes.readUInt32LE(0x44)
  const sectorOffset = (sector: number) => (sector + 1) * sectorSize
  const sector = (index: number): Buffer => {
    const start = sectorOffset(index)
    if (start + sectorSize > bytes.length) throw new CfbError("Sector fuera del archivo.")
    return bytes.subarray(start, start + sectorSize)
  }
  const fatList: number[] = []
  for (let index = 0; index < 109 && fatList.length < fatSectors; index++) {
    const value = bytes.readUInt32LE(0x4c + index * 4)
    if (value === FREE) break
    fatList.push(value)
  }
  let guard = 0
  while (fatList.length < fatSectors && difatNext !== END_OF_CHAIN && difatNext !== FREE) {
    if (++guard > MAX_CHAIN) throw new CfbError("DIFAT circular.")
    const block = sector(difatNext)
    const perBlock = sectorSize / 4 - 1
    for (let index = 0; index < perBlock && fatList.length < fatSectors; index++) fatList.push(block.readUInt32LE(index * 4))
    difatNext = block.readUInt32LE(perBlock * 4)
  }
  const fat: number[] = []
  for (const index of fatList) {
    const block = sector(index)
    for (let offset = 0; offset < sectorSize; offset += 4) fat.push(block.readUInt32LE(offset))
  }
  const chain = (start: number, table: number[]): number[] => {
    const result: number[] = []
    const seen = new Set<number>()
    let current = start
    while (current !== END_OF_CHAIN && current !== FREE) {
      if (seen.has(current) || current >= table.length || result.length > MAX_CHAIN) throw new CfbError("Cadena de sectores dañada.")
      seen.add(current)
      result.push(current)
      current = table[current]
    }
    return result
  }
  const readChain = (start: number) => Buffer.concat(chain(start, fat).map(sector))
  const directory = readChain(firstDirectory)
  const entries: CfbEntry[] = []
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const raw: number[] = []
    for (let index = 0; index < 32; index++) raw.push(directory.readUInt16LE(offset + index * 2))
    const nameLength = directory.readUInt16LE(offset + 64)
    const units = raw.slice(0, Math.max(0, Math.min(32, nameLength / 2 - 1)))
    entries.push({
      name: String.fromCharCode(...units),
      rawName: raw,
      type: directory[offset + 66],
      start: directory.readUInt32LE(offset + 116),
      size: directory.readUInt32LE(offset + 120),
      clsid: Buffer.from(directory.subarray(offset + 80, offset + 96)),
    })
  }
  const root = entries.find((entry) => entry.type === CFB_ROOT) ?? null
  let mini: Buffer | null | undefined
  const miniStream = (): Buffer | null => {
    if (mini !== undefined) return mini
    if (root === null || root.start >= 0x80000000) return (mini = null)
    if (root.size === 0) throw new CfbError("Flujo corto vacío.")
    return (mini = readChain(root.start).subarray(0, root.size))
  }
  const miniTable = firstMiniFat >= 0x80000000 ? Buffer.alloc(0) : readChain(firstMiniFat)
  const miniFat: number[] = []
  for (let offset = 0; offset + 4 <= miniTable.length; offset += 4) miniFat.push(miniTable.readUInt32LE(offset))
  const read = (entry: CfbEntry): Buffer => {
    const stream = miniStream()
    if (entry.size < cutoff && stream !== null) {
      const parts = chain(entry.start, miniFat).map((index) => {
        const start = index * miniSize
        if (start + miniSize > stream.length) throw new CfbError("Sector corto fuera del flujo.")
        return stream.subarray(start, start + miniSize)
      })
      return Buffer.concat(parts).subarray(0, entry.size)
    }
    if (entry.size === 0 || entry.start === END_OF_CHAIN) throw new CfbError("Flujo vacío.")
    return readChain(entry.start).subarray(0, entry.size)
  }
  const find = (name: string, type: number): CfbEntry | null => {
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index]
      if (entry.type !== type) continue
      const units = [...name].map((character) => character.charCodeAt(0)).concat(0)
      if (units.every((unit, position) => entry.rawName[position] === unit)) return entry
    }
    return null
  }
  return { entries, root, miniStream, read, find }
}
