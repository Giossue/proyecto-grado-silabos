import type { PhpRecord } from "../configuration/phpValues"

export class GenerationRejected extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super("generation rejected")
  }
}

export type GenerateOptions = { subjectId?: string | null; subjectIds?: string[] | null; parallelId?: string | null; allowEmpty?: boolean; skipIncomplete?: boolean; notifyTeacher?: boolean }

export const SENT_STATES = ["en_revision", "correccion_solicitada", "aprobado"]
export const CAREER_PATHS = ["career.name", "career.faculty", "career.faculty_logo"]
export const DOCUMENT_PATHS = [
  "subject.name",
  "subject.code",
  "subject.cycle",
  "subject.organization_unit",
  "subject.credits",
  "subject.total_hours",
  "subject.hours_ac",
  "subject.hours_pae",
  "subject.hours_aa",
  "subject.prerequisites",
  "scheduled_subject.modality",
]
export type WorkScope = { careerIds?: string | string[] | null; periodId?: string | null; subjectId?: string | null; subjectIds?: string[] | null }

export type WorkSyllabus = { id: string; convocationId: string; parallelId: string; state: string; context: PhpRecord; started: boolean; version: number }

export function requestBoolean(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === "number") return value === 1
  if (typeof value !== "string") return false
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase())
}

export function purgeRequired(count: number): Record<string, string[]> {
  return {
    purge_required: [
      count === 1
        ? "Este cambio reemplazará 1 sílabo. Se eliminará todo su contenido, incluso si ya estaba aprobado (borrador, revisiones, aprobación, firmas y análisis de IA), y se generará nuevamente desde la base corregida. El docente recibirá un aviso."
        : `Este cambio reemplazará ${count} sílabos. Se eliminará todo su contenido, incluso los ya aprobados (borradores, revisiones, aprobaciones, firmas y análisis de IA), y se generarán nuevamente desde la base corregida. Cada docente recibirá un aviso.`,
    ],
    purge_count: [String(count)],
  }
}
