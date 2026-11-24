import { excelSerial, fromArray, newBook, styleTable, xlsxBytes, type CellValue } from "./workbook"

export type AuditExportRow = { occurredAt: string; actor: string; role: string; career: string; action: string; target: string; details: string; result: string }

const AUDIT_HEADERS = ["Fecha y hora", "Usuario", "Rol", "Carrera", "Acción", "Sobre qué", "Detalle", "Resultado"]
const AUDIT_WIDTHS = [19, 30, 16, 24, 38, 48, 60, 11]

function phpSort(values: string[]): string[] {
  return [...values].sort((left, right) => (Buffer.compare(Buffer.from(left), Buffer.from(right))))
}

export async function auditWorkbook(rows: AuditExportRow[], period: string | null): Promise<Buffer> {
  const book = newBook(`Auditoría${period !== null ? ` ${period}` : ""}`)
  const events = book.addWorksheet("Eventos")
  fromArray(events, AUDIT_HEADERS, 1)
  rows.forEach((row, index) => {
    const line = index + 2
    events.getCell(`A${line}`).value = excelSerial(row.occurredAt)
    fromArray(events, [row.actor, row.role, row.career, row.action, row.target, row.details, row.result], line, 2)
  })
  const last = Math.max(2, rows.length + 1)
  for (let line = 2; line <= last; line++) {
    events.getCell(`A${line}`).numFmt = "yyyy-mm-dd hh:mm"
    for (const column of ["F", "G"]) events.getCell(`${column}${line}`).alignment = { wrapText: true, vertical: "top" }
  }
  styleTable(events, AUDIT_HEADERS.length, last, AUDIT_WIDTHS)
  const summary = book.addWorksheet("Resumen")
  const careerOf = (row: AuditExportRow) => (row.career !== "" ? row.career : "Sin carrera")
  const careers = phpSort([...new Set(rows.map(careerOf))])
  const counts = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const byCareer = counts.get(row.action) ?? new Map<string, number>()
    byCareer.set(careerOf(row), (byCareer.get(careerOf(row)) ?? 0) + 1)
    counts.set(row.action, byCareer)
  }
  fromArray(summary, ["Acción", ...careers, "Total"], 1)
  let line = 2
  for (const action of phpSort([...counts.keys()])) {
    const values = careers.map((career) => counts.get(action)?.get(career) ?? 0)
    fromArray(summary, [action, ...values, values.reduce((sum, value) => sum + value, 0)], line, 1, true)
    line++
  }
  styleTable(summary, careers.length + 2, Math.max(2, line - 1), [38, ...Array<number>(careers.length + 1).fill(16)])
  return xlsxBytes(book)
}

export const STATE_LABELS: Record<string, string> = {
  sin_iniciar: "Sin iniciar",
  borrador: "Borrador",
  en_revision: "En revisión",
  correccion_solicitada: "Devuelto",
  aprobado: "Aprobado",
}

export type ReportData = {
  process: { period: string | null; starts_at: string; due_at: string }
  kpis: { total: number; approved_percent: number; on_time_percent: number | null; review_days: number | null }
  careers: { career: string; total: number; states: Record<string, number>; returns: { coordinacion: number; biblioteca: number }; late: number; progress: number }[]
  daily: { day: string; first: number; resubmitted: number }[]
  pending: { teachers: string; career: string; subject: string; parallel: string; state: string; late: boolean }[]
}

export async function processReportWorkbook(report: ReportData): Promise<Buffer> {
  const { process, kpis, careers, daily, pending } = report
  const book = newBook(`Reporte ${process.period ?? ""}`)
  const summary = book.addWorksheet("Resumen")
  const summaryRows: CellValue[][] = [
    ["Indicador", "Valor"],
    ["Convocatoria", String(process.period ?? "")],
    ["Inicio de elaboración", process.starts_at],
    ["Fecha de entrega", process.due_at],
    ["Sílabos", kpis.total],
    ["Aprobados (%)", kpis.approved_percent],
    ["Enviados a tiempo (%)", kpis.on_time_percent ?? "Sin envíos"],
    ["Días promedio de revisión", kpis.review_days ?? "Sin aprobados"],
  ]
  summaryRows.forEach((values, index) => fromArray(summary, values, index + 1, 1, true))
  styleTable(summary, 2, 8, [30, 30])
  const byCareer = book.addWorksheet("Por carrera")
  fromArray(byCareer, ["Carrera", "Total", ...Object.values(STATE_LABELS), "Atrasados", "Devoluciones de Coordinación", "Devoluciones de Biblioteca", "Avance (%)"], 1)
  careers.forEach((row, index) => {
    fromArray(byCareer, [row.career, row.total, ...Object.keys(STATE_LABELS).map((state) => row.states[state]), row.late, row.returns.coordinacion, row.returns.biblioteca, row.progress], index + 2, 1, true)
  })
  styleTable(byCareer, 12, Math.max(2, careers.length + 1), [30, 8, 11, 10, 12, 10, 10, 11, 16, 16, 11])
  const days = book.addWorksheet("Envíos por día")
  fromArray(days, ["Día", "Primeros envíos", "Reenvíos"], 1)
  daily.forEach((row, index) => fromArray(days, [row.day, row.first, row.resubmitted], index + 2, 1, true))
  styleTable(days, 3, Math.max(2, daily.length + 1), [14, 16, 12])
  const late = book.addWorksheet("Pendientes")
  fromArray(late, ["Docente", "Carrera", "Asignatura", "Paralelo", "Estado", "Atrasado"], 1)
  pending.forEach((row, index) => fromArray(late, [row.teachers, row.career, row.subject, row.parallel, STATE_LABELS[row.state] ?? row.state, row.late ? "Sí" : "No"], index + 2, 1, true))
  styleTable(late, 6, Math.max(2, pending.length + 1), [32, 26, 36, 10, 14, 10])
  return xlsxBytes(book)
}
