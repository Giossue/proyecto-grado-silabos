const SQLSTATE = /^[0-9A-Z]{5}$/
const PRISMA_CODE = /^P\d{4}$/

export function sqlState(error: unknown): string | null {
  const pending: unknown[] = [error]
  for (let visited = 0; visited < 16 && pending.length > 0; visited++) {
    const current = pending.shift()
    if (typeof current !== "object" || current === null) continue
    const { originalCode, code } = current as { originalCode?: unknown; code?: unknown }
    if (typeof originalCode === "string" && SQLSTATE.test(originalCode)) return originalCode
    if (typeof code === "string" && SQLSTATE.test(code) && !PRISMA_CODE.test(code)) return code
    for (const key of ["cause", "meta", "driverAdapterError"]) pending.push((current as Record<string, unknown>)[key])
  }
  return null
}
