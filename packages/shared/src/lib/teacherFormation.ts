export const FORMATION_FIELD = "formacion_docente"
export const CAMPUS_FIELD = "nombre_campus"
export const COREQUISITES_FIELD = "correquisitos_asignatura"

// Teacher fields shown inside the identification card instead of as their own block.
export const CARD_FIELDS: readonly string[] = [CAMPUS_FIELD, COREQUISITES_FIELD, FORMATION_FIELD]

export const shownInCard = (field: { key?: string | null }): boolean => CARD_FIELDS.includes(field.key ?? "")

export const drawnInDocument = (field: { key?: string | null }): boolean => !shownInCard(field)
