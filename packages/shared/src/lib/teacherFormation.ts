export const FORMATION_FIELD = "formacion_docente"

export const drawnInDocument = (field: { key?: string | null }): boolean => field.key !== FORMATION_FIELD
