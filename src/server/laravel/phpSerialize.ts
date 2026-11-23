export function serializeString(value: string): string {
  return `s:${Buffer.byteLength(value, "utf8")}:"${value}";`
}

export function unserializeString(serialized: string): string {
  const match = /^s:(\d+):"/.exec(serialized)
  if (!match) throw new Error("Only serialized strings are supported.")
  const bytes = Buffer.from(serialized, "utf8")
  const start = Buffer.byteLength(match[0], "utf8")
  const length = Number(match[1])
  const end = start + length
  if (end + 2 !== bytes.length || bytes.toString("utf8", end, end + 2) !== '";') {
    throw new Error("The serialized string is malformed.")
  }
  return bytes.toString("utf8", start, end)
}
