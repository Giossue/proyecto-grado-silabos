const isDigit = (byte: number) => byte >= 0x30 && byte <= 0x39
const isSpace = (byte: number) => byte === 0x20 || (byte >= 0x09 && byte <= 0x0d)
const upper = (byte: number) => (byte >= 0x61 && byte <= 0x7a ? byte - 0x20 : byte)

type Cursor = { bytes: Buffer; at: number }

const byteAt = (cursor: Cursor) => (cursor.at < cursor.bytes.length ? cursor.bytes[cursor.at] : 0)
const digitAt = (cursor: Cursor) => cursor.at < cursor.bytes.length && isDigit(cursor.bytes[cursor.at])

function compareRight(a: Cursor, b: Cursor): number {
  let bias = 0
  for (; ; a.at++, b.at++) {
    const aDigit = digitAt(a)
    const bDigit = digitAt(b)
    if (!aDigit && !bDigit) return bias
    if (!aDigit) return -1
    if (!bDigit) return 1
    if (bias === 0 && byteAt(a) !== byteAt(b)) bias = byteAt(a) < byteAt(b) ? -1 : 1
  }
}

function compareLeft(a: Cursor, b: Cursor): number {
  for (; ; a.at++, b.at++) {
    const aDigit = digitAt(a)
    const bDigit = digitAt(b)
    if (!aDigit && !bDigit) return 0
    if (!aDigit) return -1
    if (!bDigit) return 1
    if (byteAt(a) !== byteAt(b)) return byteAt(a) < byteAt(b) ? -1 : 1
  }
}

export function strnatcasecmp(left: string, right: string): number {
  const a: Cursor = { bytes: Buffer.from(left), at: 0 }
  const b: Cursor = { bytes: Buffer.from(right), at: 0 }
  if (a.bytes.length === 0 || b.bytes.length === 0) return a.bytes.length === b.bytes.length ? 0 : a.bytes.length > b.bytes.length ? 1 : -1
  let leading = true
  for (;;) {
    let ca = byteAt(a)
    let cb = byteAt(b)
    while (leading && ca === 0x30 && a.at + 1 < a.bytes.length && isDigit(a.bytes[a.at + 1])) ca = a.bytes[++a.at]
    while (leading && cb === 0x30 && b.at + 1 < b.bytes.length && isDigit(b.bytes[b.at + 1])) cb = b.bytes[++b.at]
    leading = false
    while (isSpace(ca)) ca = a.bytes[++a.at] ?? 0
    while (isSpace(cb)) cb = b.bytes[++b.at] ?? 0
    if (isDigit(ca) && isDigit(cb)) {
      const result = ca === 0x30 || cb === 0x30 ? compareLeft(a, b) : compareRight(a, b)
      if (result !== 0) return result
      const aEnd = a.at >= a.bytes.length
      const bEnd = b.at >= b.bytes.length
      if (aEnd && bEnd) return 0
      if (aEnd) return -1
      if (bEnd) return 1
      ca = byteAt(a)
      cb = byteAt(b)
    }
    ca = upper(ca)
    cb = upper(cb)
    if (ca !== cb) return ca < cb ? -1 : 1
    a.at++
    b.at++
    const aEnd = a.at >= a.bytes.length
    const bEnd = b.at >= b.bytes.length
    if (aEnd && bEnd) return 0
    if (aEnd) return -1
    if (bEnd) return 1
  }
}
