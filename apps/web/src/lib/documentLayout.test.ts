import { describe, expect, it } from 'vitest';
import definition from '@silabos/shared/test/fixtures/template-definition.json';
import type { DocumentStyle } from '@silabos/shared/lib/blocks/types';
import { documentTextStyles, layoutStyle, styleDraftOf, withStyleDraft } from '@/lib/documentLayout';

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

describe('document styles drafted in the template editor', () => {
    it('keeps every style the editor can change and leaves the title text, header and choices out', () => {
        const draft = styleDraftOf(document)!;

        expect(Object.keys(draft).sort()).toEqual(['body', 'colors', 'empty_text', 'font_family', 'line_height', 'orientation', 'paper', 'paragraph_spacing_pt', 'section_title', 'title']);
        expect(draft.title).toEqual({ bold: true, italic: false, alignment: 'center' });
        expect(styleDraftOf(null)).toBeNull();
    });

    it('lays the draft over the saved document, keeping the title text', () => {
        const draft = { ...styleDraftOf(document)!, paper: 'a4' as const, title: { bold: false, italic: true, alignment: 'right' } };
        const shown = withStyleDraft(document, draft)!;

        expect(shown.paper).toBe('a4');
        expect(shown.title).toEqual({ text: document.title.text, bold: false, italic: true, alignment: 'right' });
        expect(shown.choices).toEqual(document.choices);
        expect(withStyleDraft(null, draft)).toBeNull();
        expect(withStyleDraft(document, null)).toBe(document);
    });

    it('turns the alignment, bold, italic and paragraph spacing into sheet styles', () => {
        const styles = documentTextStyles({ ...document, paragraph_spacing_pt: 12, body: { alignment: 'justify' }, section_title: { bold: false, italic: true, alignment: 'center' } });

        expect(styles.body).toEqual({ textAlign: 'justify', '--document-paragraph-spacing': '12pt' });
        expect(styles.title).toEqual({ fontWeight: 700, fontStyle: 'normal', textAlign: 'center' });
        expect(styles.section).toEqual({ fontWeight: 400, fontStyle: 'italic', textAlign: 'center' });
        expect(documentTextStyles(null)).toEqual({ body: {}, title: {}, section: {} });
    });
});
