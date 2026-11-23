import { describe, expect, it } from 'vitest';
import { responseListTable } from '@/lib/fieldResponses';
import { RESPONSE_NODE } from '@/lib/responseKinds';
import type { DocumentNode } from '@/lib/templateDocument';

const cell = (type: string, content: DocumentNode[] = []): DocumentNode => ({ type, attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content }] });
const text = (value: string): DocumentNode => ({ type: 'text', text: value });
const table = (lastRow: DocumentNode[]): DocumentNode => ({ type: 'table', content: [
    { type: 'tableRow', content: [cell('tableHeader', [text('N°')]), cell('tableHeader', [text('Actividad')])] },
    { type: 'tableRow', content: lastRow },
] });
const response: DocumentNode = { type: RESPONSE_NODE, attrs: { kind: 'texto', options: [], value: null } };

describe('responseListTable', () => {
    it('admite filas nuevas cuando la última fila son celdas vacías o de respuesta', () => {
        expect(responseListTable(table([cell('tableCell'), cell('tableCell')]))).toBe(true);
        expect(responseListTable(table([cell('tableCell'), cell('tableCell', [response])]))).toBe(true);
    });

    it('no admite filas nuevas si la última fila tiene un encabezado vacío', () => {
        expect(responseListTable(table([cell('tableHeader'), cell('tableCell')]))).toBe(false);
        expect(responseListTable(table([cell('tableHeader'), cell('tableHeader')]))).toBe(false);
    });
});
