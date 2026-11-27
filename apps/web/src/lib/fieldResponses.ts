import type { DocumentNode } from '@silabos/shared/lib/templateDocument';
import { blockFilledText } from '@/lib/blocks/runtime';
import { FREE_TEXT_KIND, RESPONSE_NODE, responseAnswered, responseAttrs, responseLines } from '@silabos/shared/lib/responseKinds';

export const cloneResponse = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const blankResponse = (node: DocumentNode): boolean =>
    ['doc', 'paragraph', 'tableCell'].includes(node.type)
    && (node.content ?? []).every((child) => child.type === 'paragraph' && blankResponse(child));

/** A field holding nothing but a «Texto libre» space: only the teacher writes in it. */
export const onlyTeacherWrites = (document: DocumentNode): boolean => {
    const blocks = document.content ?? [];
    const inlines = blocks.flatMap((block) => block.content ?? []);
    return blocks.every((block) => block.type === 'paragraph') && inlines.length === 1
        && inlines[0]!.type === RESPONSE_NODE && responseAttrs(inlines[0]).kind === FREE_TEXT_KIND;
};

export const responseListTable = (node: DocumentNode): boolean => {
    const rows = [...(node.content ?? [])];
    const last = rows.pop();
    return rows.length > 0 && Boolean(last?.content?.length)
        && rows.every((row) => Boolean(row.content?.length) && row.content!.every((cell) => cell.type === 'tableHeader'))
        && last!.content!.every((cell) => responseSlot(cell) && Number(cell.attrs?.rowspan ?? 1) === 1);
};

export const responseSlot = (cell: DocumentNode): boolean => {
    if (blankResponse(cell)) return true;
    const paragraphs = cell.content ?? [];
    const inlines = paragraphs.flatMap((child) => child.content ?? []);
    return cell.type === 'tableCell' && inlines.length > 0
        && paragraphs.every((child) => child.type === 'paragraph')
        && inlines.every((inline) => inline.type === RESPONSE_NODE);
};

export const documentTables = (node: DocumentNode): DocumentNode[] =>
    node.type === 'table' ? [node] : (node.content ?? []).flatMap(documentTables);

export const templateRows = (template: DocumentNode): Array<DocumentNode | null> =>
    documentTables(template).map((table) => (responseListTable(table) ? table.content![table.content!.length - 1]! : null));

const emptiedRow = (row: DocumentNode): DocumentNode => ({
    ...row,
    content: (row.content ?? []).map((cell) => ({ ...cell, content: [{ type: 'paragraph', ...(cell.content?.[0]?.attrs ? { attrs: cell.content[0].attrs } : {}) }] })),
});

export const emptiedRows = (document: DocumentNode, admitsRows: boolean[]): Array<DocumentNode | null> =>
    documentTables(document).map((table, index) => (admitsRows[index] ? emptiedRow(table.content![table.content!.length - 1]!) : null));

export const responseDocument = (template: DocumentNode, value?: DocumentNode | null): DocumentNode => {
    if (!value || value.type !== template.type) return cloneResponse(template);
    if (template.type === 'tableHeader') return cloneResponse(template);
    if (template.type === RESPONSE_NODE) return { ...cloneResponse(template), attrs: { ...template.attrs, value: cloneResponse(value.attrs?.value ?? template.attrs?.value ?? null) } };
    if (blankResponse(template)) return { ...cloneResponse(template), content: cloneResponse(value.content ?? []) };
    if (template.type === 'documentBlock') return { ...cloneResponse(template), attrs: { ...template.attrs, value: cloneResponse(value.attrs?.value ?? template.attrs?.value ?? {}) } };
    const children = template.content ?? [];
    const count = template.type === 'table' && responseListTable(template) ? Math.max(children.length, value.content?.length ?? 0) : children.length;
    return children.length === 0 ? cloneResponse(template) : {
        ...cloneResponse(template),
        content: Array.from({ length: count }, (_, index) => responseDocument(children[index] ?? children[children.length - 1]!, value.content?.[index])),
    };
};

export const responseAt = (document: DocumentNode, path: number[]): DocumentNode =>
    path.reduce((node, index) => node.content![index]!, document);

export const replaceResponse = (document: DocumentNode, path: number[], value: DocumentNode): DocumentNode => {
    if (path.length === 0) return value;
    const next = cloneResponse(document);
    responseAt(next, path.slice(0, -1)).content![path[path.length - 1]!] = value;
    return next;
};

export const responseText = (node: DocumentNode): string => node.type === 'documentBlock' ? blockFilledText(node) : node.type === RESPONSE_NODE ? responseLines(responseAttrs(node)).join(' ') : node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(responseText).join(' ');

export const responseEmpty = (template: DocumentNode | undefined, value: DocumentNode | null | undefined): boolean => {
    if (!value) return true;
    if (template?.type === RESPONSE_NODE) return !responseAnswered(responseAttrs(value));
    if (!template || blankResponse(template) || template.type === 'documentBlock') return responseText(value).trim() === '';
    if (template.type === 'tableHeader') return true;
    const children = template.content ?? [];
    return (value.content ?? []).every((child, index) => {
        const source = children[index] ?? (template.type === 'table' && responseListTable(template) ? children[children.length - 1] : undefined);
        return !source || responseEmpty(source, child);
    });
};
