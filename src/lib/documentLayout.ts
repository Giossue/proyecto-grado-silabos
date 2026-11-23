import type { DocumentStyle } from '@/lib/blocks/types';

export type DocumentLayout = { margin_cm: number; title_font_size: number; section_font_size: number; body_font_size: number };
export type DocumentLayoutOptions = Record<'margins' | 'title_sizes' | 'section_sizes' | 'body_sizes', Array<{ value: number; label: string }>>;

export const DEFAULT_LAYOUT: DocumentLayout = { margin_cm: 1.5, title_font_size: 14, section_font_size: 11, body_font_size: 11 };

export const PAPERS: Record<DocumentStyle['paper'], { width: number; height: number }> = {
    letter: { width: 215.9, height: 279.4 },
    a4: { width: 210, height: 297 },
    legal: { width: 215.9, height: 355.6 },
};

const PX_PER_MM = 96 / 25.4;

export const layoutOf = (source: Partial<DocumentLayout> | null | undefined): DocumentLayout => ({ ...DEFAULT_LAYOUT, ...(source ?? {}) });

export const paperOf = (document: DocumentStyle | null | undefined): { width: number; height: number } => PAPERS[document?.paper ?? 'letter'];

export const sheetPixels = (document: DocumentStyle | null | undefined): { portrait: number; landscape: number } => {
    const paper = paperOf(document);
    return { portrait: Math.round(paper.width * PX_PER_MM), landscape: Math.round(paper.height * PX_PER_MM) };
};

export const layoutStyle = (source: Partial<DocumentLayout> | null | undefined, document?: DocumentStyle | null): Record<string, string> => {
    const layout = layoutOf(source);
    const paper = paperOf(document);
    const style: Record<string, string> = {
        '--document-margin': `${layout.margin_cm}cm`,
        '--document-body-size': `${layout.body_font_size}pt`,
        '--document-title-size': `${layout.title_font_size}pt`,
        '--document-section-size': `${layout.section_font_size}pt`,
        '--document-page-width': `${paper.width}mm`,
        '--document-page-height': `${paper.height}mm`,
    };
    if (!document) return style;
    return {
        ...style,
        '--document-font': `${document.font_family}, Arial, Helvetica, sans-serif`,
        '--document-line-height': String(document.line_height),
        '--document-title-color': document.colors.title,
        '--document-text': document.colors.text,
        '--document-table-border': document.colors.table_border,
        '--document-empty-color': document.colors.empty_text,
        ...(document.colors.table_header_background ? { '--document-th-background': document.colors.table_header_background } : {}),
        ...(document.colors.table_header_text ? { '--document-th-color': document.colors.table_header_text } : {}),
    };
};

export const documentLayout = (document: DocumentStyle | null | undefined): DocumentLayout => document
    ? { margin_cm: document.margin_cm, title_font_size: document.sizes.title, section_font_size: document.sizes.section, body_font_size: document.sizes.body }
    : DEFAULT_LAYOUT;
