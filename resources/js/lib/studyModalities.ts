/**
 * Modalidades del Reglamento de Régimen Académico (arts. 70-74). Espejo de
 * `StudyModality` en PHP. «Híbrida» no se elige: aparece sola cuando alguna materia
 * se aparta de la modalidad base de la carrera.
 */
export const STUDY_MODALITIES = [
    { value: 'presencial', label: 'Presencial' },
    { value: 'semipresencial', label: 'Semipresencial' },
    { value: 'en_linea', label: 'En línea' },
    { value: 'a_distancia', label: 'A distancia' },
] as const;

export const HYBRID_LABEL = 'Híbrida';

/** Valor del selector de materia que significa «la de la carrera». */
export const INHERITED_MODALITY = 'heredada';

export const modalityLabel = (
    value: string | null | undefined,
): string | null =>
    STUDY_MODALITIES.find((item) => item.value === value)?.label ?? null;
