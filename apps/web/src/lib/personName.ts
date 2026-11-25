export const NAME_PARTS = [
    { key: 'nombres', label: 'Nombres', placeholder: 'Ej. ANA MARÍA' },
    { key: 'apellidos', label: 'Apellidos', placeholder: 'Ej. PÉREZ LÓPEZ' },
] as const;

export type NamePartKey = (typeof NAME_PARTS)[number]['key'];
export type NameParts = Record<NamePartKey, string>;

/** Los nombres se escriben en mayúsculas, como en el alta. */
export const upperName = (value: string | number): string => String(value).normalize('NFC').toLocaleUpperCase('es-EC');

const collapse = (value: string): string => value.trim().replace(/\s+/gu, ' ');

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
