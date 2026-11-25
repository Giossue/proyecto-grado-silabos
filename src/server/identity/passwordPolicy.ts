import { createHash } from "node:crypto"
import { isPhpArray, type PhpArray, type PhpValue } from "../http/input"
import type { Rule } from "../http/validation"

export const CONFIRMATION = "La confirmación de contraseña no coincide."
const STRING = "El campo :attribute debe ser una cadena de texto."
const MIN = "El campo :attribute debe tener al menos :min caracteres."
const MIXED = "El campo :attribute debe contener al menos una letra mayúscula y una minúscula"
const LETTERS = "El campo :attribute debe contener al menos una letra"
const SYMBOLS = "El campo :attribute debe contener al menos un símbolo"
const NUMBERS = "El campo :attribute debe contener al menos un número"
const UNCOMPROMISED = "El campo :attribute aparece en una filtración de datos conocida, escoge un valor diferente"
const PWNED_TIMEOUT_MS = 30_000

export type PasswordPolicyOptions = { production?: boolean; pwned?: (prefix: string) => Promise<string> }

export async function pwnedRange(prefix: string): Promise<string> {
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(PWNED_TIMEOUT_MS) })
    return response.ok ? await response.text() : ""
  } catch (error) {
    console.error(error)
    return ""
  }
}

async function uncompromised(value: string, pwned: (prefix: string) => Promise<string>): Promise<boolean> {
  if (value === "") return false
  const hash = createHash("sha1").update(value).digest("hex").toUpperCase()
  const prefix = hash.slice(0, 5)
  const lines = (await pwned(prefix))
    .trim()
    .split("\n")
    .filter((line) => line.includes(":"))
  return !lines.some((line) => {
    const [suffix, count] = line.split(":")
    return `${prefix}${suffix}` === hash && Number.parseInt(count, 10) > 0
  })
}

function phpLength(value: PhpValue): number {
  if (isPhpArray(value)) return Object.keys(value).length
  if (typeof value === "boolean") return value ? 1 : 0
  return [...String(value)].length
}

function strongPassword(minimum: number, pwned: ((prefix: string) => Promise<string>) | null): Rule {
  return {
    fails: async (value) => {
      const messages: string[] = []
      if (typeof value !== "string") messages.push(STRING)
      if (phpLength(value) < minimum) messages.push(MIN.replace(":min", String(minimum)))
      if (pwned !== null && typeof value === "string") {
        if (!/(\p{Ll}+.*\p{Lu})|(\p{Lu}+.*\p{Ll})/u.test(value)) messages.push(MIXED)
        if (!/\p{L}/u.test(value)) messages.push(LETTERS)
        if (!/\p{Z}|\p{S}|\p{P}/u.test(value)) messages.push(SYMBOLS)
        if (!/\p{N}/u.test(value)) messages.push(NUMBERS)
      }
      if (messages.length > 0 || pwned === null) return messages
      return (await uncompromised(String(value), pwned)) ? [] : [UNCOMPROMISED]
    },
  }
}

export function passwordRules(input: PhpArray, options: PasswordPolicyOptions = {}): Rule[] {
  const production = options.production ?? process.env.APP_ENV === "production"
  return [
    "required",
    "string",
    production ? strongPassword(12, options.pwned ?? pwnedRange) : strongPassword(8, null),
    { check: (value) => input.password_confirmation === value, message: CONFIRMATION },
  ]
}

const BCRYPT_STORED = /^\$2y\$(\d{2})\$[./A-Za-z0-9]{53}$/
const ARGON_STORED = /^\$argon2(?:i|id)\$v=\d+\$m=\d+,t=\d+,p=\d+\$/

function bcryptRounds(): number {
  return Number(process.env.BCRYPT_ROUNDS ?? 12)
}

export async function storedPassword(plain: string, hash: (plain: string) => Promise<string>): Promise<string | null> {
  const bcrypt = BCRYPT_STORED.exec(plain)
  if (bcrypt !== null) return Number(bcrypt[1]) <= bcryptRounds() ? plain : null
  if (ARGON_STORED.test(plain)) return null
  return hash(plain)
}
