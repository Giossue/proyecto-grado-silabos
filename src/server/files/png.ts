import { deflateSync, inflateSync } from "node:zlib"

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export class PngError extends Error {}

export type TrueColorImage = { width: number; height: number; red: Uint8Array; green: Uint8Array; blue: Uint8Array; alpha: Uint8Array }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  if (bytes.length >= 10 && (bytes.toString("latin1", 0, 6) === "GIF87a" || bytes.toString("latin1", 0, 6) === "GIF89a")) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null
      const marker = bytes[offset + 1]
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) }
      offset += 2 + bytes.readUInt16BE(offset + 2)
    }
  }
  return null
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const toLeft = Math.abs(estimate - left)
  const toUp = Math.abs(estimate - up)
  const toUpLeft = Math.abs(estimate - upLeft)
  if (toLeft <= toUp && toLeft <= toUpLeft) return left
  return toUp <= toUpLeft ? up : upLeft
}

function unfilter(data: Buffer, offset: number, width: number, height: number, bytesPerPixel: number, bytesPerRow: number): { rows: Uint8Array[]; next: number } {
  const rows: Uint8Array[] = []
  let previous = new Uint8Array(bytesPerRow)
  let position = offset
  for (let row = 0; row < height; row++) {
    if (position + 1 + bytesPerRow > data.length) throw new PngError("Datos de imagen incompletos.")
    const filter = data[position]
    const line = new Uint8Array(data.subarray(position + 1, position + 1 + bytesPerRow))
    position += 1 + bytesPerRow
    for (let index = 0; index < bytesPerRow; index++) {
      const left = index >= bytesPerPixel ? line[index - bytesPerPixel] : 0
      const up = previous[index]
      const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0
      if (filter === 1) line[index] = (line[index] + left) & 0xff
      else if (filter === 2) line[index] = (line[index] + up) & 0xff
      else if (filter === 3) line[index] = (line[index] + ((left + up) >> 1)) & 0xff
      else if (filter === 4) line[index] = (line[index] + paeth(left, up, upLeft)) & 0xff
      else if (filter !== 0) throw new PngError("Filtro desconocido.")
    }
    rows.push(line)
    previous = line
  }
  return { rows, next: position }
}

const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
]

export function decodePng(bytes: Buffer): TrueColorImage {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new PngError("No es un PNG.")
  let offset = 8
  let header: Buffer | null = null
  const data: Buffer[] = []
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString("latin1", offset + 4, offset + 8)
    if (offset + 12 + length > bytes.length) throw new PngError("Bloque incompleto.")
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    const critical = (bytes[offset + 4] & 0x20) === 0
    if (critical && crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) throw new PngError("CRC inválido.")
    offset += 12 + length
    if (type === "IHDR") header = Buffer.from(body)
    else if (type === "IDAT") data.push(body)
    else if (type === "IEND") break
  }
  if (header === null || header.length < 13 || data.length === 0) throw new PngError("PNG incompleto.")
  const width = header.readUInt32BE(0)
  const height = header.readUInt32BE(4)
  const depth = header[8]
  const colorType = header[9]
  const interlaced = header[12] === 1
  const channels = colorType === 6 ? 4 : colorType === 4 ? 2 : 0
  if (channels === 0 || (depth !== 8 && depth !== 16) || width === 0 || height === 0) throw new PngError("Tipo de PNG no soportado.")
  let raw: Buffer
  try {
    raw = inflateSync(Buffer.concat(data))
  } catch (error) {
    throw new PngError("Datos comprimidos inválidos.", { cause: error })
  }
  const sampleBytes = depth / 8
  const bytesPerPixel = channels * sampleBytes
  const image: TrueColorImage = { width, height, red: new Uint8Array(width * height), green: new Uint8Array(width * height), blue: new Uint8Array(width * height), alpha: new Uint8Array(width * height) }
  const put = (line: Uint8Array, column: number, x: number, y: number) => {
    const sample = (channel: number) => line[column * bytesPerPixel + channel * sampleBytes]
    const index = y * width + x
    if (channels === 4) {
      image.red[index] = sample(0)
      image.green[index] = sample(1)
      image.blue[index] = sample(2)
      image.alpha[index] = 127 - (sample(3) >> 1)
    } else {
      image.red[index] = image.green[index] = image.blue[index] = sample(0)
      image.alpha[index] = 127 - (sample(1) >> 1)
    }
  }
  if (!interlaced) {
    const { rows } = unfilter(raw, 0, width, height, bytesPerPixel, width * bytesPerPixel)
    rows.forEach((line, y) => {
      for (let x = 0; x < width; x++) put(line, x, x, y)
    })
    return image
  }
  let position = 0
  for (const [startX, startY, stepX, stepY] of ADAM7) {
    const passWidth = Math.ceil((width - startX) / stepX)
    const passHeight = Math.ceil((height - startY) / stepY)
    if (passWidth <= 0 || passHeight <= 0) continue
    const { rows, next } = unfilter(raw, position, passWidth, passHeight, bytesPerPixel, passWidth * bytesPerPixel)
    position = next
    rows.forEach((line, row) => {
      for (let column = 0; column < passWidth; column++) put(line, column, startX + column * stepX, startY + row * stepY)
    })
  }
  return image
}

const f = Math.fround

export function resampleOnto(target: TrueColorImage, source: TrueColorImage, dstX: number, dstY: number, dstW: number, dstH: number): void {
  const srcW = source.width
  const srcH = source.height
  for (let y = dstY; y < dstY + dstH; y++) {
    for (let x = dstX; x < dstX + dstW; x++) {
      let spixels = f(0)
      let red = f(0)
      let green = f(0)
      let blue = f(0)
      let alpha = f(0)
      let alphaSum = f(0)
      let contribSum = f(0)
      const sy1 = f(f(f(y - dstY) * f(srcH)) / f(dstH))
      const sy2 = f(f(f(y + 1 - dstY) * f(srcH)) / f(dstH))
      let sy = sy1
      do {
        let yportion: number
        if (Math.floor(sy) === Math.floor(sy1)) {
          yportion = f(1.0 - f(sy - Math.floor(sy)))
          if (yportion > f(sy2 - sy1)) yportion = f(sy2 - sy1)
          sy = Math.floor(sy)
        } else if (sy === Math.floor(sy2)) yportion = f(sy2 - Math.floor(sy2))
        else yportion = f(1)
        const sx1 = f(f(f(x - dstX) * f(srcW)) / f(dstW))
        const sx2 = f(f(f(x + 1 - dstX) * f(srcW)) / f(dstW))
        let sx = sx1
        do {
          let xportion: number
          if (Math.floor(sx) === Math.floor(sx1)) {
            xportion = f(1.0 - f(sx - Math.floor(sx)))
            if (xportion > f(sx2 - sx1)) xportion = f(sx2 - sx1)
            sx = Math.floor(sx)
          } else if (sx === Math.floor(sx2)) xportion = f(sx2 - Math.floor(sx2))
          else xportion = f(1)
          const pcontribution = f(xportion * yportion)
          const index = Math.trunc(sy) * srcW + Math.trunc(sx)
          const pixelAlpha = source.alpha[index]
          const alphaFactor = f(f(127 - pixelAlpha) * pcontribution)
          red = f(red + f(source.red[index] * alphaFactor))
          green = f(green + f(source.green[index] * alphaFactor))
          blue = f(blue + f(source.blue[index] * alphaFactor))
          alpha = f(alpha + f(pixelAlpha * pcontribution))
          alphaSum = f(alphaSum + alphaFactor)
          contribSum = f(contribSum + pcontribution)
          spixels = f(spixels + f(xportion * yportion))
          sx = f(sx + 1)
        } while (sx < sx2)
        sy = f(sy + 1)
      } while (sy < sy2)
      if (spixels !== 0) {
        red = f(red / spixels)
        green = f(green / spixels)
        blue = f(blue / spixels)
        alpha = f(alpha / spixels)
      }
      if (alphaSum !== 0) {
        if (contribSum !== 0) alphaSum = f(alphaSum / contribSum)
        red = f(red / alphaSum)
        green = f(green / alphaSum)
        blue = f(blue / alphaSum)
      }
      red = red >= 255.5 ? 255 : f(red + 0.5)
      blue = blue >= 255.5 ? 255 : f(blue + 0.5)
      green = green >= 255.5 ? 255 : f(green + 0.5)
      alpha = alpha >= 127.5 ? 127 : f(alpha + 0.5)
      const a = Math.trunc(alpha)
      if (a === 127) continue
      const index = y * target.width + x
      target.red[index] = Math.trunc(red) & 0xff
      target.green[index] = Math.trunc(green) & 0xff
      target.blue[index] = Math.trunc(blue) & 0xff
      target.alpha[index] = a
    }
  }
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, "latin1")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

function filterRow(row: Buffer, previous: Buffer): Buffer {
  let best: Buffer | null = null
  let bestSum = Infinity
  for (let type = 0; type <= 4; type++) {
    const out = Buffer.alloc(row.length + 1)
    out[0] = type
    let sum = 0
    for (let index = 0; index < row.length; index++) {
      const left = index >= 4 ? row[index - 4] : 0
      const up = previous[index]
      const upLeft = index >= 4 ? previous[index - 4] : 0
      const predicted = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : type === 3 ? (left + up) >> 1 : paeth(left, up, upLeft)
      const value = (row[index] - predicted) & 0xff
      out[index + 1] = value
      sum += value < 128 ? value : 256 - value
    }
    if (sum < bestSum) {
      bestSum = sum
      best = out
    }
  }
  return best as Buffer
}

export function encodePng(image: TrueColorImage): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header[8] = 8
  header[9] = 6
  const physical = Buffer.alloc(9)
  physical.writeUInt32BE(3780, 0)
  physical.writeUInt32BE(3780, 4)
  physical[8] = 1
  const rows: Buffer[] = []
  let previous = Buffer.alloc(image.width * 4)
  for (let y = 0; y < image.height; y++) {
    const row = Buffer.alloc(image.width * 4)
    for (let x = 0; x < image.width; x++) {
      const index = y * image.width + x
      const alpha = image.alpha[index]
      row[x * 4] = image.red[index]
      row[x * 4 + 1] = image.green[index]
      row[x * 4 + 2] = image.blue[index]
      row[x * 4 + 3] = 255 - ((alpha << 1) + (alpha >> 6))
    }
    rows.push(filterRow(row, previous))
    previous = row
  }
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("pHYs", physical), chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 6 })), chunk("IEND", Buffer.alloc(0))])
}

export function blankImage(width: number, height: number): TrueColorImage {
  return { width, height, red: new Uint8Array(width * height), green: new Uint8Array(width * height), blue: new Uint8Array(width * height), alpha: new Uint8Array(width * height).fill(127) }
}

export function fitPng(bytes: Buffer, size: { width: number; height: number }): Buffer {
  let source: TrueColorImage
  try {
    source = decodePng(bytes)
  } catch (error) {
    throw error instanceof PngError ? error : new PngError("No se pudo leer el PNG.", { cause: error })
  }
  const scale = Math.min(size.width / source.width, size.height / source.height)
  const width = Math.max(1, phpRound(source.width * scale))
  const height = Math.max(1, phpRound(source.height * scale))
  const canvas = blankImage(size.width, size.height)
  resampleOnto(canvas, source, Math.trunc((size.width - width) / 2), Math.trunc((size.height - height) / 2), width, height)
  return encodePng(canvas)
}

function phpRound(value: number): number {
  const floor = Math.floor(value)
  return value - floor >= 0.5 ? floor + 1 : floor
}
