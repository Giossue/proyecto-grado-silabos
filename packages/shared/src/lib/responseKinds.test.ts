import { describe, expect, it } from 'vitest';
import { RESPONSE_KINDS, careerFieldUndecided, emptyResponse, responseRequired, responseSetting, nextOptionKey, responseAnswered, responseAttrs, responseHasOptions, responseKindOptions, responseLabel, responseLines, responseNeedsOptions, responseSchema, keptAnswer, responseAdjustable, sameResponseOptions } from './responseKinds';
import type { DocumentNode } from './templateDocument';

const options = [{ const: 'o1', title: 'Presencial' }, { const: 'o2', title: 'En línea' }];
const node = (kind: string, value: unknown, list = options): DocumentNode => ({ type: 'response', attrs: { kind, options: list, value: value as never } });

describe('Catálogo de tipos de respuesta', () => {
    it('ofrece texto libre, elegir una y elegir varias, sin número, texto corto ni fecha', () => {
        expect(Object.keys(RESPONSE_KINDS)).toEqual(['texto', 'una', 'varias']);
        expect(responseKindOptions.map((kind) => kind.label)).toEqual(['Texto libre', 'Elegir una', 'Elegir varias']);
        expect(responseHasOptions('texto')).toBe(false);
        expect(responseHasOptions('numero')).toBe(false);
        expect(responseHasOptions('una')).toBe(true);
        expect(responseHasOptions('varias')).toBe(true);
    });

    it('cada tipo usa el esquema de valores de los bloques', () => {
        expect(responseSchema('texto', [])).toMatchObject({ type: 'string', maxLength: 3000, multiline: true });
        expect(responseSchema('numero', [])).toBeNull();
        expect(responseSchema('una', options)).toMatchObject({ type: 'string', oneOf: options });
        expect(responseSchema('varias', options)).toMatchObject({ type: 'array', items: { type: 'string', oneOf: options } });
    });

    it('una respuesta nueva empieza sin contestar y avisa si le faltan opciones', () => {
        expect(emptyResponse('texto')).toEqual({ type: 'response', attrs: { kind: 'texto', options: [], value: '' } });
        expect(emptyResponse('una', options).attrs).toEqual({ kind: 'una', options, value: null });
        expect(emptyResponse('varias').attrs).toEqual({ kind: 'varias', options: [], value: [] });
        expect(responseNeedsOptions(responseAttrs(emptyResponse('varias')))).toBe(true);
        expect(responseNeedsOptions(responseAttrs(emptyResponse('texto')))).toBe(false);
        expect(responseAnswered(responseAttrs(emptyResponse('una', options)))).toBe(false);
        expect(nextOptionKey(options)).toBe('o3');
        expect(nextOptionKey([])).toBe('o1');
    });

    it('lo contestado se lee como texto', () => {
        expect(responseLines(responseAttrs(node('texto', '12,5', [])))).toEqual(['12,5']);
        expect(responseLines(responseAttrs(node('una', 'o2')))).toEqual(['En línea']);
        expect(responseLines(responseAttrs(node('varias', ['o2', 'o1'])))).toEqual(['En línea', 'Presencial']);
        expect(responseLines(responseAttrs(node('una', null)))).toEqual([]);
        expect(responseLabel(responseAttrs(node('una', null)))).toBe('Elegir una: Presencial · En línea');
        expect(responseLabel(responseAttrs(node('texto', '', [])))).toBe('Texto libre');
        expect(responseLabel(responseAttrs(node('varias', [], [])))).toBe('Elegir varias: sin opciones');
    });

    it('los ajustes de cada respuesta solo se guardan si cambian lo de siempre', () => {
        expect(emptyResponse('texto', [], { required: true, help: '', maxLength: 3000 }).attrs).toEqual({ kind: 'texto', options: [], value: '' });
        expect(emptyResponse('texto', [], { required: false, help: '  Horario  de atención ', maxLength: 500, display: 'desplegable' }).attrs)
            .toEqual({ kind: 'texto', options: [], value: '', required: false, help: 'Horario de atención', maxLength: 500 });
        expect(emptyResponse('una', options, { display: 'desplegable', minChoices: 1 }).attrs).toEqual({ kind: 'una', options, value: null, display: 'desplegable' });
        expect(emptyResponse('varias', options, { minChoices: 1, maxChoices: 2, display: 'lista' }).attrs).toEqual({ kind: 'varias', options, value: [], minChoices: 1, maxChoices: 2 });
        const legacy = responseAttrs(node('una', null));
        expect(responseRequired(legacy)).toBe(true);
        expect(responseSetting(legacy, 'display')).toBe('lista');
        expect(responseSetting(legacy, 'help')).toBe('');
        expect(responseRequired(responseAttrs({ type: 'response', attrs: { kind: 'texto', options: [], value: '', required: false } }))).toBe(false);
        expect(responseLabel(responseAttrs({ type: 'response', attrs: { kind: 'texto', options: [], value: '', required: false } }))).toBe('Texto libre (opcional)');
    });

    it('los límites cambian el esquema de la respuesta', () => {
        expect(responseSchema('texto', [], { maxLength: 200 })).toMatchObject({ maxLength: 200 });
        expect(responseSchema('varias', options, { maxChoices: 1 })).toMatchObject({ maxItems: 1 });
        expect(responseSchema('varias', options)).toMatchObject({ maxItems: 100 });
    });

    it('una respuesta de elegir con opciones se ajusta por materia y conserva solo lo elegido que sigue', () => {
        const options = [{ const: 'o1', title: 'Aula' }, { const: 'o2', title: 'Taller' }];
        expect(responseAdjustable(responseAttrs({ type: 'response', attrs: { kind: 'una', options } }))).toBe(true);
        expect(responseAdjustable(responseAttrs({ type: 'response', attrs: { kind: 'una', options: [] } }))).toBe(false);
        expect(responseAdjustable(responseAttrs({ type: 'response', attrs: { kind: 'texto', options: [] } }))).toBe(false);
        expect(sameResponseOptions(options, [...options])).toBe(true);
        expect(sameResponseOptions(options, [options[0]!, { const: 'o2', title: 'Campo' }])).toBe(false);
        expect(keptAnswer('o2', [options[0]!])).toBeNull();
        expect(keptAnswer('o1', options)).toBe('o1');
        expect(keptAnswer(['o1', 'o3'], options)).toEqual(['o1']);
    });
});

describe('Campo de Carrera sin definir', () => {
    const paragraph = (...content: DocumentNode[]): DocumentNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
    const doc = (...content: DocumentNode[]): DocumentNode => ({ type: 'doc', content });
    const text = (value: string): DocumentNode => ({ type: 'text', text: value });
    const blank = doc(paragraph());
    const table = (cell: DocumentNode): DocumentNode => doc({ type: 'table', content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph(text('Técnica'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [cell] }] },
    ] });
    const block = (value: unknown): DocumentNode => doc({ type: 'documentBlock', attrs: { kind: 'unidades', value: value as never } });

    it('lo está mientras no tenga texto propio ni un tipo de respuesta', () => {
        expect(careerFieldUndecided(blank, blank)).toBe(true);
        expect(careerFieldUndecided(blank, doc(paragraph(), paragraph(text('   '))))).toBe(true);
        expect(careerFieldUndecided(table(paragraph()), table(paragraph()))).toBe(true);
        expect(careerFieldUndecided(block({}), block({ rows: [{ title: '', hours: null }] }))).toBe(true);
    });

    it('queda definido con texto, con un tipo de respuesta o con una respuesta que puso Administración', () => {
        expect(careerFieldUndecided(blank, doc(paragraph(text('Apuntes'))))).toBe(false);
        expect(careerFieldUndecided(blank, doc(paragraph(emptyResponse('texto'))))).toBe(false);
        expect(careerFieldUndecided(blank, doc(paragraph(emptyResponse('una'))))).toBe(false);
        expect(careerFieldUndecided(table(paragraph()), table(paragraph(text('Taller'))))).toBe(false);
        expect(careerFieldUndecided(block({}), block({ rows: [{ title: 'Unidad 1' }] }))).toBe(false);
        const placed = doc(paragraph(emptyResponse('una', options)));
        expect(careerFieldUndecided(placed, placed)).toBe(false);
    });
});
