type NoticeTexts = { label: string; description: string }

const SYLLABUS_RESTARTED = "silabo.reiniciado"

const SWITCH_OF: Record<string, string> = {
  "silabo.eliminado": SYLLABUS_RESTARTED,
  "silabo.regenerado": SYLLABUS_RESTARTED,
  "proceso.plantilla_rehecho": "silabo.devuelto_borrador",
}

const SUMMARY: NoticeTexts = { label: "Resumen diario", description: "Un aviso de que tiene pendientes, de lunes a viernes a la hora del resumen" }

const BY_ROLE: [string, [string, NoticeTexts][]][] = [
  ["docente", [["docente.resumen_diario", SUMMARY]]],
  ["coordinador", [["coordinacion.resumen_diario", SUMMARY]]],
  ["bibliotecario", [["biblioteca.resumen_diario", SUMMARY]]],
]

export function wantsEmail(preferences: unknown, type: string): boolean {
  if (typeof preferences !== "object" || preferences === null) return true
  const key = SWITCH_OF[type] ?? type
  if (Array.isArray(preferences)) return true
  const value = (preferences as Record<string, unknown>)[key]
  return value === undefined || value === null || value !== false
}

export function emailOptionsFor(roles: string[], preferences: unknown): { type: string; label: string; description: string; enabled: boolean }[] {
  const types = new Map<string, NoticeTexts>()
  for (const [role, notices] of BY_ROLE) {
    if (!roles.includes(role)) continue
    for (const [type, texts] of notices) types.set(type, texts)
  }
  return [...types].map(([type, texts]) => ({ type, ...texts, enabled: wantsEmail(preferences, type) }))
}
