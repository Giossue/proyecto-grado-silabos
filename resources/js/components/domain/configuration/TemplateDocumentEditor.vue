<script setup lang="ts">
import {
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Undo2,
    Redo2,
} from '@lucide/vue';
import { Node, mergeAttributes } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import {
    Table,
    TableCell,
    TableHeader,
    TableRow,
} from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import {
    TextStyle,
    FontFamily,
    FontSize,
    Color,
} from '@tiptap/extension-text-style';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionProps } from '@tiptap/suggestion';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import {
    computed,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
} from 'vue';
import { Button } from '@/components/ui/button';
import {
    Field,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DOCUMENT_FONTS,
    cellNode,
    fieldNode,
    nodesOfType,
    textNode,
} from '@/lib/templateDocument';
import type { DocumentNode, TemplateVariable } from '@/lib/templateDocument';

const props = defineProps<{
    document: DocumentNode;
    variables: TemplateVariable[];
    pending: boolean;
    fieldKeys?: string[];
}>();
const emit = defineEmits<{
    save: [document: DocumentNode];
    dirty: [value: boolean];
}>();
const suggestions = shallowRef<SuggestionProps<TemplateVariable> | null>(null);
const selectedSuggestion = ref(0);
const fieldLabel = ref('');
const fieldType = ref('texto_largo');
const tool = ref('format');
const rows = ref(3);
const columns = ref(3);
const initial = JSON.stringify(props.document);
const persistedKeys = new Set([
    ...(props.fieldKeys ??
        nodesOfType(props.document, 'field').map((node) =>
            String(node.attrs?.key),
        )),
    ...nodesOfType(props.document, 'column').map((node) =>
        String(node.attrs?.key),
    ),
]);
const dirty = ref(false);
const toolbarVersion = ref(0);

const token = (name: 'field' | 'column') =>
    Node.create({
        name,
        group: 'inline',
        inline: true,
        atom: true,
        addAttributes: () => ({
            key: { default: null },
            label: { default: '' },
            kind: { default: 'texto_largo' },
            choice: { default: null },
            listStyle: { default: null },
        }),
        parseHTML: () => [{ tag: `span[data-template-${name}]` }],
        renderHTML: ({ node, HTMLAttributes }) => [
            'span',
            mergeAttributes(HTMLAttributes, {
                [`data-template-${name}`]: node.attrs.key,
                class: 'template-input-token',
                contenteditable: 'false',
            }),
            [
                'span',
                { class: 'template-input-token-generic' },
                '▧ Respuesta del docente',
            ],
            [
                'span',
                { class: 'template-input-token-label' },
                `▧ ${node.attrs.label}${node.attrs.choice ? ` (${node.attrs.choice})` : ''}`,
            ],
        ],
    });
const cellAttributes = () => ({
    backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-background-color'),
        renderHTML: (attributes: Record<string, unknown>) =>
            attributes.backgroundColor
                ? {
                      'data-background-color': attributes.backgroundColor,
                      style: `background-color: ${attributes.backgroundColor}`,
                  }
                : {},
    },
});
const editor = useEditor({
    content: props.document,
    editorProps: {
        attributes: {
            'aria-label': 'Diseño del contenido de la plantilla',
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
        TableCell.extend({
            addAttributes() {
                return { ...this.parent?.(), ...cellAttributes() };
            },
        }),
        TableHeader.extend({
            addAttributes() {
                return { ...this.parent?.(), ...cellAttributes() };
            },
        }),
        token('field'),
        token('column'),
        Mention.extend({ name: 'variable' }).configure({
            renderHTML: ({ node, options }) => [
                'span',
                mergeAttributes(options.HTMLAttributes, {
                    class: 'template-variable-token',
                    'data-variable': node.attrs.id,
                }),
                `@${node.attrs.id}`,
            ],
            suggestion: {
                char: '@',
                items: ({ query }) =>
                    [
                        {
                            key: 'docente',
                            label: 'Campo que completará el docente',
                            sample: '',
                        },
                        ...props.variables,
                    ]
                        .filter(
                            (item) =>
                                item.key !== 'docente' ||
                                !repeatTable.value ||
                                rowRole.value !== 'total',
                        )
                        .filter((item) =>
                            `${item.key} ${item.label}`
                                .normalize('NFD')
                                .replace(/[\u0300-\u036f]/g, '')
                                .toLowerCase()
                                .includes(
                                    query
                                        .normalize('NFD')
                                        .replace(/[\u0300-\u036f]/g, '')
                                        .toLowerCase(),
                                ),
                        )
                        .slice(0, 8),
                command: ({ editor: target, range, props: item }) => {
                    if (item.id === 'docente') {
                        target
                            .chain()
                            .focus()
                            .insertContentAt(
                                range,
                                teacherNode(
                                    'Respuesta del docente',
                                    'texto_largo',
                                ),
                            )
                            .setNodeSelection(range.from)
                            .run();
                        tool.value = 'fields';

                        return;
                    }

                    target
                        .chain()
                        .focus()
                        .insertContentAt(range, [
                            {
                                type: 'variable',
                                attrs: { id: item.id, label: item.id },
                            },
                            { type: 'text', text: ' ' },
                        ])
                        .run();
                },
                render: () => ({
                    onStart: (value) => {
                        suggestions.value = value;
                        selectedSuggestion.value = 0;
                    },
                    onUpdate: (value) => {
                        suggestions.value = value;
                        selectedSuggestion.value = 0;
                    },
                    onExit: () => {
                        suggestions.value = null;
                    },
                    onKeyDown: ({ event }) => {
                        const list = suggestions.value?.items ?? [];

                        if (event.key === 'Escape') {
                            suggestions.value = null;

                            return true;
                        }

                        if (
                            event.key === 'ArrowDown' ||
                            event.key === 'ArrowUp'
                        ) {
                            selectedSuggestion.value =
                                (selectedSuggestion.value +
                                    (event.key === 'ArrowDown' ? 1 : -1) +
                                    list.length) %
                                Math.max(1, list.length);

                            return true;
                        }

                        if (event.key === 'Enter' && list.length) {
                            chooseVariable(list[selectedSuggestion.value]);

                            return true;
                        }

                        return false;
                    },
                }),
            },
        }),
    ],
    onUpdate: ({ editor: current }) => {
        dirty.value = JSON.stringify(current.getJSON()) !== initial;
    },
    onTransaction: () => {
        toolbarVersion.value++;
    },
    onSelectionUpdate: ({ editor: current }) => {
        if (
            current.state.selection instanceof NodeSelection &&
            ['field', 'column'].includes(current.state.selection.node.type.name)
        ) {
            tool.value = 'fields';
        }
    },
});
const chooseVariable = (item: TemplateVariable) =>
    suggestions.value?.command({ id: item.key, label: item.key });
const state = computed(() => {
    void toolbarVersion.value;

    return editor.value;
});
const repeatTable = computed(() => {
    void toolbarVersion.value;

    return editor.value?.getAttributes('table').repeatKey as
        string | null | undefined;
});
const rowRole = computed(() => {
    void toolbarVersion.value;

    return String(editor.value?.getAttributes('tableRow').rowRole ?? 'fixed');
});
const selectedField = computed(() => {
    void toolbarVersion.value;
    const selection = editor.value?.state.selection;

    return selection instanceof NodeSelection &&
        ['field', 'column'].includes(selection.node.type.name)
        ? selection.node
        : null;
});
const selectedPersistedField = computed(() =>
    selectedField.value
        ? persistedKeys.has(String(selectedField.value.attrs.key))
        : false,
);
watch(selectedField, (node) => {
    if (node) {
        fieldLabel.value = String(node.attrs.label);
        fieldType.value =
            node.attrs.listStyle === 'bullet'
                ? 'bulleted_list'
                : node.attrs.listStyle === 'number'
                  ? 'numbered_list'
                  : ['markdown', 'repetible', 'texto_corto'].includes(
                          node.attrs.kind,
                      )
                    ? 'texto_largo'
                    : String(node.attrs.kind);
    } else {
        fieldLabel.value = '';
        fieldType.value = 'texto_largo';
    }
});
const fieldDraftDirty = computed(
    () =>
        selectedField.value !== null &&
        ((!selectedPersistedField.value &&
            fieldLabel.value !== selectedField.value.attrs.label) ||
            fieldType.value !==
                (selectedField.value.attrs.listStyle === 'bullet'
                    ? 'bulleted_list'
                    : selectedField.value.attrs.listStyle === 'number'
                      ? 'numbered_list'
                      : ['markdown', 'repetible', 'texto_corto'].includes(
                              selectedField.value.attrs.kind,
                          )
                        ? 'texto_largo'
                        : selectedField.value.attrs.kind)),
);
watch([dirty, fieldDraftDirty], ([documentChanged, fieldChanged]) =>
    emit('dirty', documentChanged || fieldChanged),
);
const fieldTypes = computed(() => {
    const all = [
        { value: 'texto_largo', label: 'Texto' },
        { value: 'bulleted_list', label: 'Lista con viñetas' },
        { value: 'numbered_list', label: 'Lista numerada' },
        { value: 'numero', label: 'Número' },
        { value: 'fecha', label: 'Fecha' },
    ];
    const node = selectedField.value;

    if (!node || !persistedKeys.has(String(node.attrs.key))) {
        return selectedField.value?.type.name === 'column'
            ? all.filter((item) => item.value !== 'fecha')
            : all;
    }

    if (
        ['texto_corto', 'texto_largo', 'markdown', 'repetible'].includes(
            node.attrs.kind,
        )
    ) {
        return all.slice(0, 3);
    }

    return [
        {
            value: String(node.attrs.kind),
            label:
                node.attrs.kind === 'numero'
                    ? 'Número'
                    : node.attrs.kind === 'fecha'
                      ? 'Fecha'
                      : 'Dato del sistema',
        },
    ];
});
const makeField = (label: string, format = 'texto_largo') => {
    const node = fieldNode({
        key: `campo_${crypto.randomUUID().replaceAll('-', '')}`,
        label,
        type: ['bulleted_list', 'numbered_list'].includes(format)
            ? 'texto_largo'
            : format,
    });
    node.attrs!.listStyle =
        format === 'bulleted_list'
            ? 'bullet'
            : format === 'numbered_list'
              ? 'number'
              : null;

    return node;
};
const teacherNode = (label: string, format: string) => {
    const node = makeField(label, format);

    if (repeatTable.value && ['record', 'unit'].includes(rowRole.value)) {
        node.type = 'column';

        if (
            rowRole.value === 'unit' ||
            !['numero', 'texto_largo'].includes(String(node.attrs!.kind))
        ) {
            node.attrs!.kind = 'texto_largo';
        }
    }

    return node;
};
const updateField = () => {
    const node = selectedField.value;

    if (!node || !editor.value || !fieldLabel.value.trim() || props.pending) {
        return;
    }

    const attrs = makeField(fieldLabel.value.trim(), fieldType.value).attrs!;
    const transaction = editor.value.state.tr;
    editor.value.state.doc.descendants((child, position) => {
        if (
            child.type.name === node.type.name &&
            child.attrs.key === node.attrs.key
        ) {
            transaction.setNodeMarkup(position, undefined, {
                ...child.attrs,
                label: persistedKeys.has(String(node.attrs.key))
                    ? child.attrs.label
                    : attrs.label,
                listStyle: attrs.listStyle,
                kind: persistedKeys.has(String(node.attrs.key))
                    ? child.attrs.kind
                    : attrs.kind,
            });
        }
    });
    transaction.setSelection(
        NodeSelection.create(
            transaction.doc,
            editor.value.state.selection.from,
        ),
    );
    editor.value.view.dispatch(transaction);
};
const addField = () => {
    if (
        !editor.value ||
        !fieldLabel.value.trim() ||
        props.pending ||
        (repeatTable.value && rowRole.value === 'total')
    ) {
        return;
    }

    const node = teacherNode(fieldLabel.value.trim(), fieldType.value);

    editor.value.chain().focus().insertContent(node).run();
    fieldLabel.value = '';
};
const initialOnlyField = (document: DocumentNode): DocumentNode | null => {
    const content = (document.content ?? []).filter(
        (node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0,
    );
    const paragraphContent = content[0]?.content ?? [];

    return content.length === 1 &&
        content[0]?.type === 'paragraph' &&
        paragraphContent.length === 1 &&
        paragraphContent[0]?.type === 'field'
        ? paragraphContent[0]
        : null;
};
const insertTable = () => {
    const rowCount = Math.max(1, Math.min(20, Number(rows.value) || 3));
    const columnCount = Math.max(1, Math.min(12, Number(columns.value) || 3));
    const current = editor.value?.getJSON() as DocumentNode | undefined;
    const initialField = current ? initialOnlyField(current) : null;
    const firstResponseRow = rowCount > 1 ? 1 : 0;
    const table: DocumentNode = {
        type: 'table',
        attrs: { repeatKey: null },
        content: Array.from({ length: rowCount }, (_, r) => ({
            type: 'tableRow',
            attrs: { rowRole: 'fixed' },
            content: Array.from({ length: columnCount }, (_, c) => {
                const isInitialResponse =
                    initialField && r === firstResponseRow && c === 0;

                return cellNode(
                    isInitialResponse
                        ? [initialField]
                        : r === 0 && firstResponseRow !== 0
                          ? [textNode(`Columna ${c + 1}`)]
                          : [],
                    1,
                    1,
                    r === 0 && firstResponseRow !== 0 ? '#DBE5F1' : null,
                );
            }),
        })),
    };

    if (initialField) {
        editor.value?.commands.setContent({ type: 'doc', content: [table] });

        return;
    }

    editor.value?.chain().focus().insertContent(table).run();
};
const save = () => {
    if (selectedField.value && !fieldLabel.value.trim()) {
        tool.value = 'fields';

        return;
    }

    if (editor.value) {
        updateField();
        emit('save', editor.value.getJSON() as DocumentNode);
    }
};
const unsaved = (event: BeforeUnloadEvent) => {
    if ((dirty.value || fieldDraftDirty.value) && !props.pending) {
        event.preventDefault();
    }
};
onMounted(() => window.addEventListener('beforeunload', unsaved));
onBeforeUnmount(() => window.removeEventListener('beforeunload', unsaved));
watch(
    () => props.pending,
    (value) => editor.value?.setEditable(!value),
);
const fieldCount = computed(() => {
    void toolbarVersion.value;

    return editor.value
        ? nodesOfType(editor.value.getJSON() as DocumentNode, 'field').length
        : 0;
});
defineExpose({ save, editor });
</script>

<template>
    <div class="flex min-h-0 flex-1 flex-col gap-3 max-sm:overflow-y-auto">
        <Tabs
            v-if="state"
            v-model="tool"
            class="shrink-0 rounded-lg border bg-muted/30 p-3"
            :data-pending="pending"
        >
            <TabsList aria-label="Herramientas del editor">
                <TabsTrigger value="format">Formato</TabsTrigger>
                <TabsTrigger value="tables">Tablas</TabsTrigger>
                <TabsTrigger value="fields">Campos</TabsTrigger>
            </TabsList>
            <TabsContent
                value="format"
                class="flex flex-wrap items-center gap-1"
                role="group"
                aria-label="Formato del texto"
            >
                <Select
                    :model-value="
                        state.getAttributes('textStyle').fontFamily ?? 'Arial'
                    "
                    :disabled="pending"
                    @update:model-value="
                        state
                            .chain()
                            .focus()
                            .setFontFamily(String($event))
                            .run()
                    "
                >
                    <SelectTrigger class="w-40" aria-label="Tipo de fuente"
                        ><SelectValue
                    /></SelectTrigger>
                    <SelectContent
                        ><SelectGroup
                            ><SelectItem
                                v-for="font in DOCUMENT_FONTS"
                                :key="font"
                                :value="font"
                                >{{ font }}</SelectItem
                            ></SelectGroup
                        ></SelectContent
                    >
                </Select>
                <Select
                    :model-value="
                        state.getAttributes('textStyle').fontSize ?? '11pt'
                    "
                    :disabled="pending"
                    @update:model-value="
                        state.chain().focus().setFontSize(String($event)).run()
                    "
                >
                    <SelectTrigger class="w-24" aria-label="Tamaño de fuente"
                        ><SelectValue
                    /></SelectTrigger>
                    <SelectContent
                        ><SelectGroup
                            ><SelectItem
                                v-for="size in [
                                    7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28,
                                    32, 36,
                                ]"
                                :key="size"
                                :value="`${size}pt`"
                                >{{ size }} pt</SelectItem
                            ></SelectGroup
                        ></SelectContent
                    >
                </Select>
                <Input
                    type="color"
                    class="w-12"
                    aria-label="Color de fuente"
                    :model-value="
                        state.getAttributes('textStyle').color ?? '#000000'
                    "
                    :disabled="pending"
                    @update:model-value="
                        state.chain().focus().setColor(String($event)).run()
                    "
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Negrita"
                    :aria-pressed="state.isActive('bold')"
                    :disabled="pending"
                    @mousedown.prevent
                    @click="state.chain().focus().toggleBold().run()"
                    ><Bold
                /></Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Cursiva"
                    :aria-pressed="state.isActive('italic')"
                    :disabled="pending"
                    @mousedown.prevent
                    @click="state.chain().focus().toggleItalic().run()"
                    ><Italic
                /></Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Subrayado"
                    :aria-pressed="state.isActive('underline')"
                    :disabled="pending"
                    @mousedown.prevent
                    @click="state.chain().focus().toggleUnderline().run()"
                    ><Underline
                /></Button>
                <Button
                    v-for="item in [
                        {
                            value: 'left',
                            label: 'Alinear a la izquierda',
                            icon: AlignLeft,
                        },
                        {
                            value: 'center',
                            label: 'Centrar',
                            icon: AlignCenter,
                        },
                        {
                            value: 'right',
                            label: 'Alinear a la derecha',
                            icon: AlignRight,
                        },
                        {
                            value: 'justify',
                            label: 'Justificar',
                            icon: AlignJustify,
                        },
                    ]"
                    :key="item.value"
                    type="button"
                    variant="ghost"
                    size="icon"
                    :aria-label="item.label"
                    :disabled="pending"
                    @mousedown.prevent
                    @click="
                        state.chain().focus().setTextAlign(item.value).run()
                    "
                    ><component :is="item.icon"
                /></Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Deshacer"
                    :disabled="pending || !state.can().undo()"
                    @mousedown.prevent
                    @click="state.chain().focus().undo().run()"
                    ><Undo2
                /></Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Rehacer"
                    :disabled="pending || !state.can().redo()"
                    @mousedown.prevent
                    @click="state.chain().focus().redo().run()"
                    ><Redo2
                /></Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="pending"
                    @mousedown.prevent
                    @click="state.chain().focus().unsetAllMarks().run()"
                    >Quitar formato</Button
                >
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="pending"
                    @mousedown.prevent
                    @click="state.chain().focus().toggleBulletList().run()"
                    >Viñetas</Button
                >
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="pending"
                    @mousedown.prevent
                    @click="state.chain().focus().toggleOrderedList().run()"
                    >Numeración</Button
                >
            </TabsContent>
            <TabsContent
                value="tables"
                class="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Diseño de tablas"
            >
                <Input
                    v-model="rows"
                    type="number"
                    :min="1"
                    :max="20"
                    class="w-16"
                    aria-label="Filas de la nueva tabla"
                />
                <span aria-hidden="true">×</span>
                <Input
                    v-model="columns"
                    type="number"
                    :min="1"
                    :max="12"
                    class="w-16"
                    aria-label="Columnas de la nueva tabla"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    :disabled="pending"
                    @mousedown.prevent
                    @click="insertTable"
                    >Insertar tabla</Button
                >
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    :disabled="pending || !state.can().mergeCells()"
                    @mousedown.prevent
                    @click="state.chain().focus().mergeCells().run()"
                    >Combinar celdas</Button
                >
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    :disabled="pending || !state.can().splitCell()"
                    @mousedown.prevent
                    @click="state.chain().focus().splitCell().run()"
                    >Separar celda</Button
                >
                <template v-if="state.isActive('table')">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        :disabled="pending"
                        @mousedown.prevent
                        @click="state.chain().focus().addRowAfter().run()"
                        >Agregar fila</Button
                    >
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        :disabled="pending"
                        @mousedown.prevent
                        @click="state.chain().focus().addColumnAfter().run()"
                        >Agregar columna</Button
                    >
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        :disabled="pending"
                        @mousedown.prevent
                        @click="state.chain().focus().deleteRow().run()"
                        >Eliminar fila</Button
                    >
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        :disabled="pending"
                        @mousedown.prevent
                        @click="state.chain().focus().deleteColumn().run()"
                        >Eliminar columna</Button
                    >
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        :disabled="pending"
                        @mousedown.prevent
                        @click="state.chain().focus().deleteTable().run()"
                        >Eliminar tabla</Button
                    >
                    <Input
                        type="color"
                        class="w-12"
                        aria-label="Color de celda"
                        :disabled="pending"
                        :model-value="
                            state.getAttributes('tableCell').backgroundColor ??
                            '#FFFFFF'
                        "
                        @update:model-value="
                            state
                                .chain()
                                .focus()
                                .setCellAttribute(
                                    'backgroundColor',
                                    String($event),
                                )
                                .run()
                        "
                    />
                </template>
                <Select
                    v-if="repeatTable"
                    :model-value="rowRole"
                    :disabled="pending"
                    @update:model-value="
                        state
                            .chain()
                            .focus()
                            .updateAttributes('tableRow', {
                                rowRole: String($event),
                            })
                            .run()
                    "
                >
                    <SelectTrigger class="w-44" aria-label="Función de la fila"
                        ><SelectValue
                    /></SelectTrigger>
                    <SelectContent
                        ><SelectGroup
                            ><SelectItem value="fixed">Texto fijo</SelectItem
                            ><SelectItem value="record"
                                >Datos que se repiten</SelectItem
                            ><SelectItem value="unit"
                                >Datos de la unidad</SelectItem
                            ><SelectItem value="total"
                                >Totales automáticos</SelectItem
                            ></SelectGroup
                        ></SelectContent
                    >
                </Select>
            </TabsContent>
            <TabsContent value="fields" class="flex flex-col gap-3">
                <p class="text-sm text-muted-foreground">
                    {{
                        selectedPersistedField
                            ? 'Cambie aquí la presentación. Para renombrar este campo, use Propiedades.'
                            : selectedField
                              ? 'Defina el nombre y la presentación del campo nuevo.'
                              : 'Escriba @docente en el documento o inserte aquí un nuevo campo.'
                    }}
                </p>
                <FieldGroup class="flex flex-row flex-wrap items-end gap-2">
                    <Field
                        v-if="!selectedPersistedField"
                        class="w-56"
                        :data-invalid="
                            Boolean(selectedField && !fieldLabel.trim())
                        "
                        ><FieldLabel for="design-field-name"
                            >Campo que llenará el docente</FieldLabel
                        ><Input
                            id="design-field-name"
                            v-model="fieldLabel"
                            @update:model-value="selectedField && updateField()"
                            :disabled="pending"
                            maxlength="180"
                            :aria-invalid="
                                Boolean(selectedField && !fieldLabel.trim())
                            "
                            placeholder="Ej. Objetivo de la unidad"
                            @keydown.enter.prevent="
                                selectedField ? updateField() : addField()
                            " /><FieldError
                            v-if="selectedField && !fieldLabel.trim()"
                            :errors="['Escriba un nombre para el campo.']"
                    /></Field>
                    <Field class="w-36"
                        ><FieldLabel for="design-field-type"
                            >Tipo de contenido</FieldLabel
                        ><Select
                            v-model="fieldType"
                            :disabled="pending"
                            @update:model-value="selectedField && updateField()"
                            ><SelectTrigger id="design-field-type"
                                ><SelectValue /></SelectTrigger
                            ><SelectContent
                                ><SelectGroup>
                                    <SelectItem
                                        v-for="kind in fieldTypes"
                                        :key="kind.value"
                                        :value="kind.value"
                                        >{{ kind.label }}</SelectItem
                                    >
                                </SelectGroup></SelectContent
                            ></Select
                        ></Field
                    >
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="
                            pending ||
                            !fieldLabel.trim() ||
                            (!selectedField &&
                                Boolean(repeatTable) &&
                                rowRole === 'total')
                        "
                        @click="selectedField ? updateField() : addField()"
                        >{{
                            selectedField
                                ? 'Aplicar al campo'
                                : 'Insertar campo'
                        }}</Button
                    >
                </FieldGroup>
                <p
                    v-if="
                        ['bulleted_list', 'numbered_list'].includes(fieldType)
                    "
                    class="text-sm text-muted-foreground"
                >
                    El docente escribe un elemento por línea. El diseño aplica
                    las viñetas o la numeración.
                </p>
            </TabsContent>
        </Tabs>
        <div
            v-if="suggestions"
            class="flex shrink-0 flex-col gap-1 rounded-md border bg-popover p-2 text-popover-foreground"
            role="listbox"
            aria-label="Variables disponibles"
        >
            <p
                v-if="!suggestions.items.length"
                class="text-sm text-muted-foreground"
            >
                No se encontraron variables.
            </p>
            <Button
                v-for="(item, index) in suggestions.items"
                :key="item.key"
                type="button"
                :variant="selectedSuggestion === index ? 'secondary' : 'ghost'"
                class="justify-start"
                role="option"
                :aria-selected="selectedSuggestion === index"
                @mousedown.prevent
                @click="chooseVariable(item)"
            >
                @{{ item.key }} — {{ item.label }}
            </Button>
        </div>
        <p class="shrink-0 text-sm text-muted-foreground">
            <template v-if="tool === 'tables'"
                >Seleccione celdas arrastrando o con Mayús + clic para
                combinarlas. Se conserva su contenido.</template
            >
            <template v-else
                >@docente: respuesta del docente · @nombre_carrera y otras
                variables: datos automáticos. Pulse un recuadro ▧ para
                editarlo.</template
            >
        </p>
        <div
            class="min-h-0 flex-1 overflow-auto rounded-md border p-4 max-sm:min-h-64 max-sm:shrink-0"
        >
            <EditorContent
                :editor="editor"
                class="template-document-editor"
                :class="{
                    'template-document-editor-single-field': fieldCount === 1,
                }"
            />
        </div>
        <p class="sr-only" aria-live="polite">
            {{ fieldCount }} espacios de contenido.
            {{ dirty ? 'Cambios sin guardar.' : 'Sin cambios pendientes.' }}
        </p>
    </div>
</template>

<style>
.template-document-editor {
    background: white;
    color: black;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    min-width: 580px;
}
.template-document-editor .tiptap {
    min-height: 300px;
    outline: none;
    padding: 12px;
}
.template-document-editor p {
    margin: 0 0 8px;
    min-height: 1em;
}
.template-document-editor table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
    margin: 10px 0;
}
.template-document-editor td,
.template-document-editor th {
    border: 1px solid #7f7f7f;
    min-width: 20px;
    padding: 2px 4px;
    vertical-align: top;
    position: relative;
    overflow-wrap: anywhere;
}
.template-document-editor td p,
.template-document-editor th p {
    margin: 0;
}
.template-document-editor .selectedCell::after {
    background: rgb(0 112 192 / 20%);
    content: '';
    inset: 0;
    pointer-events: none;
    position: absolute;
}
.template-document-editor .column-resize-handle {
    position: absolute;
    right: -2px;
    top: 0;
    bottom: 0;
    width: 4px;
    background: #0070c0;
    pointer-events: none;
}
.template-document-editor .resize-cursor {
    cursor: col-resize;
}
.template-input-token {
    background: #edf6ff;
    outline: 1px dashed #4f81bd;
    border-radius: 2px;
    padding: 1px 3px;
}
.template-input-token-generic {
    display: none;
}
.template-document-editor-single-field .template-input-token-generic {
    display: inline;
}
.template-document-editor-single-field .template-input-token-label {
    display: none;
}
.template-variable-token {
    background: #edf8ee;
    border-radius: 2px;
    padding: 1px 3px;
}
.template-document-editor ul {
    list-style: disc;
    padding-left: 24px;
}
.template-document-editor ol {
    list-style: decimal;
    padding-left: 24px;
}
</style>
