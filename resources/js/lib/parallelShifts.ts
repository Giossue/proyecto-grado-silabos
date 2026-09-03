/** Jornadas del paralelo, tal como las nombra el formato oficial del sílabo. */
export const PARALLEL_SHIFTS = [
    { value: 'matutina', label: 'Matutina' },
    { value: 'vespertina', label: 'Vespertina' },
    { value: 'nocturna', label: 'Nocturna' },
] as const;

export const shiftLabel = (value: string | null | undefined): string =>
    PARALLEL_SHIFTS.find((shift) => shift.value === value)?.label ?? '—';
