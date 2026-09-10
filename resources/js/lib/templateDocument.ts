import { columnWidths, headerRows } from '@/lib/tableLayout';
import type { TableLayout, TableRowData } from '@/lib/tableLayout';

export type DocumentNode = {
    type: string;
    text?: string;
    attrs?: Record<
        string,
        string | number | boolean | null | number[] | string[]
    >;
    marks?: { type: string; attrs?: Record<string, string | null> }[];
    content?: DocumentNode[];
};
export type TemplateVariable = { key: string; label: string; sample: string };
export type DocumentField = {
    id?: string;
    key: string;
    label: string;
    type?: string;
    value?: unknown;
    rows?: { id: string | null; data: TableRowData }[];
    options?: { value: string; label: string }[];
    inherited?: boolean;
    teacher_editable?: boolean;
    required?: boolean;
};
export const DOCUMENT_FONTS = [
    'Arial',
    'Calibri',
    'Times New Roman',
    'Verdana',
    'Georgia',
];
export const paragraph = (content: DocumentNode[] = []): DocumentNode => ({
    type: 'paragraph',
    content,
});
export const textNode = (text: string): DocumentNode => ({
    type: 'text',
    text,
});
export const fieldNode = (
    field: DocumentField,
    type = 'field',
): DocumentNode => ({
    type,
    attrs: {
        key: field.key,
        label: field.label,
        kind: field.type ?? 'texto_largo',
        choice: null,
        options: field.options?.map((option) => option.value) ?? null,
    },
});
export const cellNode = (
    content: DocumentNode[],
    colspan = 1,
    rowspan = 1,
    backgroundColor: string | null = null,
    colwidth: number[] | null = null,
): DocumentNode => ({
    type: 'tableCell',
    attrs: { colspan, rowspan, backgroundColor, colwidth },
    content: [paragraph(content)],
});
export const nodesOfType = (
    doc: DocumentNode,
    type: string,
): DocumentNode[] => [
    ...(doc.type === type ? [doc] : []),
    ...(doc.content ?? []).flatMap((child) => nodesOfType(child, type)),
];

export function defaultDocument(
    block: {
        content_type: string;
        table: TableLayout | null;
        fields: DocumentField[];
    },
    identification: DocumentNode,
): DocumentNode {
    if (block.content_type === 'institutional') {
        return JSON.parse(JSON.stringify(identification)) as DocumentNode;
    }

    const first = block.fields[0];

    if (!first) {
        return { type: 'doc', content: [paragraph()] };
    }

    if (block.content_type !== 'table' || !block.table) {
        const field = fieldNode(first);

        if (['bulleted_list', 'numbered_list'].includes(block.content_type)) {
            field.attrs!.listStyle =
                block.content_type === 'bulleted_list' ? 'bullet' : 'number';
        }

        return { type: 'doc', content: [paragraph([field])] };
    }

    const layout = block.table;
    const widths = (
        columnWidths(layout) ??
        layout.columns.map(() => `${100 / layout.columns.length}%`)
    ).map((w) => Math.max(20, Math.round(parseFloat(w) * 6)));
    const row = (content: DocumentNode[], rowRole = 'fixed'): DocumentNode => ({
        type: 'tableRow',
        attrs: { rowRole },
        content,
    });
    const count = layout.columns.length;
    const unitRows = layout.header_fields.map((field) =>
        row(
            [
                cellNode(
                    [
                        textNode(`${field.label}: `),
                        fieldNode({ ...field, type: 'texto_largo' }, 'column'),
                    ],
                    count,
                    1,
                    '#DBE5F1',
                ),
            ],
            'unit',
        ),
    );
    const headers = headerRows(layout).map((cells) =>
        row(
            cells.map((cell) => ({
                ...cellNode(
                    [
                        {
                            ...textNode(cell.label),
                            marks: [
                                { type: 'bold' },
                                {
                                    type: 'textStyle',
                                    attrs: {
                                        fontSize: '8pt',
                                        color: '#365F91',
                                    },
                                },
                            ],
                        },
                    ],
                    cell.colspan,
                    cell.rowspan,
                    '#DBE5F1',
                    cell.columns.map((index) => widths[index]),
                ),
                type: 'tableHeader',
            })),
        ),
    );
    const record = row(
        layout.columns.map((column, index) =>
            cellNode(
                [
                    fieldNode(
                        {
                            ...column,
                            type:
                                column.type === 'number'
                                    ? 'numero'
                                    : 'texto_largo',
                        },
                        'column',
                    ),
                ],
                1,
                1,
                null,
                [widths[index]],
            ),
        ),
        'record',
    );
    const totals = layout.totals.enabled
        ? [
              row(
                  layout.columns.map((column, index) =>
                      cellNode(
                          index === 0
                              ? [textNode(layout.totals.label)]
                              : column.type === 'number' && column.sum !== false
                                ? [
                                      fieldNode(
                                          { ...column, type: 'numero' },
                                          'column',
                                      ),
                                  ]
                                : [],
                          1,
                          1,
                          '#B8CCE4',
                          [widths[index]],
                      ),
                  ),
                  'total',
              ),
          ]
        : [];

    return {
        type: 'doc',
        content: [
            {
                type: 'table',
                attrs: { repeatKey: first.key },
                content: [...unitRows, ...headers, record, ...totals],
            },
        ],
    };
}

export const displayDocumentValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }

    if (Array.isArray(value)) {
        return value.map(displayDocumentValue).join(' · ');
    }

    if (typeof value === 'object') {
        return Object.values(value).map(displayDocumentValue).join(' · ');
    }

    return String(value);
};
