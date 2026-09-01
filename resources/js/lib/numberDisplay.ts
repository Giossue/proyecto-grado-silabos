/**
 * Regla global de presentación numérica: nunca mostrar decimales de relleno.
 * La base de datos entrega los decimales como cadena («48.00», «4.50»); aquí se
 * descartan los ceros sin perder decimales reales: «48.00» → «48», «4.50» → «4.5».
 * Los valores vacíos se muestran como raya y los no numéricos tal cual llegan.
 */
export const formatNumericDisplay = (value: unknown): string => {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) ? String(numeric) : String(value);
};
