const ATOM = String.raw`[\x21\x23-\x27\x2A\x2B\x2D\x2F-\x39\x3D\x3F\x5E-\x7E]+`
const QUOTED = String.raw`\x22(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21\x23-\x5B\x5D-\x7F]|(?:\x5C[\x00-\x7F]))*\x22`
const COUNTED = String.raw`(?:(?:\x22?\x5C[\x00-\x7E]\x22?)|(?:\x22?[^\x5C\x22]\x22?))`
const OCTET = String.raw`(?:(?:25[0-5])|(?:2[0-4][0-9])|(?:1[0-9]{2})|(?:[1-9]?[0-9]))`
const HOSTNAME = String.raw`(?:(?!.*[^.]{64,})(?:(?:(?:xn--)?[a-z0-9]+(?:-+[a-z0-9]+)*\.){1,126}){1,}(?:(?:[a-z][a-z0-9]*)|(?:(?:xn--)[a-z0-9]+))(?:-+[a-z0-9]+)*)`
const IPV6_LITERAL = String.raw`(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){7})|(?:(?!(?:.*[a-f0-9][:\]]){7,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?)))`
const IPV4_TAIL = String.raw`(?:(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){5}:)|(?:(?!(?:.*[a-f0-9]:){5,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3}:)?)))?${OCTET}(?:\.${OCTET}){3})`
const FILTER_EMAIL = new RegExp(
  `^(?!${COUNTED}{255,})(?!${COUNTED}{65,}@)(?:(?:${ATOM})|(?:${QUOTED}))(?:\\.(?:(?:${ATOM})|(?:${QUOTED})))*@(?:${HOSTNAME}|(?:\\[(?:${IPV6_LITERAL}|${IPV4_TAIL})\\]))$`,
  "i",
)

export type EmailShape = "valid" | "invalid"

export function filterEmailShape(value: unknown): EmailShape {
  if (typeof value !== "string" || new TextEncoder().encode(value).length > 320) return "invalid"
  return FILTER_EMAIL.test(value) ? "valid" : "invalid"
}

const LOCAL_ATOM = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\-\u0080-\u{10FFFF}]+$/u
const LABEL = /^[A-Za-z0-9\u0080-\u{10FFFF}](?:[A-Za-z0-9\-\u0080-\u{10FFFF}]*[A-Za-z0-9\u0080-\u{10FFFF}])?$/u
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const IPV6 = /^IPv6:[0-9A-Fa-f:.]+$/

function withoutComments(value: string): string | null {
  let result = ""
  let depth = 0
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === "\\" && (quoted || depth > 0)) {
      if (index + 1 >= value.length) return null
      if (depth === 0) result += character + value[index + 1]
      index += 1
      continue
    }
    if (depth === 0 && character === '"') quoted = !quoted
    if (!quoted && character === "(") {
      depth += 1
      continue
    }
    if (!quoted && character === ")") {
      if (depth === 0) return null
      depth -= 1
      continue
    }
    if (depth === 0) result += character
  }
  return depth === 0 && !quoted ? result : null
}

function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = []
  let current = ""
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quoted && character === "\\") {
      current += character + (value[index + 1] ?? "")
      index += 1
      continue
    }
    if (character === '"') quoted = !quoted
    if (!quoted && character === separator) {
      parts.push(current)
      current = ""
      continue
    }
    current += character
  }
  parts.push(current)
  return parts
}

function validLocalWord(word: string): boolean {
  if (LOCAL_ATOM.test(word)) return true
  return /^"(?:[^"\\\r\n]|\\[^\r\n])*"$/u.test(word)
}

function validDomain(domain: string): boolean {
  if (domain.startsWith("[") && domain.endsWith("]")) {
    const literal = domain.slice(1, -1)
    return IPV4.test(literal) || IPV6.test(literal)
  }
  if (domain.length > 253) return false
  return domain.split(".").every((label) => [...label].length <= 63 && LABEL.test(label))
}

export function emailShape(value: unknown): EmailShape {
  if (typeof value !== "string" || value === "") return "invalid"
  const stripped = withoutComments(value)
  if (stripped === null) return "invalid"
  const parts = splitOutsideQuotes(stripped, "@")
  if (parts.length !== 2) return "invalid"
  const [local, domain] = parts
  if (local === "" || domain === "") return "invalid"
  if (!splitOutsideQuotes(local, ".").every((word) => word !== "" && validLocalWord(word))) return "invalid"
  return validDomain(domain) ? "valid" : "invalid"
}
