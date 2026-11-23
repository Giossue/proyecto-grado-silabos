export const shiftLabel = (
    value: string | null | undefined,
    options: readonly { value: string; label: string }[],
): string => options.find((shift) => shift.value === value)?.label ?? value ?? 'Sin jornada';
