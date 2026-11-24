type NoticeTexts = { label: string; description: string }

const SYLLABUS_RESTARTED = "silabo.reiniciado"

const SWITCH_OF: Record<string, string> = {
  "silabo.eliminado": SYLLABUS_RESTARTED,
  "silabo.regenerado": SYLLABUS_RESTARTED,
  "proceso.plantilla_rehecho": "silabo.devuelto_borrador",
}

const BY_ROLE: [string, [string, NoticeTexts][]][] = [
  [
    "docente",
    [
      ["docente.resumen_diario", { label: "Resumen diario", description: "Sílabos por elaborar o corregir y el plazo, de lunes a viernes, solo si hay pendientes" }],
      ["convocatoria.abierta", { label: "Convocatoria abierta", description: "Tiene sílabos por elaborar" }],
      ["convocatoria.reanudada", { label: "Convocatoria reanudada", description: "Puede seguir con sus sílabos tras una pausa" }],
      ["silabo.correccion_solicitada", { label: "Corrección solicitada", description: "Coordinación o Biblioteca le pide corregir un sílabo" }],
      ["silabo.devuelto_borrador", { label: "Sílabo devuelto a borrador", description: "Cambió un dato de la carrera, de la malla o la plantilla" }],
      ["silabo.aprobado", { label: "Sílabo aprobado", description: "Su sílabo quedó aprobado, con el PDF listo" }],
      [SYLLABUS_RESTARTED, { label: "Sílabo reiniciado", description: "Su sílabo volvió a empezar: Coordinación lo reinició o cambió la malla o el paralelo" }],
      ["proceso.cierre_proximo", { label: "Cierre de la convocatoria", description: "3 días antes del último día de entrega, si tiene sílabos sin aprobar" }],
    ],
  ],
  [
    "coordinador",
    [
      ["coordinacion.resumen_diario", { label: "Resumen diario", description: "Sílabos por revisar, de lunes a viernes, solo si hay pendientes" }],
      ["biblioteca.verificado", { label: "Bibliografía verificada", description: "Biblioteca verificó la bibliografía de un sílabo y espera su aprobación" }],
      ["proceso.reanudado", { label: "Convocatoria reanudada por Administración", description: "Se retoman las revisiones tras una pausa institucional" }],
      ["proceso.cierre_proximo", { label: "Cierre de la convocatoria", description: "3 días antes del último día de entrega, si su carrera tiene sílabos sin aprobar" }],
    ],
  ],
  [
    "bibliotecario",
    [
      ["biblioteca.resumen_diario", { label: "Resumen diario", description: "Sílabos por revisar, de lunes a viernes, solo si hay pendientes" }],
      ["silabo.enviado", { label: "Sílabo por revisar", description: "Un docente envió un sílabo y espera la revisión de biblioteca" }],
      ["silabo.reenviado_biblioteca", { label: "Sílabo reenviado", description: "El docente corrigió la bibliografía y la reenvió" }],
      ["proceso.reanudado", { label: "Convocatoria reanudada por Administración", description: "Se retoman las revisiones tras una pausa institucional" }],
    ],
  ],
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
