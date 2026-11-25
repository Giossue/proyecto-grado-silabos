import { describe, expect, it } from 'vitest';
import { counterLabel, fieldCharacters, fitCharacters, formatCharacters, limitLabel } from '@/lib/fieldLimits';
import type { DocumentNode } from '@silabos/shared/lib/templateDocument';

const text = (value: string): DocumentNode => ({ type: 'text', text: value });
const paragraph = (...content: DocumentNode[]): DocumentNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
const response = (attrs: Record<string, unknown>): DocumentNode => ({ type: 'response', attrs: { options: [], ...attrs } as never });
const cell = (type: string, ...content: DocumentNode[]): DocumentNode => ({ type, attrs: { colspan: 1, rowspan: 1 }, content: [paragraph(...content)] });
const yesNo = [{ const: 'o1', title: 'Sí' }, { const: 'o2', title: 'No' }];
const ifYes = { response: 'usa_lab', options: ['o1'] };

const template: DocumentNode = { type: 'doc', content: [
    paragraph(text('Estrategias de la asignatura')),
    paragraph(response({ kind: 'una', options: yesNo, value: null, id: 'usa_lab' })),
    paragraph(text('Nota: '), response({ kind: 'texto', value: 'Escrito por Coordinación' })),
    paragraph(text('Laboratorio: '), response({ kind: 'texto', value: '', showIf: ifYes })),
    paragraph(),
    { type: 'table', content: [
        { type: 'tableRow', content: [cell('tableHeader', text('Técnica')), cell('tableHeader', text('Horas'))] },
        { type: 'tableRow', content: [cell('tableCell'), cell('tableCell')] },
    ] },
] };
const value = (choice: string, detail: string, free: string, rows: string[][]): DocumentNode => ({ type: 'doc', content: [
    paragraph(text('Estrategias de la asignatura')),
    paragraph(response({ kind: 'una', options: yesNo, value: choice, id: 'usa_lab' })),
    paragraph(text('Nota: '), response({ kind: 'texto', value: 'Escrito por Coordinación' })),
    paragraph(text('Laboratorio: '), response({ kind: 'texto', value: detail, showIf: ifYes })),
    free ? paragraph(text(free), { type: 'hardBreak' }, text('ñ')) : paragraph(),
    { type: 'table', content: [
        { type: 'tableRow', content: [cell('tableHeader', text('Técnica')), cell('tableHeader', text('Horas'))] },
        ...rows.map((row) => ({ type: 'tableRow', content: row.map((item) => cell('tableCell', ...(item ? [text(item)] : []))) })),
    ] },
] });

describe('Caracteres que escribe el docente en un campo', () => {
    it('suma el texto libre y las respuestas de texto, también las filas agregadas, sin el texto fijo ni lo que respondió Coordinación', () => {
        expect(fieldCharacters(template, value('o1', 'Química', 'Hola', [['Taller', '4'], ['Foro', '2']]), { usa_lab: 'o1' })).toBe(7 + 5 + 6 + 1 + 4 + 1);
    });

    it('no cuenta las partes ocultas por «Mostrar solo si»', () => {
        expect(fieldCharacters(template, value('o2', 'Química', 'Hola', [['Taller', '4']]), { usa_lab: 'o2' })).toBe(5 + 6 + 1);
    });

    it('no cuenta las tablas repetibles y cuenta todo el texto de un campo de texto libre', () => {
        const blocks: DocumentNode = { type: 'doc', content: [{ type: 'documentBlock', attrs: { kind: 'bibliografia', props: {}, value: { libros: [{ titulo: 'Un libro largo' }] } } }] };
        expect(fieldCharacters({ type: 'doc', content: [{ type: 'documentBlock', attrs: { kind: 'bibliografia', props: {}, value: {} } }] }, blocks)).toBe(0);
        expect(fieldCharacters({ type: 'doc', content: [paragraph()] }, { type: 'doc', content: [paragraph(text('Ünï 😀')), paragraph(text('dos'))] })).toBe(8);
        expect(fieldCharacters(null, { type: 'doc', content: [paragraph(text('abc'))] })).toBe(3);
        expect(fieldCharacters(template, null)).toBe(0);
    });

    it('recorta un texto al espacio que queda, contando o no los saltos de línea', () => {
        expect(fitCharacters('abcdef', 4)).toBe('abcd');
        expect(fitCharacters('ab\ncd', 4)).toBe('ab\nc');
        expect(fitCharacters('ab\ncd', 4, false)).toBe('ab\ncd');
        expect(fitCharacters('😀😀😀', 2)).toBe('😀😀');
        expect(fitCharacters('abc', 0)).toBe('');
    });

    it('muestra el contador y el límite con separador de miles', () => {
        expect(formatCharacters(50000)).toBe('50 000');
        expect(counterLabel(320, 500)).toBe('320 / 500');
        expect(counterLabel(1500, 12000)).toBe('1 500 / 12 000');
        expect(limitLabel(500)).toBe('Hasta 500 caracteres');
    });
});
