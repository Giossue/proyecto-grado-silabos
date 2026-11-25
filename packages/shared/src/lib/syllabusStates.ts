export const SYLLABUS_STATE_LABELS = {
    sin_iniciar: 'Sin iniciar',
    borrador: 'Borrador',
    en_revision: 'En revisión',
    correccion_solicitada: 'Corrección solicitada',
    aprobado: 'Aprobado',
} as const;

export type SyllabusState = keyof typeof SYLLABUS_STATE_LABELS;
export const SYLLABUS_STATE_OPTIONS = Object.entries(SYLLABUS_STATE_LABELS).map(([value, label]) => ({ value, label }));
export const REVIEW_STATE_OPTIONS = SYLLABUS_STATE_OPTIONS.filter((option) => ['en_revision', 'correccion_solicitada', 'aprobado'].includes(option.value));
export const syllabusStateLabel = (value: string): string => SYLLABUS_STATE_LABELS[value as SyllabusState] ?? 'Estado no disponible';
