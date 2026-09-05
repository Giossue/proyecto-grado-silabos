/**
 * Modalidades del Reglamento de Régimen Académico (arts. 70-74). Espejo de
 * `StudyModality` en PHP. La modalidad base de la carrera permanece visible aunque
 * una materia tenga una modalidad distinta.
 */
export const STUDY_MODALITIES = [
    { value: 'presencial', label: 'Presencial' },
    { value: 'semipresencial', label: 'Semipresencial' },
    { value: 'en_linea', label: 'En línea' },
    { value: 'a_distancia', label: 'A distancia' },
    { value: 'hibrida', label: 'Híbrida' },
] as const;

/** Valor del selector de materia que significa «la de la carrera». */
export const INHERITED_MODALITY = 'heredada';

export const modalityLabel = (
    value: string | null | undefined,
): string | null =>
    STUDY_MODALITIES.find((item) => item.value === value)?.label ?? null;
