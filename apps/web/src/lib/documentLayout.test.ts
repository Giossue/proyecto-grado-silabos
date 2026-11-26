import { describe, expect, it } from 'vitest';
import definition from '@silabos/shared/test/fixtures/template-definition.json';
import type { DocumentStyle } from '@silabos/shared/lib/blocks/types';
import { layoutStyle } from '@/lib/documentLayout';

const document = definition.document as unknown as DocumentStyle;

const headers = (node: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(node)) return node.flatMap(headers);
    if (node === null || typeof node !== 'object') return [];
    const record = node as Record<string, unknown>;
    const own = record.type === 'tableHeader' ? [(record.attrs ?? {}) as Record<string, unknown>] : [];
    return [...own, ...Object.values(record).flatMap(headers)];
};

describe('table header look from document', () => {
    it('gives plain table headers the document header background and a text colour equal to the body text', () => {
        const style = layoutStyle(null, document);

        expect(style['--document-th-background']).toBe('#C3D4EA');
        expect(style['--document-th-background']).toBe(document.colors.table_header_background);
        expect(style['--document-th-color']).toBe(document.colors.text);
    });

    it('keeps the official headers free of the document header background and bold, and keeps the ones that differ', () => {
        const all = headers(definition.blocks);
        const plain = all.filter((attrs) => attrs.backgroundColor === null);

        expect(all.filter((attrs) => attrs.backgroundColor === '#C3D4EA' && attrs.bold === true)).toEqual([]);
        expect(plain).toHaveLength(54);
        expect(plain.every((attrs) => attrs.bold === null)).toBe(true);
        expect(all.filter((attrs) => attrs.backgroundColor === '#C3D4EA' && typeof attrs.textAlign === 'string')).toHaveLength(22);
        expect(all.filter((attrs) => attrs.backgroundColor === '#4F81BD')).toHaveLength(1);
    });
});
