import { describe, expect, it } from 'vitest';
import type { ListSchema, ValueSchema } from './types';
import { emptyRow, emptyValue, isBlankRow, ROW_ID, settle } from './values';

const items: ValueSchema = { type: 'object', properties: { resultado: { type: 'string', maxLength: 100, multiline: false }, horas: { type: 'number', maximum: 99, multipleOf: 1 } } };
const list = (extra: Partial<ListSchema> = {}): ListSchema => ({ type: 'array', minItems: 0, maxItems: 8, initial: 0, items, ...extra });
const idOf = (row: unknown): unknown => (row as Record<string, unknown>)[ROW_ID];

describe('identificador de fila', () => {
    it('una fila nueva de una lista de origen tiene un id propio que no se repite', () => {
        const ids = Array.from({ length: 200 }, () => idOf(emptyRow(list({ row_ids: true }), {})));

        expect(new Set(ids).size).toBe(200);
        for (const id of ids) expect(id).toMatch(/^w[0-9a-f]{16}$/);
    });

    it('las demás listas no cambian', () => {
        expect(emptyRow(list(), {})).toEqual({ resultado: '', horas: '' });
        expect(emptyValue(list({ minItems: 1 }), {})).toEqual([{ resultado: '', horas: '' }]);
    });

    it('las filas mínimas y las que completa settle también reciben id y las que existen lo conservan', () => {
        const [first] = emptyValue(list({ row_ids: true, minItems: 1 }), {}) as unknown[];
        expect(idOf(first)).toEqual(expect.any(String));

        const settled = settle({ temas: list({ row_ids: true, minItems: 2 }) }, { temas: [{ [ROW_ID]: 'r1', resultado: 'A', horas: '' }] }, {});
        const [kept, added] = settled.temas as unknown[];

        expect(kept).toEqual({ [ROW_ID]: 'r1', resultado: 'A', horas: '' });
        expect(idOf(added)).toEqual(expect.any(String));
        expect(idOf(added)).not.toBe('r1');
    });

    it('una fila con solo el id está en blanco', () => {
        expect(isBlankRow({ [ROW_ID]: 'r1', resultado: ' ', horas: '' })).toBe(true);
        expect(isBlankRow({ [ROW_ID]: 'r1', resultado: 'A' })).toBe(false);
        expect(isBlankRow({ resultado: '', horas: null })).toBe(true);
        expect(isBlankRow(undefined)).toBe(false);
    });
});
