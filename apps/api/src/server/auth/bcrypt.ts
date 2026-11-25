import bcrypt from "bcryptjs"

const SETTING = /^\$2([abxy])\$(\d{2})\$([./A-Za-z0-9]{22})/
const HASH = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/

export function bcryptCrypt(password: string, setting: string): string | null {
  const match = SETTING.exec(setting)
  if (!match || match[1] === "x") return null
  const cost = Number(match[2])
  if (cost < 4 || cost > 31) return null
  const computed = bcrypt.hashSync(password, `$2b$${match[2]}$${match[3]}`)
  return `$2${match[1]}$${computed.slice(4)}`
}

export async function bcryptHash(password: string, cost: number): Promise<string> {
  const salt = await bcrypt.genSalt(cost)
  const computed = await bcrypt.hash(password, salt)
  return `$2y$${computed.slice(4)}`
}

export async function bcryptVerify(password: string, hash: string): Promise<boolean | null> {
  if (!HASH.test(hash) || hash.startsWith("$2x$")) return null
  return bcrypt.compare(password, `$2b$${hash.slice(4)}`)
}
