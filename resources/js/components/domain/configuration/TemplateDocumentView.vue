<script setup lang="ts">
import { defineComponent, h, useId } from 'vue';
import type { VNodeChild, CSSProperties } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { groupByUnit, sumColumn, formatSum } from '@/lib/tableLayout';
import type { TableLayout, TableRowData } from '@/lib/tableLayout';
import { displayDocumentValue } from '@/lib/templateDocument';
import type { DocumentNode, DocumentField } from '@/lib/templateDocument';

type Row = { id: string | null; data: TableRowData };
type Context = {
    field?: DocumentField;
    row?: Row;
    unit?: number;
    role?: string;
    totals?: TableRowData;
};
const props = withDefaults(
    defineProps<{
        document: DocumentNode;
        fields: DocumentField[];
        variables: Record<string, string>;
        layout?: TableLayout | null;
        editable?: boolean;
        preview?: boolean;
    }>(),
    { layout: null, editable: false, preview: false },
);
const emit = defineEmits<{
    value: [key: string, value: string | number | boolean];
    rows: [key: string, rows: Row[]];
}>();
const prefix = useId();
const columnGroup = (table: DocumentNode): VNodeChild => {
    const occupied: boolean[][] = [];
    const widths: number[] = [];

    for (const [y, row] of (table.content ?? []).entries()) {
        let x = 0;

        for (const cell of row.content ?? []) {
            while (occupied[y]?.[x]) {
                x++;
            }

            const span = Number(cell.attrs?.colspan ?? 1);
            const height = Number(cell.attrs?.rowspan ?? 1);
            const values = Array.isArray(cell.attrs?.colwidth)
                ? cell.attrs.colwidth
                : [];

            for (let column = 0; column < span; column++) {
                if (values[column]) {
                    widths[x + column] = values[column];
                } else {
                    widths[x + column] ??= 0;
                }

                for (let r = y; r < y + height; r++) {
                    occupied[r] ??= [];
                    occupied[r][x + column] = true;
                }
            }

            x += span;
        }
    }

    const resolved = widths.map(
        (width) => width || 600 / Math.max(1, widths.length),
    );
    const total = resolved.reduce((sum, width) => sum + width, 0);

    return h(
        'colgroup',
        {},
        resolved.map((width) =>
            h('col', { style: { width: `${(width / total) * 100}%` } }),
        ),
    );
};
const markStyle = (node: DocumentNode): CSSProperties => {
    const style: CSSProperties = {};

    for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') {
            style.fontWeight = 'bold';
        }

        if (mark.type === 'italic') {
            style.fontStyle = 'italic';
        }

        if (mark.type === 'underline') {
            style.textDecoration = 'underline';
        }

        if (mark.type === 'textStyle') {
            const attrs = mark.attrs ?? {};

            if (attrs.fontFamily) {
                style.fontFamily = attrs.fontFamily;
            }

            if (attrs.fontSize) {
                style.fontSize = attrs.fontSize;
            }

            if (attrs.color) {
                style.color = attrs.color;
            }
        }
    }

    return style;
};
const setColumn = (context: Context, key: string, value: string | number) => {
    const field = context.field;

    if (!field) {
        return;
    }

    const rows = (field.rows ?? []).map((row) => ({
        id: row.id,
        data: { ...row.data },
    }));
    let index = (field.rows ?? []).indexOf(context.row!);

    if (index < 0) {
        rows.push({
            id: null,
            data: {
                _unit: context.unit ?? 1,
                ...(context.role === 'unit' ? { _kind: 'unit' } : {}),
            },
        });
        index = rows.length - 1;
    }

    rows[index].data[key] = value;
    emit('rows', field.key, rows);
};
const addRecord = (field: DocumentField, unit: number) =>
    emit('rows', field.key, [
        ...(field.rows ?? []),
        { id: null, data: { _unit: unit } },
    ]);
const removeRecord = (field: DocumentField, row: Row) =>
    emit(
        'rows',
        field.key,
        (field.rows ?? []).filter((item) => item !== row),
    );

const input = (
    node: DocumentNode,
    context: Context,
    path: string,
): VNodeChild => {
    const attrs = node.attrs ?? {};
    const key = String(attrs.key);
    const field =
        node.type === 'column'
            ? context.field
            : props.fields.find((item) => item.key === key);
    const choice = attrs.choice;
    const isColumn = node.type === 'column';
    const value = isColumn
        ? context.role === 'total'
            ? context.totals?.[key]
            : context.row?.data[key]
        : field?.value;
    const canEdit =
        props.editable &&
        field &&
        !field.inherited &&
        field.teacher_editable !== false &&
        context.role !== 'total';
    const label = String(attrs.label ?? field?.label ?? 'Contenido');
    const kind = isColumn
        ? String(attrs.kind)
        : (field?.type ?? String(attrs.kind));
    const change = (value: string | number | boolean) => {
        if (!canEdit) {
            return;
        }

        if (isColumn) {
            setColumn(
                context,
                key,
                value === ''
                    ? ''
                    : kind === 'numero'
                      ? Number(value)
                      : String(value),
            );
        } else {
            emit('value', key, value);
        }
    };
    const style = markStyle(node);
    const text = displayDocumentValue(value);

    if (!canEdit) {
        if (field?.type === 'repetible' && !isColumn && attrs.listStyle) {
            return h(
                attrs.listStyle === 'number' ? 'ol' : 'ul',
                { style },
                (field.rows ?? []).map((row) =>
                    h('li', {}, displayDocumentValue(row.data.texto)),
                ),
            );
        }

        const content = choice
            ? text === choice
                ? 'X'
                : ''
            : field?.type === 'repetible' && !isColumn
              ? (field.rows ?? [])
                    .map((row) => displayDocumentValue(row.data.texto))
                    .join('\n')
              : text;

        return h(
            'span',
            { style, class: 'document-value' },
            content || (props.preview && !choice ? `⟦${label}⟧` : ''),
        );
    }

    const attributes = {
        id: `${prefix}-${path}`,
        'aria-label': label,
        'aria-required': field.required ?? true,
        class: 'document-input',
        style,
    };

    if (choice) {
        return h(
            Button,
            {
                type: 'button',
                variant: 'ghost',
                size: 'sm',
                'aria-label': `${label}: ${choice}`,
                'aria-pressed': text === choice,
                onClick: () => change(String(choice)),
            },
            () => (text === choice ? 'X' : '□'),
        );
    }

    if (!isColumn && kind === 'repetible') {
        const rows = field.rows ?? [];

        return h('div', { class: 'flex flex-col gap-2', style }, [
            ...rows.map((row, index) =>
                h(
                    'div',
                    { class: 'flex items-start gap-1', key: row.id ?? index },
                    [
                        h(Textarea, {
                            ...attributes,
                            id: `${prefix}-${path}-${index}`,
                            modelValue: String(row.data.texto ?? ''),
                            placeholder: `Ej. ${label}`,
                            'onUpdate:modelValue': (value: string | number) =>
                                emit(
                                    'rows',
                                    key,
                                    rows.map((item, i) =>
                                        i === index
                                            ? {
                                                  ...item,
                                                  data: {
                                                      ...item.data,
                                                      texto: String(value),
                                                  },
                                              }
                                            : item,
                                    ),
                                ),
                        }),
                        h(
                            Button,
                            {
                                variant: 'ghost',
                                type: 'button',
                                'aria-label': `Quitar elemento ${index + 1}`,
                                onClick: () => removeRecord(field, row),
                            },
                            () => 'Quitar',
                        ),
                    ],
                ),
            ),
            h(
                Button,
                {
                    variant: 'outline',
                    type: 'button',
                    class: 'self-start',
                    onClick: () =>
                        emit('rows', key, [
                            ...rows,
                            { id: null, data: { texto: '' } },
                        ]),
                },
                () => 'Agregar elemento',
            ),
        ]);
    }

    if (kind === 'seleccion_unica') {
        return h(
            Select,
            {
                modelValue: text,
                'onUpdate:modelValue': (value) => change(String(value)),
            },
            () => [
                h(SelectTrigger, attributes, () =>
                    h(SelectValue, { placeholder: 'Seleccione' }),
                ),
                h(SelectContent, {}, () =>
                    h(SelectGroup, {}, () =>
                        (field.options ?? []).map((option) =>
                            h(
                                SelectItem,
                                { value: option.value, key: option.value },
                                () => option.label,
                            ),
                        ),
                    ),
                ),
            ],
        );
    }

    const control = ['numero', 'fecha', 'texto_corto'].includes(kind)
        ? Input
        : Textarea;

    return h(control, {
        ...attributes,
        modelValue: text,
        type: kind === 'numero' ? 'number' : kind === 'fecha' ? 'date' : 'text',
        placeholder: `Ej. ${label}`,
        'onUpdate:modelValue': change,
    });
};

const draw = (
    node: DocumentNode,
    context: Context = {},
    path = 'doc',
): VNodeChild => {
    const attrs = node.attrs ?? {};
    const children = () =>
        (node.content ?? []).map((child, index) =>
            draw(child, context, `${path}-${index}`),
        );

    if (node.type === 'text') {
        return h('span', { style: markStyle(node) }, node.text);
    }

    if (node.type === 'hardBreak') {
        return h('br');
    }

    if (node.type === 'variable') {
        return h(
            'span',
            {
                style: markStyle(node),
                'data-variable': String(attrs.id),
                class: 'document-variable',
            },
            props.variables[String(attrs.id)] ??
                (props.preview ? `@${attrs.id}` : ''),
        );
    }

    if (['field', 'column'].includes(node.type)) {
        return input(node, context, path);
    }

    if (node.type === 'paragraph') {
        return h(
            'div',
            {
                class: 'document-paragraph',
                style: { textAlign: String(attrs.textAlign ?? 'left') },
                'data-page-unit': '',
            },
            children(),
        );
    }

    if (node.type === 'table' && attrs.repeatKey && props.layout) {
        const field = props.fields.find(
            (field) => field.key === attrs.repeatKey,
        );

        if (!field) {
            return null;
        }

        const layout = props.layout;
        const grouped = groupByUnit(field.rows ?? [], layout.repeat.enabled);
        const units = grouped.length
            ? grouped
            : [{ number: 1, header: null, rows: [] }];
        const tables = units.map((unit) => {
            const totals: TableRowData = {};

            for (const column of layout.columns) {
                if (column.type === 'number' && column.sum !== false) {
                    totals[column.key] = formatSum(
                        sumColumn(
                            unit.rows.map((row) => row.data),
                            column.key,
                        ),
                    );
                }
            }

            const content: VNodeChild[] = [];
            const designRows = node.content ?? [];

            for (let index = 0; index < designRows.length; index++) {
                const source = designRows[index];
                const role = String(source.attrs?.rowRole ?? 'fixed');

                if (role === 'record') {
                    const group = [source];

                    while (designRows[index + 1]?.attrs?.rowRole === 'record') {
                        group.push(designRows[++index]);
                    }

                    for (const [rowIndex, record] of (unit.rows.length
                        ? unit.rows
                        : [null]
                    ).entries()) {
                        group.forEach((row, offset) =>
                            content.push(
                                draw(
                                    row,
                                    {
                                        field,
                                        row: record ?? undefined,
                                        role,
                                        unit: unit.number,
                                    },
                                    `${path}-u${unit.number}-r${rowIndex}-${offset}`,
                                ),
                            ),
                        );
                    }
                } else {
                    content.push(
                        draw(
                            source,
                            {
                                field,
                                row: unit.header ?? undefined,
                                role,
                                unit: unit.number,
                                totals,
                            },
                            `${path}-u${unit.number}-${index}`,
                        ),
                    );
                }
            }

            return h(
                'div',
                { class: 'document-repeat-unit', key: unit.number },
                [
                    layout.repeat.enabled
                        ? h(
                              'p',
                              { class: 'font-bold', 'data-page-keep-next': '' },
                              `${layout.repeat.label} ${unit.number}`,
                          )
                        : null,
                    h('table', { class: 'document-table' }, [
                        columnGroup(node),
                        h('tbody', {}, content),
                    ]),
                    props.editable
                        ? h('div', { class: 'flex flex-wrap gap-2 py-2' }, [
                              h(
                                  Button,
                                  {
                                      type: 'button',
                                      variant: 'outline',
                                      onClick: () =>
                                          addRecord(field, unit.number),
                                  },
                                  () => 'Agregar fila de datos',
                              ),
                              ...unit.rows.map((row, i) =>
                                  h(
                                      Button,
                                      {
                                          type: 'button',
                                          variant: 'ghost',
                                          onClick: () =>
                                              removeRecord(field, row),
                                      },
                                      () => `Quitar fila ${i + 1}`,
                                  ),
                              ),
                          ])
                        : null,
                ],
            );
        });

        if (props.editable && layout.repeat.enabled) {
            tables.push(
                h(
                    Button,
                    {
                        type: 'button',
                        variant: 'outline',
                        onClick: () =>
                            addRecord(
                                field,
                                Math.max(...units.map((unit) => unit.number)) +
                                    1,
                            ),
                    },
                    () => 'Agregar unidad',
                ),
            );
        }

        return h('div', { class: 'flex flex-col gap-3' }, tables);
    }

    if (node.type === 'table') {
        return h('table', { class: 'document-table' }, [
            columnGroup(node),
            h('tbody', {}, children()),
        ]);
    }

    if (node.type === 'tableRow') {
        return h('tr', {}, children());
    }

    if (node.type === 'tableCell' || node.type === 'tableHeader') {
        return h(
            node.type === 'tableCell' ? 'td' : 'th',
            {
                colspan: Number(attrs.colspan ?? 1),
                rowspan: Number(attrs.rowspan ?? 1),
                style: {
                    backgroundColor: attrs.backgroundColor || undefined,
                },
            },
            children(),
        );
    }

    const tag =
        { bulletList: 'ul', orderedList: 'ol', listItem: 'li' }[node.type] ??
        'div';

    return h(tag, {}, children());
};
const Content = defineComponent({ setup: () => () => draw(props.document) });
</script>

<template>
    <div class="template-document-view" :data-preview="preview || undefined">
        <Content />
    </div>
</template>

<style scoped>
.template-document-view {
    color: #000;
    background: #fff;
    font:
        11pt Arial,
        sans-serif;
    overflow-wrap: anywhere;
}
.template-document-view[data-preview] {
    /* The page surfaces supply white; the space between them stays transparent. */
    background: transparent;
}
.template-document-view :deep(.document-paragraph) {
    margin: 0 0 8px;
    min-height: 1em;
    white-space: pre-wrap;
}
.template-document-view :deep(.document-table) {
    border-collapse: collapse;
    width: 100%;
    table-layout: fixed;
    margin: 8px 0;
}
.template-document-view :deep(td),
.template-document-view :deep(th) {
    border: 1px solid #7f7f7f;
    padding: 2px 4px;
    vertical-align: middle;
    font-weight: normal;
}
.template-document-view :deep(td .document-paragraph),
.template-document-view :deep(th .document-paragraph) {
    margin: 0;
}
.template-document-view :deep(.document-input) {
    font: inherit;
    color: inherit;
    min-height: 1.5em;
    height: auto;
    padding: 2px;
    background: transparent;
    width: 100%;
}
.template-document-view :deep(ul) {
    list-style: disc;
    padding-left: 24px;
}
.template-document-view :deep(ol) {
    list-style: decimal;
    padding-left: 24px;
}
</style>
