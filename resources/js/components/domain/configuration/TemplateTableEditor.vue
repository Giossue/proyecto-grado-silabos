<script setup lang="ts">
import {
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Baseline,
    Bold,
    Columns3,
    Eraser,
    Italic,
    PaintBucket,
    Redo2,
    Rows3,
    SplitSquareHorizontal,
    SquareDashed,
    Undo2,
    UnfoldHorizontal,
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
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DocumentNode } from '@/lib/templateDocument';

type CellAlignment = 'left' | 'center' | 'right' | 'justify';
type CellBorder = 'thin' | 'thick' | 'none';
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
                      listStyle: { default: null },
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
                        ? `${node.attrs.label} (${node.attrs.choice})`
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
                return { ...this.parent?.(), repeatKey: { default: null } };
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
                                            @select="
                                                state
                                                    ?.chain()
                                                    .focus()
                                                    .deleteRow()
                                                    .run()
                                            "
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
            class="template-table-canvas min-w-0 overflow-x-auto p-2"
        />
    </div>
</template>

<style>
.template-table-editor .tiptap {
    min-width: 580px;
    outline: none;
}
.template-table-editor .template-table-canvas {
    /* El documento se edita sobre papel, independientemente del tema de la interfaz. */
    background: #fff;
}
.template-table-editor table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
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
