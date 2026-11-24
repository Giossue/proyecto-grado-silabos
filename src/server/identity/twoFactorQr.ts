import "server-only"
import { EncodeHintType, QRCodeDecoderErrorCorrectionLevel, QRCodeEncoder, QRCodeVersion, type QRCodeByteMatrix } from "@zxing/library"

const SIZE = 192
const BACKGROUND = "#ffffff"
const FOREGROUND = "#2d3748"
const FINDER = 7

type Point = [number, number]
type Operation = { kind: "M" | "L"; x: number; y: number } | { kind: "Z" }
type Grid = { width: number; height: number; bytes: number[] }

export function rawUrlEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function twoFactorQrCodeUrl(company: string, holder: string, secret: string): string {
  const issuer = rawUrlEncode(company)
  return `otpauth://totp/${issuer}:${rawUrlEncode(holder)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
}

function isSet(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && x < grid.width && y >= 0 && y < grid.height && grid.bytes[grid.width * y + x] === 1
}

function findEdge(grid: Grid, startX: number, startY: number): Point[] {
  const points: Point[] = []
  let x = startX
  let y = startY
  let dirX = 0
  let dirY = 1
  for (;;) {
    points.push([x, y])
    x += dirX
    y += dirY
    if (x === startX && y === startY) return points
    const left = isSet(grid, x + (dirX + dirY - 1) / 2, y + (dirY - dirX - 1) / 2)
    const right = isSet(grid, x + (dirX - dirY - 1) / 2, y + (dirY + dirX - 1) / 2)
    const turn = dirX
    if (right) {
      dirX = -dirY
      dirY = turn
    } else if (!left) {
      dirX = dirY
      dirY = -turn
    }
  }
}

function xorEdge(grid: Grid, points: Point[]): void {
  const maxX = Math.max(...points.map(([x]) => x))
  let previousY = points[0][1]
  for (const [x, y] of points.slice(1)) {
    if (y === previousY) continue
    const minY = Math.min(previousY, y)
    for (let column = x; column < maxX; column++) grid.bytes[grid.width * minY + column] = isSet(grid, column, minY) ? 0 : 1
    previousY = y
  }
}

function simplified(points: Point[]): Point[] {
  return points.filter((current, index) => {
    const previous = points[(index === 0 ? points.length : index) - 1]
    const next = points[(index === points.length - 1 ? -1 : index) + 1]
    return !((previous[0] === current[0] && current[0] === next[0]) || (previous[1] === current[1] && current[1] === next[1]))
  })
}

function squarePath(source: Grid): Operation[] {
  const grid: Grid = { ...source, bytes: [...source.bytes] }
  const operations: Operation[] = []
  let index = grid.bytes.indexOf(1)
  while (index >= 0) {
    const y = Math.floor(index / grid.width)
    const points = findEdge(grid, index - y * grid.width, y)
    xorEdge(grid, points)
    const [first, ...rest] = simplified(points)
    operations.push({ kind: "M", x: first[0], y: first[1] }, ...rest.map(([x, y]): Operation => ({ kind: "L", x, y })), { kind: "Z" })
    const next = grid.bytes.indexOf(1, index)
    index = next
  }
  return operations
}

function filled(width: number, height: number, predicate: (x: number, y: number) => boolean): Grid {
  const bytes: number[] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bytes.push(predicate(x, y) ? 1 : 0)
  return { width, height, bytes }
}

function transform(operations: Operation[], degrees: number, dx: number, dy: number): Operation[] {
  const radians = (degrees * Math.PI) / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  return operations.map((operation) => {
    if (operation.kind === "Z") return operation
    const x = degrees === 0 ? operation.x : operation.x * cos - operation.y * sin
    const y = degrees === 0 ? operation.y : operation.x * sin + operation.y * cos
    return { kind: operation.kind, x: x + dx, y: y + dy }
  })
}

function phpRound(value: number): number {
  const scaled = Math.round(Math.abs(value) * 1000) / 1000
  return value < 0 || Object.is(value, -0) ? -scaled : scaled
}

function phpNumber(value: number): string {
  const rounded = phpRound(value)
  return Object.is(rounded, -0) ? "-0" : String(rounded)
}

function pathData(operations: Operation[]): string {
  return operations.map((operation) => (operation.kind === "Z" ? "Z" : `${operation.kind}${phpNumber(operation.x)} ${phpNumber(operation.y)}`)).join("")
}

const N1 = 3
const N2 = 3
const N3 = 40
const N4 = 10

type Cells = ArrayLike<number>[]

function runPenalty(cells: Cells, horizontal: boolean): number {
  let penalty = 0
  const outer = horizontal ? cells.length : cells[0].length
  const inner = horizontal ? cells[0].length : cells.length
  for (let i = 0; i < outer; i++) {
    let same = 0
    let previous = -1
    for (let j = 0; j < inner; j++) {
      const bit = horizontal ? cells[i][j] : cells[j][i]
      if (bit === previous) {
        same++
        continue
      }
      if (same >= 5) penalty += N1 + (same - 5)
      same = 1
      previous = bit
    }
    if (same >= 5) penalty += N1 + (same - 5)
  }
  return penalty
}

function blockPenalty(cells: Cells): number {
  let blocks = 0
  for (let y = 0; y < cells.length - 1; y++) {
    for (let x = 0; x < cells[y].length - 1; x++) {
      const value = cells[y][x]
      if (value === cells[y][x + 1] && value === cells[y + 1][x] && value === cells[y + 1][x + 1]) blocks++
    }
  }
  return N2 * blocks
}

const FINDER_LIKE = [1, 0, 1, 1, 1, 0, 1]

function finderPenalty(cells: Cells): number {
  const height = cells.length
  const width = cells[0].length
  const at = (x: number, y: number, horizontal: boolean, offset: number) => (horizontal ? cells[y][x + offset] : cells[y + offset][x])
  const light = (x: number, y: number, horizontal: boolean, from: number) => [0, 1, 2, 3].every((step) => at(x, y, horizontal, from + step) === 0)
  let penalty = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const horizontal of [true, false]) {
        const position = horizontal ? x : y
        const limit = horizontal ? width : height
        if (position + 6 >= limit || !FINDER_LIKE.every((bit, offset) => at(x, y, horizontal, offset) === bit)) continue
        if ((position + 10 < limit && light(x, y, horizontal, 7)) || (position - 4 >= 0 && light(x, y, horizontal, -4))) penalty += N3
      }
    }
  }
  return penalty
}

function balancePenalty(cells: Cells): number {
  let dark = 0
  for (const row of cells) for (let x = 0; x < row.length; x++) if (row[x] === 1) dark++
  const total = cells.length * cells[0].length
  return Math.floor(Math.abs(dark / total - 0.5) * 20) * N4
}

const BYTE_MODE_BITS = 4

function byteCountBits(version: number): number {
  return version <= 9 ? 8 : 16
}

function dataBytes(version: number): number {
  const entry = QRCodeVersion.getVersionForNumber(version)
  return entry.getTotalCodewords() - entry.getECBlocksForLevel(QRCodeDecoderErrorCorrectionLevel.L).getTotalECCodewords()
}

function chooseVersion(bits: number): number {
  for (let version = 1; version <= 40; version++) if (dataBytes(version) >= Math.floor((bits + 8) / 8)) return version
  throw new Error("Data too big")
}

export function baconVersion(content: string): number {
  const length = Buffer.byteLength(content, "latin1")
  const provisional = chooseVersion(BYTE_MODE_BITS + byteCountBits(1) + length * 8)
  return chooseVersion(BYTE_MODE_BITS + byteCountBits(provisional) + length * 8)
}

const baconEncoder: Pick<typeof QRCodeEncoder, "encode"> = Object.assign(Object.create(QRCodeEncoder), {
  willFit: (bits: number, version: QRCodeVersion): boolean => dataBytes(version.getVersionNumber()) >= Math.floor((bits + 8) / 8),
  calculateMaskPenalty: (matrix: QRCodeByteMatrix): number => {
    const cells = matrix.getArray() as unknown as Cells
    return runPenalty(cells, true) + runPenalty(cells, false) + blockPenalty(cells) + finderPenalty(cells) + balancePenalty(cells)
  },
})

function moduleGrid(content: string): Grid {
  const hints = new Map([[EncodeHintType.QR_VERSION, baconVersion(content)]])
  const matrix = baconEncoder.encode(content, QRCodeDecoderErrorCorrectionLevel.L, hints).getMatrix()
  const width = matrix.getWidth()
  const inFinder = (x: number, y: number) =>
    (x < FINDER && y < FINDER) || (x >= width - FINDER && y < FINDER) || (x < FINDER && y >= width - FINDER)
  return filled(width, matrix.getHeight(), (x, y) => !inFinder(x, y) && matrix.get(x, y) === 1)
}

export function qrCodeSvg(content: string): string {
  const grid = moduleGrid(content)
  const size = grid.width
  const external = transform(squarePath(filled(7, 7, (x, y) => x === 0 || x === 6 || y === 0 || y === 6)), 0, -3.5, -3.5)
  const internal = transform(squarePath(filled(3, 3, () => true)), 0, -1.5, -1.5)
  const eyes: [number, number, number][] = [
    [3.5, 3.5, 0],
    [size - 3.5, 3.5, 90],
    [3.5, size - 3.5, -90],
  ]
  let operations = squarePath(grid)
  for (const [dx, dy, degrees] of eyes) operations = [...operations, ...transform(external, degrees, dx, dy), ...transform(internal, degrees, dx, dy)]
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>` +
    `<g transform="scale(${phpNumber(SIZE / size)})"><g transform="translate(0,0)">` +
    `<path fill-rule="evenodd" d="${pathData(operations)}" fill="${FOREGROUND}"/></g></g></svg>`
  )
}

export function twoFactorQrCodeSvg(company: string, holder: string, secret: string): string {
  return qrCodeSvg(twoFactorQrCodeUrl(company, holder, secret))
}
