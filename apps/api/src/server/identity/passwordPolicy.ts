import { createHash } from "node:crypto"
import type { PasswordStrength } from "@silabos/shared/schemas/password"

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

export function passwordStrength(label: string, options: PasswordPolicyOptions = {}): PasswordStrength {
  const production = options.production ?? process.env.APP_ENV === "production"
  const minimum = production ? 12 : 8
  const pwned = production ? (options.pwned ?? pwnedRange) : null
  return async (value) => {
    const failed: string[] = []
    if ([...value].length < minimum) failed.push(MIN.replace(":min", String(minimum)))
    if (pwned !== null) {
      if (!/(\p{Ll}+.*\p{Lu})|(\p{Lu}+.*\p{Ll})/u.test(value)) failed.push(MIXED)
      if (!/\p{L}/u.test(value)) failed.push(LETTERS)
      if (!/\p{Z}|\p{S}|\p{P}/u.test(value)) failed.push(SYMBOLS)
      if (!/\p{N}/u.test(value)) failed.push(NUMBERS)
    }
    if (failed.length === 0 && pwned !== null && !(await uncompromised(value, pwned))) failed.push(UNCOMPROMISED)
    return failed.map((message) => message.replace(":attribute", label))
  }
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
