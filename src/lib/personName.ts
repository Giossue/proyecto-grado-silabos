export const NAME_PARTS = [
    { key: 'nombres', label: 'Nombres', placeholder: 'Ej. ANA MARÍA' },
    { key: 'apellidos', label: 'Apellidos', placeholder: 'Ej. PÉREZ LÓPEZ' },
] as const;

export type NamePartKey = (typeof NAME_PARTS)[number]['key'];
export type NameParts = Record<NamePartKey, string>;

/** La misma regla que el servidor: letras (con tildes y ñ) separadas por un espacio, apóstrofo o guion. */
const PART_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;
export const NAME_MAX_LENGTH = 90;
const SUBJECT: Record<NamePartKey, string> = { nombres: 'Los nombres', apellidos: 'Los apellidos' };

/** Los nombres se escriben en mayúsculas, como en el alta. */
export const upperName = (value: string | number): string => String(value).normalize('NFC').toLocaleUpperCase('es-EC');

const collapse = (value: string): string => value.trim().replace(/\s+/gu, ' ');

/** Errores de nombres y apellidos con la misma regla del servidor; vacío si están bien. */
export const nameErrors = (parts: NameParts): Partial<Record<NamePartKey, string[]>> => {
    const errors: Partial<Record<NamePartKey, string[]>> = {};
    for (const { key } of NAME_PARTS) {
        const value = collapse(parts[key]);
        const message = value === ''
            ? `${SUBJECT[key]} son obligatorios`
            : value.length > NAME_MAX_LENGTH
                ? `${SUBJECT[key]} admiten hasta ${NAME_MAX_LENGTH} caracteres`
                : PART_PATTERN.test(value) ? null : `${SUBJECT[key]} solo admiten letras, espacios, apóstrofo y guion`;
        if (message) errors[key] = [message];
    }

    return errors;
};

/**
 * Reparte un nombre completo guardado: con cuatro palabras o más, las dos primeras son los nombres
 * (el resto, apellidos como «DE LA CRUZ MORA»); con tres, un nombre y dos apellidos; con dos, uno y uno.
 */
export const splitName = (full: string): NameParts => {
    const words = full.trim().split(/\s+/u).filter((word) => word !== '');
    const names = words.length >= 4 ? 2 : 1;

    return { nombres: words.slice(0, names).join(' '), apellidos: words.slice(names).join(' ') };
};

export const joinName = (parts: NameParts): string =>
    NAME_PARTS.map((part) => collapse(parts[part.key])).filter((value) => value !== '').join(' ');

export const cleanParts = (parts: NameParts): NameParts => ({ nombres: collapse(parts.nombres), apellidos: collapse(parts.apellidos) });
