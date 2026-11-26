import type { PasswordStrength } from "@silabos/shared/schemas/password"

const MIN = "El campo :attribute debe tener al menos :min caracteres."
const MINIMUM = 8

export function passwordStrength(label: string): PasswordStrength {
  return async (value) => ([...value].length < MINIMUM ? [MIN.replace(":min", String(MINIMUM)).replace(":attribute", label)] : [])
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
