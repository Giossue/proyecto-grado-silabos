import { describe, expect, it } from 'vitest';
import { nextParallelCode, parallelCodeChoices } from '@/lib/parallelCodes';

const used = (...codes: string[]) => codes.map((code) => ({ code }));

describe('nextParallelCode', () => {
    it('empieza en A y toma la primera letra libre', () => {
        expect(nextParallelCode([])).toBe('A');
        expect(nextParallelCode([{ code: 'A' }, { code: 'c' }])).toBe('B');
        expect(nextParallelCode([{ code: ' a ' }, { code: 'B' }])).toBe('C');
    });

    it('sin letras libres no propone ninguna', () => {
        expect(nextParallelCode(used(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'))).toBe('');
    });
});

describe('parallelCodeChoices', () => {
    it('ofrece de la A a la Z sin las letras usadas, sin importar mayúsculas ni espacios', () => {
        const choices = parallelCodeChoices(used('a', ' B ', 'C1'));
        expect(choices[0]).toBe('C');
        expect(choices).toHaveLength(24);
        expect(choices.at(-1)).toBe('Z');
    });

    it('el código actual que no está entre las letras libres encabeza la lista tal como está escrito', () => {
        expect(parallelCodeChoices(used('A'), 'B1').slice(0, 2)).toEqual(['B1', 'B']);
        expect(parallelCodeChoices(used('B'), 'a').slice(0, 3)).toEqual(['a', 'A', 'C']);
        expect(parallelCodeChoices(used('A'), 'B').slice(0, 2)).toEqual(['B', 'C']);
    });
});
