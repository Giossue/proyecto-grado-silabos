import { randomBytes } from "node:crypto"

const FLOAT_TAG = `php-float-${randomBytes(8).toString("hex")}:`
const FLOAT_MARKER = new RegExp(`"${FLOAT_TAG}(-?[0-9.eE+-]+)"`, "g")

class PhpFloat {
  constructor(readonly value: number) {}

  toJSON(): string {
    return `${FLOAT_TAG}${this.value}`
  }
}

export function phpFloat(value: number): PhpFloat {
  return new PhpFloat(value)
}

function writeFloat(literal: string): string {
  return /^-?\d+$/.test(literal) ? `${literal}.0` : literal
}

function escapeForPhp(json: string, unescapedSlashes: boolean): string {
  return json.replace(/[/\u007f-￿]/g, (character) => {
    if (character === "/") return unescapedSlashes ? character : "\\/"
    if (character === "\u007f") return character
    return "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
  })
}

export function phpJsonEncode(value: unknown, options: { pretty?: boolean; unescapedSlashes?: boolean } = {}): string {
  const json = options.pretty ? JSON.stringify(value, null, 4) : JSON.stringify(value)
  return escapeForPhp(json.replace(FLOAT_MARKER, (_, literal: string) => writeFloat(literal)), options.unescapedSlashes === true)
}
