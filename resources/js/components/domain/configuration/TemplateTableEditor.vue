<script setup lang="ts">
import {
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Baseline,
    BadgeCheck,
    Bold,
    Braces,
    ChevronDown,
    Columns3,
    Database,
    Eraser,
    Italic,
    PaintBucket,
    Plus,
    Redo2,
    Rows3,
    SplitSquareHorizontal,
    SquareDashed,
    Undo2,
    UnfoldHorizontal,
    UserRoundPlus,
} from '@lucide/vue';
import { mergeAttributes, Node } from '@tiptap/core';
import {
    Table,
    TableCell,
    TableHeader,
    TableRow,
} from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import {
    Color,
    FontFamily,
    FontSize,
    TextStyle,
} from '@tiptap/extension-text-style';
import { CellSelection } from '@tiptap/pm/tables';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import TemplateToolbarButton from '@/components/domain/configuration/TemplateToolbarButton.vue';
import TemplateToolbarSelect from '@/components/domain/configuration/TemplateToolbarSelect.vue';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
    TableColumn,
    TableColumnRole,
    TableLayout,
} from '@/lib/tableLayout';
import { tableKeyFor } from '@/lib/tableLayout';
import type {
    DocumentField,
    DocumentNode,
    TemplateVariable,
} from '@/lib/templateDocument';
import { nodesOfType } from '@/lib/templateDocument';

type CellAlignment = 'left' | 'center' | 'right' | 'justify';
type CellBorder = 'thin' | 'thick' | 'none';
type TableRowRole = 'fixed' | 'record' | 'unit' | 'total';
type CellAttributes = {
    backgroundColor?: string | null;
    textColor?: string | null;
    textAlign?: CellAlignment | null;
    bold?: boolean | null;
    italic?: boolean | null;
    borderStyle?: CellBorder | null;
};

const props = defineProps<{
    document: DocumentNode;
    pending: boolean;
    fontFamily: string;
    fontSize: number;
    textColor: string;
    bodyAlignment: CellAlignment;
    colors: { value: string; label: string }[];
    fields: DocumentField[];
    variables: TemplateVariable[];
    layout?: TableLayout | null;
    toolbarTarget?: string;
}>();

const emit = defineEmits<{
    dirty: [value: boolean];
}>();

const editorStyle = computed<CSSProperties & Record<string, string>>(() => ({
    fontFamily: props.fontFamily,
    fontSize: `${props.fontSize}pt`,
    color: props.textColor,
    '--table-body-alignment': props.bodyAlignment,
}));

const cellStyle = (attributes: Record<string, unknown>) => {
    const styles: string[] = [];

    if (typeof attributes.backgroundColor === 'string') {
        styles.push(`background-color: ${attributes.backgroundColor}`);
    }

    if (typeof attributes.textColor === 'string') {
        styles.push(`color: ${attributes.textColor}`);
    }

    if (typeof attributes.textAlign === 'string') {
        styles.push(`text-align: ${attributes.textAlign}`);
    }

    if (typeof attributes.bold === 'boolean') {
        styles.push(`font-weight: ${attributes.bold ? '700' : '400'}`);
    }

    if (typeof attributes.italic === 'boolean') {
        styles.push(`font-style: ${attributes.italic ? 'italic' : 'normal'}`);
    }

    if (typeof attributes.borderStyle === 'string') {
        styles.push(
            attributes.borderStyle === 'none'
                ? 'border: 0'
                : `border: ${attributes.borderStyle === 'thick' ? '2px' : '1px'} solid #7F7F7F`,
        );
    }

    return styles.join('; ');
};

const cellAttributes = () => ({
    backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-background-color'),
    },
    textColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-cell-text-color'),
    },
    textAlign: {
        default: null,
        parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-cell-text-align'),
    },
    bold: {
        default: null,
        parseHTML: (element: HTMLElement) => {
            const value = element.getAttribute('data-cell-bold');

            return value === null ? null : value === 'true';
        },
    },
    italic: {
        default: null,
        parseHTML: (element: HTMLElement) => {
            const value = element.getAttribute('data-cell-italic');

            return value === null ? null : value === 'true';
        },
    },
    borderStyle: {
        default: null,
        parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-cell-border-style'),
    },
});

const cellDomAttributes = (attributes: Record<string, unknown>) => {
    const {
        backgroundColor,
        textColor,
        textAlign,
        bold,
        italic,
        borderStyle,
        ...structural
    } = attributes;

    return mergeAttributes(structural, {
        'data-background-color': backgroundColor ?? undefined,
        'data-cell-text-color': textColor ?? undefined,
        'data-cell-text-align': textAlign ?? undefined,
        'data-cell-bold': typeof bold === 'boolean' ? String(bold) : undefined,
        'data-cell-italic':
            typeof italic === 'boolean' ? String(italic) : undefined,
        'data-cell-border-style': borderStyle ?? undefined,
        style: cellStyle(attributes),
    });
};

const StyledTableCell = TableCell.extend({
    addAttributes() {
        return { ...this.parent?.(), ...cellAttributes() };
    },
    renderHTML({ HTMLAttributes }) {
        return ['td', cellDomAttributes(HTMLAttributes), 0];
    },
});

const StyledTableHeader = TableHeader.extend({
    addAttributes() {
        return { ...this.parent?.(), ...cellAttributes() };
    },
    renderHTML({ HTMLAttributes }) {
        return ['th', cellDomAttributes(HTMLAttributes), 0];
    },
});

const inlineNode = (name: 'field' | 'column' | 'variable') =>
    Node.create({
        name,
        group: 'inline',
        inline: true,
        atom: true,
        addAttributes: () =>
            name === 'variable'
                ? {
                      id: { default: null },
                      label: { default: '' },
                  }
                : {
                      key: { default: null },
                      label: { default: '' },
                      kind: { default: 'texto_largo' },
                      choice: { default: null },
                      options: { default: null },
                      listStyle: { default: null },
                      ...(name === 'column'
                          ? {
                                role: { default: null },
                                sum: { default: null },
                            }
                          : {}),
                  },
        parseHTML: () => [
            {
                tag:
                    name === 'variable'
                        ? '[data-template-variable]'
                        : `[data-template-${name}]`,
            },
        ],
        renderHTML: ({ node, HTMLAttributes }) => {
            const label =
                name === 'variable'
                    ? `@${node.attrs.id}`
                    : name === 'column'
                      ? `$${node.attrs.key}`
                      : node.attrs.choice
                        ? `X si ${node.attrs.label} = ${node.attrs.choice}`
                        : node.attrs.label;

            return [
                'span',
                mergeAttributes(HTMLAttributes, {
                    [name === 'variable'
                        ? 'data-template-variable'
                        : `data-template-${name}`]:
                        name === 'variable' ? node.attrs.id : node.attrs.key,
                    class:
                        name === 'variable'
                            ? 'template-table-variable'
                            : 'template-table-field',
                    contenteditable: 'false',
                    title: label,
                }),
                label,
            ];
        },
    });

const initial = JSON.stringify(props.document);
const version = ref(0);
const tableMenuHelpOpen = ref(false);
const newFieldOpen = ref(false);
const newFieldLabel = ref('');
const newFieldType = ref('texto_largo');
const newFieldOptions = ref('Sí, No');
const newFieldError = ref('');
const newDataOpen = ref(false);
const newDataLabel = ref('');
const newDataType = ref<'text' | 'number'>('text');
const newDataRole = ref<TableColumnRole | 'none'>('none');
const newDataScope = ref<'record' | 'unit'>('record');
const newDataError = ref('');
const editor = useEditor({
    content: props.document,
    editorProps: {
        attributes: {
            'aria-label': 'Editar tabla de la plantilla',
            role: 'textbox',
            'aria-multiline': 'true',
            spellcheck: 'true',
        },
    },
    extensions: [
        StarterKit.configure({
            heading: false,
            blockquote: false,
            code: false,
            codeBlock: false,
            horizontalRule: false,
            link: false,
            strike: false,
            trailingNode: false,
        }),
        TextStyle,
        FontFamily,
        FontSize,
        Color,
        TextAlign.configure({ types: ['paragraph'] }),
        Table.extend({
            addAttributes() {
                return {
                    ...this.parent?.(),
                    repeatKey: { default: null },
                    groupByUnit: { default: null },
                    visualStructure: { default: null },
                };
            },
        }).configure({
            resizable: true,
            cellMinWidth: 20,
            lastColumnResizable: false,
        }),
        TableRow.extend({
            addAttributes() {
                return { ...this.parent?.(), rowRole: { default: 'fixed' } };
            },
        }),
        StyledTableCell,
        StyledTableHeader,
        inlineNode('field'),
        inlineNode('column'),
        inlineNode('variable'),
    ],
    onUpdate: ({ editor: current }) => {
        version.value++;
        emit('dirty', JSON.stringify(current.getJSON()) !== initial);
    },
    onSelectionUpdate: () => {
        version.value++;
    },
    onTransaction: () => {
        version.value++;
    },
});

watch(
    () => props.pending,
    (pending) => editor.value?.setEditable(!pending),
);

onBeforeUnmount(() => editor.value?.destroy());

const state = computed(() => {
    void version.value;

    return editor.value;
});

const selectedCell = computed<CellAttributes>(() => {
    const current = state.value;

    if (!current) {
        return {};
    }

    const selection = current.state.selection;

    if (selection instanceof CellSelection) {
        return selection.$anchorCell.nodeAfter?.attrs ?? {};
    }

    for (let depth = selection.$from.depth; depth > 0; depth--) {
        const node = selection.$from.node(depth);

        if (['tableCell', 'tableHeader'].includes(node.type.name)) {
            return node.attrs;
        }
    }

    return {};
});

const inCell = computed(() => Object.keys(selectedCell.value).length > 0);
const ancestorAttributes = (type: 'table' | 'tableRow') => {
    const current = state.value;

    if (!current) {
        return null;
    }

    const { $from } = current.state.selection;

    for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);

        if (node.type.name === type) {
            return node.attrs as Record<string, unknown>;
        }
    }

    return null;
};
const selectedRowRole = computed<TableRowRole>(() => {
    void version.value;

    const role = ancestorAttributes('tableRow')?.rowRole;

    return ['record', 'unit', 'total'].includes(String(role))
        ? (role as TableRowRole)
        : 'fixed';
});
const groupedByUnit = computed(() => {
    void version.value;

    const value = ancestorAttributes('table')?.groupByUnit;

    return typeof value === 'boolean'
        ? value
        : Boolean(props.layout?.repeat.enabled);
});
const repeatField = computed(() =>
    props.fields.find((field) => field.type === 'repetible'),
);
const repeatedColumns = computed<TableColumn[]>(() => {
    void version.value;

    const columns = new Map(
        (props.layout?.columns ?? []).map((column) => [column.key, column]),
    );
    const document =
        (editor.value?.getJSON() as DocumentNode | undefined) ?? props.document;

    for (const row of nodesOfType(document, 'tableRow')) {
        if (!['record', 'total'].includes(String(row.attrs?.rowRole))) {
            continue;
        }

        for (const node of nodesOfType(row, 'column')) {
            const key = String(node.attrs?.key ?? '');

            if (!key || columns.has(key)) {
                continue;
            }

            columns.set(key, {
                key,
                label: String(node.attrs?.label ?? key),
                type: node.attrs?.kind === 'numero' ? 'number' : 'text',
                group: null,
                band: null,
                sum: Boolean(node.attrs?.sum),
                width: null,
                role: (node.attrs?.role as TableColumnRole | null) ?? null,
            });
        }
    }

    return [...columns.values()];
});
const selectedRowHasColumns = computed(() => {
    void version.value;

    const current = state.value;

    if (!current) {
        return false;
    }

    const { $from } = current.state.selection;

    for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);

        if (node.type.name === 'tableRow') {
            return (
                nodesOfType(node.toJSON() as DocumentNode, 'column').length > 0
            );
        }
    }

    return false;
});
const usedColumnRoles = computed(
    () =>
        new Set(
            repeatedColumns.value
                .map((column) => column.role)
                .filter((role): role is TableColumnRole => role !== null),
        ),
);
const rowRoleLabel = computed(
    () =>
        ({
            fixed: 'Fila normal',
            record: 'Fila que completa el docente',
            unit: 'Datos de la unidad',
            total: 'Fila de totales',
        })[selectedRowRole.value],
);
const teacherFields = computed(() => {
    void version.value;
    const byKey = new Map(
        props.fields
            .filter(
                (field) =>
                    field.teacher_editable !== false &&
                    !field.inherited &&
                    !['repetible', 'flujo', 'referencia_maestra'].includes(
                        field.type ?? '',
                    ),
            )
            .map((field) => [field.key, field]),
    );

    for (const node of nodesOfType(
        (editor.value?.getJSON() as DocumentNode | undefined) ?? props.document,
        'field',
    )) {
        const key = String(node.attrs?.key ?? '');

        if (!key || byKey.has(key)) {
            continue;
        }

        const rawOptions = node.attrs?.options;
        byKey.set(key, {
            key,
            label: String(node.attrs?.label ?? key),
            type: String(node.attrs?.kind ?? 'texto_largo'),
            options: Array.isArray(rawOptions)
                ? rawOptions.map((option) => ({
                      value: String(option),
                      label: String(option),
                  }))
                : [],
            inherited: false,
            teacher_editable: true,
            required: true,
        });
    }

    return [...byKey.values()];
});
const conditionalChoices = computed(() =>
    teacherFields.value.flatMap((field) =>
        (field.options ?? []).map((option) => ({ field, option })),
    ),
);
type TableCommand =
    | 'mergeCells'
    | 'splitCell'
    | 'addRowBefore'
    | 'addRowAfter'
    | 'addColumnBefore'
    | 'addColumnAfter'
    | 'deleteRow'
    | 'deleteColumn';
const can = (command: TableCommand) => {
    void version.value;
    const commands = state.value?.can();
    const candidate = commands?.[command];

    return typeof candidate === 'function' ? candidate() : false;
};

const setAncestorAttribute = (
    type: 'table' | 'tableRow',
    attribute: string,
    value: unknown,
): void => {
    const current = state.value;

    if (!current) {
        return;
    }

    const { $from } = current.state.selection;

    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type.name !== type) {
            continue;
        }

        current.view.dispatch(
            current.state.tr.setNodeAttribute(
                $from.before(depth),
                attribute,
                value,
            ),
        );
        current.commands.focus();

        return;
    }
};

const enableRepeatedTable = (): boolean => {
    const field = repeatField.value;

    if (!field) {
        return false;
    }

    setAncestorAttribute('table', 'repeatKey', field.key);
    setAncestorAttribute('table', 'visualStructure', true);

    return true;
};

const setRowRole = (value: unknown): void => {
    if (
        !['fixed', 'record', 'unit', 'total'].includes(String(value)) ||
        !repeatField.value
    ) {
        return;
    }

    const role = value as TableRowRole;

    if (
        role === 'fixed' &&
        selectedRowRole.value !== 'fixed' &&
        selectedRowHasColumns.value
    ) {
        return;
    }

    if (role !== 'fixed' && !enableRepeatedTable()) {
        return;
    }

    if (role === 'fixed') {
        setAncestorAttribute('table', 'visualStructure', true);
    }

    setAncestorAttribute('tableRow', 'rowRole', role);
};

const deleteSelectedRow = (): void => {
    setAncestorAttribute('table', 'visualStructure', true);
    state.value?.chain().focus().deleteRow().run();
};

const setGroupedByUnit = (value: boolean): void => {
    if (!enableRepeatedTable()) {
        return;
    }

    setAncestorAttribute('table', 'groupByUnit', value);
};

const setCell = (attribute: keyof CellAttributes, value: unknown): void => {
    state.value?.chain().focus().setCellAttribute(attribute, value).run();
};

const nullableModel = <T extends string>(attribute: keyof CellAttributes) =>
    computed({
        get: () => String(selectedCell.value[attribute] ?? 'inherit'),
        set: (value: string) =>
            setCell(attribute, value === 'inherit' ? null : (value as T)),
    });

const background = nullableModel<string>('backgroundColor');
const color = nullableModel<string>('textColor');
const alignment = nullableModel<CellAlignment>('textAlign');
const border = nullableModel<CellBorder>('borderStyle');

const colorName = (value: string, inherited: string): string =>
    value === 'inherit'
        ? inherited
        : (props.colors.find((option) => option.value === value)?.label ??
          value);

const backgroundTooltip = computed(
    () => `Fondo de celda: ${colorName(background.value, 'Sin fondo')}`,
);
const textColorTooltip = computed(
    () => `Color del texto: ${colorName(color.value, 'Heredado')}`,
);
const alignmentTooltip = computed(() => {
    const labels: Record<string, string> = {
        inherit: 'Heredada',
        left: 'Izquierda',
        center: 'Centro',
        right: 'Derecha',
        justify: 'Justificada',
    };

    return `Alineación de celda: ${labels[alignment.value] ?? alignment.value}`;
});
const borderTooltip = computed(() => {
    const labels: Record<string, string> = {
        inherit: 'Original',
        thin: 'Fino',
        thick: 'Grueso',
        none: 'Sin borde',
    };

    return `Borde de celda: ${labels[border.value] ?? border.value}`;
});

const resetCell = (): void => {
    const chain = state.value?.chain().focus();

    chain
        ?.setCellAttribute('backgroundColor', null)
        .setCellAttribute('textColor', null)
        .setCellAttribute('textAlign', null)
        .setCellAttribute('bold', null)
        .setCellAttribute('italic', null)
        .setCellAttribute('borderStyle', null)
        .run();
};

const insertNode = (node: DocumentNode): void => {
    if (!inCell.value || props.pending) {
        return;
    }

    state.value?.chain().focus().insertContent(node).run();
};

const insertVariable = (variable: TemplateVariable): void =>
    insertNode({
        type: 'variable',
        attrs: { id: variable.key, label: variable.label },
    });

const insertField = (
    field: DocumentField,
    choice: string | null = null,
): void =>
    insertNode({
        type: 'field',
        attrs: {
            key: field.key,
            label: field.label,
            kind: field.type ?? 'texto_largo',
            choice,
            options: field.options?.map((option) => option.value) ?? null,
            listStyle: null,
        },
    });

const insertRepeatedColumn = (column: TableColumn): void => {
    if (
        !repeatField.value ||
        !['record', 'total'].includes(selectedRowRole.value)
    ) {
        return;
    }

    enableRepeatedTable();
    insertNode({
        type: 'column',
        attrs: {
            key: column.key,
            label: column.label,
            kind: column.type === 'number' ? 'numero' : 'texto_largo',
            role: column.role ?? null,
            sum: selectedRowRole.value === 'total' || Boolean(column.sum),
        },
    });
};

const openNewData = (): void => {
    if (!repeatField.value || selectedRowRole.value === 'total') {
        return;
    }

    newDataScope.value = selectedRowRole.value === 'unit' ? 'unit' : 'record';
    newDataLabel.value = '';
    newDataType.value = 'text';
    newDataRole.value = 'none';
    newDataError.value = '';
    newDataOpen.value = true;
};

const updateNewDataOpen = (value: boolean): void => {
    newDataOpen.value = value;

    if (!value) {
        newDataError.value = '';
    }
};

const setNewDataType = (value: unknown): void => {
    if (value !== 'text' && value !== 'number') {
        return;
    }

    newDataType.value = value;

    if (value === 'text') {
        newDataRole.value = 'none';
    }
};

const setNewDataRole = (value: unknown): void => {
    if (
        value === 'none' ||
        ['week', 'hours_acd', 'hours_ape', 'hours_aa'].includes(String(value))
    ) {
        newDataRole.value = value as TableColumnRole | 'none';

        if (value !== 'none') {
            newDataType.value = 'number';
        }
    }
};

const createRepeatedData = (): void => {
    const label = newDataLabel.value.trim();

    if (!label) {
        newDataError.value = 'Escriba el nombre del dato.';

        return;
    }

    if (label.length > 180) {
        newDataError.value = 'Use un nombre de hasta 180 caracteres.';

        return;
    }

    if (
        newDataRole.value !== 'none' &&
        usedColumnRoles.value.has(newDataRole.value)
    ) {
        newDataError.value =
            'Esa función especial ya pertenece a otra columna.';

        return;
    }

    const document =
        (editor.value?.getJSON() as DocumentNode | undefined) ?? props.document;
    const key = tableKeyFor(label, [
        ...repeatedColumns.value.map((column) => column.key),
        ...(props.layout?.header_fields ?? []).map((field) => field.key),
        ...nodesOfType(document, 'column').map((node) =>
            String(node.attrs?.key ?? ''),
        ),
    ]);
    const scope = newDataScope.value;

    setRowRole(scope);
    insertNode({
        type: 'column',
        attrs: {
            key,
            label,
            kind:
                scope === 'unit' || newDataType.value === 'text'
                    ? 'texto_largo'
                    : 'numero',
            role:
                scope === 'record' && newDataRole.value !== 'none'
                    ? newDataRole.value
                    : null,
            sum: false,
        },
    });
    newDataOpen.value = false;
};

const openNewField = (): void => {
    newFieldLabel.value = '';
    newFieldType.value = 'texto_largo';
    newFieldOptions.value = 'Sí, No';
    newFieldError.value = '';
    newFieldOpen.value = true;
};

const parsedOptions = (): string[] => [
    ...new Set(
        newFieldOptions.value
            .split(',')
            .map((option) => option.trim())
            .filter(Boolean),
    ),
];

const keyFor = (label: string): string => {
    const base = label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);
    const used = new Set([
        ...props.fields.map((field) => field.key),
        ...nodesOfType(
            (editor.value?.getJSON() as DocumentNode | undefined) ??
                props.document,
            'field',
        ).map((node) => String(node.attrs?.key ?? '')),
    ]);
    const unique = globalThis.crypto
        .randomUUID()
        .replaceAll('-', '')
        .slice(0, 8);
    const root = `campo_${base || 'respuesta'}_${unique}`;
    let candidate = root;
    let suffix = 2;

    while (used.has(candidate)) {
        candidate = `${root}_${suffix++}`;
    }

    return candidate;
};

const createField = (): void => {
    const label = newFieldLabel.value.trim();
    const options =
        newFieldType.value === 'seleccion_unica' ? parsedOptions() : [];

    if (!label) {
        newFieldError.value = 'Escriba el nombre que verá el docente.';

        return;
    }

    if (label.length > 180) {
        newFieldError.value = 'Use un nombre de hasta 180 caracteres.';

        return;
    }

    if (newFieldType.value === 'seleccion_unica' && options.length < 2) {
        newFieldError.value =
            'Escriba al menos dos opciones separadas por comas.';

        return;
    }

    insertField({
        key: keyFor(label),
        label,
        type: newFieldType.value,
        options: options.map((option) => ({ value: option, label: option })),
        inherited: false,
        teacher_editable: true,
        required: true,
    });
    newFieldOpen.value = false;
};

const getDocument = (): DocumentNode | null =>
    (editor.value?.getJSON() as DocumentNode | undefined) ?? null;

defineExpose({ getDocument });
</script>

<template>
    <div
        class="template-table-editor flex min-w-0 flex-col gap-3 rounded-lg ring-1 ring-ring"
        :style="editorStyle"
        data-page-unit
        data-page-flow-through
    >
        <Teleport :to="toolbarTarget ?? 'body'" :disabled="!toolbarTarget">
            <div
                class="flex min-w-max items-center gap-2 text-foreground"
                role="toolbar"
                aria-label="Formato de celdas"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            :disabled="!inCell || pending"
                            aria-label="Insertar contenido en la celda"
                        >
                            <Plus data-icon="inline-start" aria-hidden="true" />
                            Insertar
                            <ChevronDown
                                data-icon="inline-end"
                                aria-hidden="true"
                            />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" class="w-64">
                        <DropdownMenuGroup>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Braces />
                                    Dato automático
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    class="max-h-80 w-72 overflow-y-auto"
                                >
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            v-for="variable in variables"
                                            :key="variable.key"
                                            @select="insertVariable(variable)"
                                        >
                                            <span class="min-w-0">
                                                <span
                                                    class="block truncate font-medium"
                                                >
                                                    {{ variable.label }}
                                                </span>
                                                <span
                                                    class="block truncate text-xs text-muted-foreground"
                                                >
                                                    @{{ variable.key }}
                                                </span>
                                            </span>
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <UserRoundPlus />
                                    Campo del docente
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    class="max-h-80 w-72 overflow-y-auto"
                                >
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            v-for="field in teacherFields"
                                            :key="field.key"
                                            @select="insertField(field)"
                                        >
                                            {{ field.label }}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            v-if="teacherFields.length === 0"
                                            disabled
                                        >
                                            Aún no hay campos
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem @select="openNewField">
                                        <Plus />
                                        Nuevo campo…
                                    </DropdownMenuItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <BadgeCheck />
                                    Marca condicional
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    class="max-h-80 w-80 overflow-y-auto"
                                >
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            v-for="item in conditionalChoices"
                                            :key="`${item.field.key}-${item.option.value}`"
                                            @select="
                                                insertField(
                                                    item.field,
                                                    item.option.value,
                                                )
                                            "
                                        >
                                            X si {{ item.field.label }} =
                                            {{ item.option.label }}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            v-if="
                                                conditionalChoices.length === 0
                                            "
                                            disabled
                                        >
                                            Cree primero un campo de selección
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuSeparator v-if="repeatField" />
                            <DropdownMenuSub v-if="repeatField">
                                <DropdownMenuSubTrigger>
                                    <Database />
                                    Dato repetible
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    class="max-h-80 w-72 overflow-y-auto"
                                >
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            v-for="column in repeatedColumns"
                                            :key="column.key"
                                            :disabled="
                                                !['record', 'total'].includes(
                                                    selectedRowRole,
                                                )
                                            "
                                            @select="
                                                insertRepeatedColumn(column)
                                            "
                                        >
                                            <span class="min-w-0">
                                                <span
                                                    class="block truncate font-medium"
                                                >
                                                    {{ column.label }}
                                                </span>
                                                <span
                                                    class="block truncate text-xs text-muted-foreground"
                                                >
                                                    ${{ column.key }}
                                                </span>
                                            </span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            v-if="repeatedColumns.length === 0"
                                            disabled
                                        >
                                            Aún no hay datos de fila
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            :disabled="
                                                !['record', 'unit'].includes(
                                                    selectedRowRole,
                                                )
                                            "
                                            @select="openNewData"
                                        >
                                            <Plus />
                                            {{
                                                selectedRowRole === 'unit'
                                                    ? 'Nuevo dato de unidad…'
                                                    : 'Nuevo dato de fila…'
                                            }}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            v-if="selectedRowRole === 'fixed'"
                                            disabled
                                        >
                                            Primero defina el tipo de fila
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu v-if="repeatField">
                    <DropdownMenuTrigger as-child>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            :disabled="!inCell || pending"
                            :aria-label="`Datos: ${rowRoleLabel}`"
                        >
                            <Database
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            Datos
                            <ChevronDown
                                data-icon="inline-end"
                                aria-hidden="true"
                            />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" class="w-72">
                        <DropdownMenuCheckboxItem
                            :checked="groupedByUnit"
                            @select.prevent="setGroupedByUnit(!groupedByUnit)"
                        >
                            Organizar por unidades
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Tipo de fila</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                            :model-value="selectedRowRole"
                            @update:model-value="setRowRole"
                        >
                            <DropdownMenuRadioItem
                                value="fixed"
                                :disabled="
                                    selectedRowRole !== 'fixed' &&
                                    selectedRowHasColumns
                                "
                            >
                                Fila normal
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="record">
                                Fila que completa el docente
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="unit">
                                Datos de la unidad
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="total">
                                Fila de totales
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Separator orientation="vertical" class="h-7" />

                <TemplateToolbarSelect
                    v-model="background"
                    label="Fondo de celda"
                    :tooltip="backgroundTooltip"
                    :disabled="!inCell || pending"
                >
                    <template #icon>
                        <PaintBucket aria-hidden="true" />
                    </template>
                    <SelectItem value="inherit">Sin fondo</SelectItem>
                    <SelectItem
                        v-for="option in colors"
                        :key="`background-${option.value}`"
                        :value="option.value"
                    >
                        <span
                            class="size-3 rounded-sm border"
                            :style="{ backgroundColor: option.value }"
                            aria-hidden="true"
                        />
                        {{ option.label }}
                    </SelectItem>
                </TemplateToolbarSelect>

                <TemplateToolbarSelect
                    v-model="color"
                    label="Color de texto"
                    :tooltip="textColorTooltip"
                    :disabled="!inCell || pending"
                >
                    <template #icon>
                        <Baseline aria-hidden="true" />
                    </template>
                    <SelectItem value="inherit">Color heredado</SelectItem>
                    <SelectItem
                        v-for="option in colors"
                        :key="`text-${option.value}`"
                        :value="option.value"
                    >
                        <span
                            class="size-3 rounded-sm border"
                            :style="{ backgroundColor: option.value }"
                            aria-hidden="true"
                        />
                        {{ option.label }}
                    </SelectItem>
                </TemplateToolbarSelect>

                <TemplateToolbarSelect
                    v-model="alignment"
                    label="Alineación de celda"
                    :tooltip="alignmentTooltip"
                    :disabled="!inCell || pending"
                >
                    <template #icon>
                        <AlignLeft aria-hidden="true" />
                    </template>
                    <SelectItem value="inherit">Alineación heredada</SelectItem>
                    <SelectItem value="left">
                        <AlignLeft /> Izquierda
                    </SelectItem>
                    <SelectItem value="center">
                        <AlignCenter /> Centro
                    </SelectItem>
                    <SelectItem value="right">
                        <AlignRight /> Derecha
                    </SelectItem>
                    <SelectItem value="justify">
                        <AlignJustify /> Justificado
                    </SelectItem>
                </TemplateToolbarSelect>

                <TemplateToolbarSelect
                    v-model="border"
                    label="Borde de celda"
                    :tooltip="borderTooltip"
                    :disabled="!inCell || pending"
                >
                    <template #icon>
                        <SquareDashed aria-hidden="true" />
                    </template>
                    <SelectItem value="inherit">Borde original</SelectItem>
                    <SelectItem value="thin">Fino</SelectItem>
                    <SelectItem value="thick">Grueso</SelectItem>
                    <SelectItem value="none">Sin borde</SelectItem>
                </TemplateToolbarSelect>

                <Separator orientation="vertical" class="h-7" />

                <TemplateToolbarButton
                    label="Negrita en las celdas seleccionadas"
                    tooltip="Negrita"
                    :variant="
                        selectedCell.bold === true ? 'secondary' : 'ghost'
                    "
                    :disabled="!inCell || pending"
                    :pressed="selectedCell.bold === true"
                    @click="
                        setCell(
                            'bold',
                            selectedCell.bold === true ? false : true,
                        )
                    "
                >
                    <Bold aria-hidden="true" />
                </TemplateToolbarButton>
                <TemplateToolbarButton
                    label="Cursiva en las celdas seleccionadas"
                    tooltip="Cursiva"
                    :variant="
                        selectedCell.italic === true ? 'secondary' : 'ghost'
                    "
                    :disabled="!inCell || pending"
                    :pressed="selectedCell.italic === true"
                    @click="
                        setCell(
                            'italic',
                            selectedCell.italic === true ? false : true,
                        )
                    "
                >
                    <Italic aria-hidden="true" />
                </TemplateToolbarButton>

                <Separator orientation="vertical" class="h-7" />

                <TemplateToolbarButton
                    label="Combinar celdas"
                    :disabled="!can('mergeCells') || pending"
                    @click="state?.chain().focus().mergeCells().run()"
                >
                    <UnfoldHorizontal aria-hidden="true" />
                </TemplateToolbarButton>
                <TemplateToolbarButton
                    label="Separar celda"
                    :disabled="!can('splitCell') || pending"
                    @click="state?.chain().focus().splitCell().run()"
                >
                    <SplitSquareHorizontal aria-hidden="true" />
                </TemplateToolbarButton>

                <Tooltip v-model:open="tableMenuHelpOpen">
                    <TooltipTrigger as-child>
                        <span class="inline-flex">
                            <DropdownMenu>
                                <DropdownMenuTrigger as-child>
                                    <Button
                                        type="button"
                                        size="icon-sm"
                                        variant="ghost"
                                        :disabled="!inCell || pending"
                                        aria-label="Filas y columnas"
                                        @focus="tableMenuHelpOpen = true"
                                        @blur="tableMenuHelpOpen = false"
                                    >
                                        <Rows3 aria-hidden="true" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            :disabled="!can('addRowBefore')"
                                            @select="
                                                state
                                                    ?.chain()
                                                    .focus()
                                                    .addRowBefore()
                                                    .run()
                                            "
                                        >
                                            <Rows3 /> Fila arriba
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            :disabled="!can('addRowAfter')"
                                            @select="
                                                state
                                                    ?.chain()
                                                    .focus()
                                                    .addRowAfter()
                                                    .run()
                                            "
                                        >
                                            <Rows3 /> Fila abajo
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            :disabled="!can('addColumnBefore')"
                                            @select="
                                                state
                                                    ?.chain()
                                                    .focus()
                                                    .addColumnBefore()
                                                    .run()
                                            "
                                        >
                                            <Columns3 /> Columna izquierda
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            :disabled="!can('addColumnAfter')"
                                            @select="
                                                state
                                                    ?.chain()
                                                    .focus()
                                                    .addColumnAfter()
                                                    .run()
                                            "
                                        >
                                            <Columns3 /> Columna derecha
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            variant="destructive"
                                            :disabled="!can('deleteRow')"
                                            @select="deleteSelectedRow"
                                        >
                                            Eliminar fila
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            variant="destructive"
                                            :disabled="!can('deleteColumn')"
                                            @select="
                                                state
                                                    ?.chain()
                                                    .focus()
                                                    .deleteColumn()
                                                    .run()
                                            "
                                        >
                                            Eliminar columna
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Filas y columnas</TooltipContent>
                </Tooltip>

                <TemplateToolbarButton
                    label="Quitar estilo de celda"
                    :disabled="!inCell || pending"
                    @click="resetCell"
                >
                    <Eraser aria-hidden="true" />
                </TemplateToolbarButton>

                <div class="ms-auto flex gap-1">
                    <TemplateToolbarButton
                        label="Deshacer"
                        :disabled="!state?.can().undo() || pending"
                        @click="state?.chain().focus().undo().run()"
                    >
                        <Undo2 aria-hidden="true" />
                    </TemplateToolbarButton>
                    <TemplateToolbarButton
                        label="Rehacer"
                        :disabled="!state?.can().redo() || pending"
                        @click="state?.chain().focus().redo().run()"
                    >
                        <Redo2 aria-hidden="true" />
                    </TemplateToolbarButton>
                </div>
            </div>
        </Teleport>

        <p v-if="!inCell" class="px-3 text-sm text-muted-foreground">
            Seleccione una celda. Use Mayús + clic para ampliar la selección.
        </p>

        <EditorContent
            :editor="editor"
            class="template-table-canvas min-w-0 overflow-x-auto"
        />
    </div>

    <FormSheet
        :open="newDataOpen"
        trigger-label="Nuevo dato repetible"
        :title="
            newDataScope === 'unit'
                ? 'Nuevo dato de unidad'
                : 'Nuevo dato de fila'
        "
        description="Se insertará en la celda seleccionada y lo completará el docente."
        :show-trigger="false"
        @update:open="updateNewDataOpen"
    >
        <template #default="{ close }">
            <form
                class="flex flex-col gap-4"
                @submit.prevent="createRepeatedData"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(newDataError)">
                        <FieldLabel for="table-data-label" required>
                            Nombre visible
                        </FieldLabel>
                        <Input
                            id="table-data-label"
                            v-model="newDataLabel"
                            maxlength="180"
                            placeholder="Ej. Contenidos temáticos"
                            :aria-invalid="Boolean(newDataError)"
                        />
                        <FieldError
                            v-if="newDataError"
                            :errors="[newDataError]"
                        />
                    </Field>

                    <Field v-if="newDataScope === 'record'">
                        <FieldLabel for="table-data-type" required>
                            Tipo de dato
                        </FieldLabel>
                        <Select
                            :model-value="newDataType"
                            @update:model-value="setNewDataType"
                        >
                            <SelectTrigger id="table-data-type" class="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="text">Texto</SelectItem>
                                    <SelectItem value="number">
                                        Número
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>

                    <Field
                        v-if="
                            newDataScope === 'record' &&
                            newDataType === 'number'
                        "
                    >
                        <FieldLabel for="table-data-role">
                            Función especial
                        </FieldLabel>
                        <Select
                            :model-value="newDataRole"
                            @update:model-value="setNewDataRole"
                        >
                            <SelectTrigger id="table-data-role" class="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="none">
                                        Ninguna
                                    </SelectItem>
                                    <SelectItem
                                        value="week"
                                        :disabled="usedColumnRoles.has('week')"
                                    >
                                        Semana de planificación
                                    </SelectItem>
                                    <SelectItem
                                        value="hours_acd"
                                        :disabled="
                                            usedColumnRoles.has('hours_acd')
                                        "
                                    >
                                        Horas ACD
                                    </SelectItem>
                                    <SelectItem
                                        value="hours_ape"
                                        :disabled="
                                            usedColumnRoles.has('hours_ape')
                                        "
                                    >
                                        Horas APE
                                    </SelectItem>
                                    <SelectItem
                                        value="hours_aa"
                                        :disabled="
                                            usedColumnRoles.has('hours_aa')
                                        "
                                    >
                                        Horas AA
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            Úsela solo en la tabla de planificación.
                        </FieldDescription>
                    </Field>
                </FieldGroup>

                <FormSheetActions
                    label="Insertar dato"
                    :close="close"
                    :icon="Database"
                />
            </form>
        </template>
    </FormSheet>

    <Dialog v-model:open="newFieldOpen">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Nuevo campo del docente</DialogTitle>
                <DialogDescription>
                    Se insertará en la celda seleccionada y aparecerá en el
                    formulario del sílabo.
                </DialogDescription>
            </DialogHeader>

            <FieldGroup>
                <Field>
                    <FieldLabel for="table-field-label"
                        >Nombre visible</FieldLabel
                    >
                    <Input
                        id="table-field-label"
                        v-model="newFieldLabel"
                        maxlength="180"
                        placeholder="Ej. Tipo de discapacidad"
                    />
                </Field>
                <Field>
                    <FieldLabel for="table-field-type">
                        Tipo de respuesta
                    </FieldLabel>
                    <Select v-model="newFieldType">
                        <SelectTrigger id="table-field-type" class="w-full">
                            <SelectValue placeholder="Seleccione un tipo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="texto_corto"
                                >Texto corto</SelectItem
                            >
                            <SelectItem value="texto_largo"
                                >Texto largo</SelectItem
                            >
                            <SelectItem value="numero">Número</SelectItem>
                            <SelectItem value="fecha">Fecha</SelectItem>
                            <SelectItem value="seleccion_unica"
                                >Selección única</SelectItem
                            >
                        </SelectContent>
                    </Select>
                </Field>
                <Field v-if="newFieldType === 'seleccion_unica'">
                    <FieldLabel for="table-field-options">Opciones</FieldLabel>
                    <Input
                        id="table-field-options"
                        v-model="newFieldOptions"
                        placeholder="Sí, No"
                    />
                    <FieldDescription>
                        Separe cada opción con una coma.
                    </FieldDescription>
                </Field>
                <p v-if="newFieldError" class="text-sm text-destructive">
                    {{ newFieldError }}
                </p>
            </FieldGroup>

            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    @click="newFieldOpen = false"
                >
                    Cancelar
                </Button>
                <Button type="button" @click="createField">
                    <UserRoundPlus
                        data-icon="inline-start"
                        aria-hidden="true"
                    />
                    Insertar campo
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<style>
.template-table-editor .tiptap {
    min-width: 580px;
    width: 100%;
    outline: none;
}
.template-table-editor .tableWrapper {
    width: 100%;
}
.template-table-editor .template-table-canvas {
    /* El documento se edita sobre papel, independientemente del tema de la interfaz. */
    background: #fff;
}
.template-table-editor table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100% !important;
}
.template-table-editor td,
.template-table-editor th {
    border: 1px solid #7f7f7f;
    min-width: 20px;
    padding: 2px 4px;
    position: relative;
    vertical-align: top;
    overflow-wrap: anywhere;
}
.template-table-editor td p,
.template-table-editor th p {
    margin: 0;
    min-height: 1em;
}
.template-table-editor td:not([data-cell-text-align]) p,
.template-table-editor th:not([data-cell-text-align]) p {
    text-align: var(--table-body-alignment) !important;
}
.template-table-editor [data-cell-text-color] * {
    color: inherit !important;
}
.template-table-editor [data-cell-text-align] p {
    text-align: inherit !important;
}
.template-table-editor [data-cell-bold='true'] * {
    font-weight: 700 !important;
}
.template-table-editor [data-cell-bold='false'] * {
    font-weight: 400 !important;
}
.template-table-editor [data-cell-italic='true'] * {
    font-style: italic !important;
}
.template-table-editor [data-cell-italic='false'] * {
    font-style: normal !important;
}
.template-table-editor .selectedCell::after {
    background: rgb(0 112 192 / 20%);
    content: '';
    inset: 0;
    pointer-events: none;
    position: absolute;
}
.template-table-editor .column-resize-handle {
    background: #0070c0;
    bottom: 0;
    pointer-events: none;
    position: absolute;
    right: -2px;
    top: 0;
    width: 4px;
}
.template-table-editor .template-table-field {
    background: #edf6ff;
    border-radius: 2px;
    color: #111827 !important;
    outline: 1px dashed #4f81bd;
    padding: 1px 3px;
}
.template-table-editor .template-table-variable {
    background: #edf8ee;
    border-radius: 2px;
    color: #111827 !important;
    padding: 1px 3px;
}
.template-table-editor .tiptap .template-table-field,
.template-table-editor .tiptap .template-table-variable {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
    white-space: nowrap;
}
</style>
