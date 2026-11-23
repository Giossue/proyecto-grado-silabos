export const formatNumericDisplay = (value: unknown): string => {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) ? String(numeric) : String(value);
};

