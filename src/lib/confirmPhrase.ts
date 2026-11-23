const normalize = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** La frase escrita coincide con la pedida, sin importar mayúsculas, tildes ni espacios de más. */
export const matchesPhrase = (typed: string, phrase: string): boolean => normalize(typed) === normalize(phrase);
