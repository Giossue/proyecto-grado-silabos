export const DISPLAY_LOCALE = 'es-EC';
export const DISPLAY_TIMEZONE = 'America/Guayaquil';

const formatters = new Map<string, Intl.DateTimeFormat>();

export const formatDateDisplay = (
    value: string,
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string => {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const resolved = { timeZone: dateOnly ? 'UTC' : DISPLAY_TIMEZONE, ...options };
    const key = JSON.stringify(resolved);
    let formatter = formatters.get(key);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, resolved);
        formatters.set(key, formatter);
    }
    const date = dateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value);
    return formatter.format(date);
};
