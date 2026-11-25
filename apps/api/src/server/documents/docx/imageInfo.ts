export class InvalidImage extends Error {}

export type ImageInfo = { width: number; height: number; extension: string; mime: string }

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_FRAMES = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpegSize(bytes: Buffer): [number, number] | null {
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === 0xff) {
      offset++
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = bytes.readUInt16BE(offset + 2)
    if (JPEG_FRAMES.has(marker)) return offset + 9 <= bytes.length ? [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)] : null
    offset += 2 + length
  }
  return null
}

export function imageInfo(bytes: Buffer): ImageInfo {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG)) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), extension: "png", mime: "image/png" }
  }
  if (bytes.length >= 10 && (bytes.subarray(0, 6).toString("latin1") === "GIF87a" || bytes.subarray(0, 6).toString("latin1") === "GIF89a")) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), extension: "gif", mime: "image/gif" }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const size = jpegSize(bytes)
    if (size !== null) return { width: size[0], height: size[1], extension: "jpg", mime: "image/jpeg" }
  }
  throw new InvalidImage("Invalid image")
}
