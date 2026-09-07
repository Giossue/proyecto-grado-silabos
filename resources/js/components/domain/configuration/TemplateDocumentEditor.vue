<script setup lang="ts">
import {
    ClipboardPaste,
    Copy,
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Undo2,
    Redo2,
    Braces,
    Plus,
    Scissors,
    Settings2,
    TableProperties,
    Trash2,
    UserRoundPlus,
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
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Selection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
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
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
    embedded?: boolean;
}>();
const emit = defineEmits<{
    save: [document: DocumentNode];
    dirty: [value: boolean];
    properties: [];
}>();
const suggestions = shallowRef<SuggestionProps<TemplateVariable> | null>(null);
const selectedSuggestion = ref(0);
const fieldLabel = ref('');
const fieldType = ref('texto_largo');
const rows = ref(3);
const columns = ref(3);
const initial = ref(JSON.stringify(props.document));
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
                'Respuesta del docente',
            ],
            [
                'span',
                { class: 'template-input-token-label' },
                `${node.attrs.label}${node.attrs.choice ? ` (${node.attrs.choice})` : ''}`,
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
        dirty.value = JSON.stringify(current.getJSON()) !== initial.value;
    },
    onTransaction: () => {
        toolbarVersion.value++;
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
const context = ref<'text' | 'table' | 'field'>('text');
const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const textColors = [
    { label: 'Negro', value: '#000000' },
    { label: 'Azul institucional', value: '#0070C0' },
    { label: 'Azul oscuro', value: '#1F4E78' },
    { label: 'Rojo', value: '#C00000' },
    { label: 'Verde', value: '#548235' },
    { label: 'Gris', value: '#595959' },
];
const cellColors = [
    { label: 'Sin fondo', value: null },
    { label: 'Blanco', value: '#FFFFFF' },
    { label: 'Azul claro', value: '#DBE5F1' },
    { label: 'Azul institucional', value: '#4F81BD' },
    { label: 'Gris claro', value: '#E7E6E6' },
];
let preservedContextSelection: Selection | null = null;
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
const insertTeacherField = () => {
    const current = editor.value;

    if (!current || props.pending) {
        return;
    }

    const position = current.state.selection.from;
    current
        .chain()
        .focus()
        .insertContent(teacherNode('Respuesta del docente', 'texto_largo'))
        .setNodeSelection(position)
        .run();
};
const insertVariable = (variable: TemplateVariable) => {
    editor.value
        ?.chain()
        .focus()
        .insertContent([
            {
                type: 'variable',
                attrs: { id: variable.key, label: variable.key },
            },
            { type: 'text', text: ' ' },
        ])
        .run();
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
const insertTable = (
    requestedRows: number = rows.value,
    requestedColumns: number = columns.value,
) => {
    const rowCount = Math.max(1, Math.min(20, Number(requestedRows) || 3));
    const columnCount = Math.max(
        1,
        Math.min(12, Number(requestedColumns) || 3),
    );
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
const prepareDocument = (): DocumentNode | null => {
    if (selectedField.value && !fieldLabel.value.trim()) {
        return null;
    }

    if (editor.value) {
        updateField();

        return editor.value.getJSON() as DocumentNode;
    }

    return null;
};
const save = () => {
    const value = prepareDocument();

    if (value) {
        emit('save', value);
    }
};
const markClean = () => {
    if (!editor.value) {
        return;
    }

    initial.value = JSON.stringify(editor.value.getJSON());
    dirty.value = false;
};
const setFieldPresentation = (value: string) => {
    fieldType.value = value;
    updateField();
};
const preserveContextSelection = (event: PointerEvent) => {
    if (event.button === 2 && editor.value) {
        preservedContextSelection = editor.value.state.selection;
    }
};
const prepareContextMenu = (event: MouseEvent) => {
    const current = editor.value;
    const target = event.target as Element | null;

    if (!current || !target) {
        return;
    }

    const field = target.closest(
        '[data-template-field], [data-template-column]',
    );
    const preserved = preservedContextSelection;
    preservedContextSelection = null;

    if (field) {
        const position = current.view.posAtDOM(field, 0);
        current.view.dispatch(
            current.state.tr.setSelection(
                NodeSelection.create(current.state.doc, position),
            ),
        );
        context.value = 'field';

        return;
    }

    const position = current.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
    });
    const tableCell = target.closest('td, th');

    if (
        preserved &&
        ((tableCell && preserved instanceof CellSelection) ||
            (!tableCell && !preserved.empty))
    ) {
        current.view.dispatch(current.state.tr.setSelection(preserved));
    }

    const selection = current.state.selection;

    if (
        position &&
        !(tableCell && current.state.selection instanceof CellSelection) &&
        (selection.empty ||
            position.pos < selection.from ||
            position.pos > selection.to)
    ) {
        current.view.dispatch(
            current.state.tr.setSelection(
                TextSelection.near(current.state.doc.resolve(position.pos)),
            ),
        );
    }

    context.value = tableCell ? 'table' : 'text';
};
const clipboard = async (action: 'cut' | 'copy' | 'paste') => {
    const current = editor.value;

    if (!current) {
        return;
    }

    current.view.focus();

    if (action !== 'paste') {
        document.execCommand(action);

        return;
    }

    try {
        const value = await navigator.clipboard.readText();
        current.chain().focus().insertContent(value).run();
    } catch {
        // El navegador puede negar lectura del portapapeles; Ctrl+V sigue disponible.
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
defineExpose({ save, editor, markClean, prepareDocument });
</script>

<template>
    <div class="min-h-0">
        <ContextMenu>
            <ContextMenuTrigger as-child>
                <EditorContent
                    :editor="editor"
                    class="template-document-editor overflow-auto rounded-md border border-transparent p-1 focus-within:border-ring"
                    :class="{
                        'template-document-editor-single-field':
                            fieldCount === 1,
                        'template-document-editor-embedded': embedded,
                    }"
                    @pointerdown.capture="preserveContextSelection"
                    @contextmenu.capture="prepareContextMenu"
                />
            </ContextMenuTrigger>
            <ContextMenuContent
                v-if="state"
                class="w-64"
                aria-label="Herramientas del documento"
            >
                <ContextMenuGroup>
                    <ContextMenuItem
                        :disabled="state.state.selection.empty"
                        @select="clipboard('cut')"
                    >
                        <Scissors />
                        Cortar
                    </ContextMenuItem>
                    <ContextMenuItem
                        :disabled="state.state.selection.empty"
                        @select="clipboard('copy')"
                    >
                        <Copy />
                        Copiar
                    </ContextMenuItem>
                    <ContextMenuItem @select="clipboard('paste')">
                        <ClipboardPaste />
                        Pegar
                    </ContextMenuItem>
                </ContextMenuGroup>

                <ContextMenuSeparator />

                <ContextMenuGroup v-if="context === 'text'">
                    <ContextMenuItem
                        @select="state.chain().focus().toggleBold().run()"
                    >
                        <Bold />
                        Negrita
                    </ContextMenuItem>
                    <ContextMenuItem
                        @select="state.chain().focus().toggleItalic().run()"
                    >
                        <Italic />
                        Cursiva
                    </ContextMenuItem>
                    <ContextMenuItem
                        @select="state.chain().focus().toggleUnderline().run()"
                    >
                        <Underline />
                        Subrayado
                    </ContextMenuItem>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>
                            Tipo de fuente
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    v-for="font in DOCUMENT_FONTS"
                                    :key="font"
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .setFontFamily(font)
                                            .run()
                                    "
                                >
                                    {{ font }}
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>
                            Tamaño de fuente
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    v-for="size in fontSizes"
                                    :key="size"
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .setFontSize(size + 'pt')
                                            .run()
                                    "
                                >
                                    {{ size }} pt
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>
                            Color de fuente
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    v-for="color in textColors"
                                    :key="color.value"
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .setColor(color.value)
                                            .run()
                                    "
                                >
                                    <span
                                        class="size-3 rounded-full border"
                                        :style="{
                                            backgroundColor: color.value,
                                        }"
                                    />
                                    {{ color.label }}
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>
                            Alineación del texto
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .setTextAlign('left')
                                            .run()
                                    "
                                >
                                    <AlignLeft />
                                    Izquierda
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .setTextAlign('center')
                                            .run()
                                    "
                                >
                                    <AlignCenter />
                                    Centro
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .setTextAlign('right')
                                            .run()
                                    "
                                >
                                    <AlignRight />
                                    Derecha
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .setTextAlign('justify')
                                            .run()
                                    "
                                >
                                    <AlignJustify />
                                    Justificar
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger> Lista </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .toggleBulletList()
                                            .run()
                                    "
                                >
                                    Lista con viñetas
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .toggleOrderedList()
                                            .run()
                                    "
                                >
                                    Lista numerada
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem
                        @select="state.chain().focus().unsetAllMarks().run()"
                    >
                        Quitar formato
                    </ContextMenuItem>
                </ContextMenuGroup>

                <ContextMenuGroup v-else-if="context === 'table'">
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>Insertar</ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .addColumnBefore()
                                            .run()
                                    "
                                >
                                    Columna izquierda
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .addColumnAfter()
                                            .run()
                                    "
                                >
                                    Columna derecha
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .addRowBefore()
                                            .run()
                                    "
                                >
                                    Fila arriba
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .addRowAfter()
                                            .run()
                                    "
                                >
                                    Fila debajo
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>Eliminar</ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    variant="destructive"
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .deleteColumn()
                                            .run()
                                    "
                                >
                                    Eliminar columna
                                </ContextMenuItem>
                                <ContextMenuItem
                                    variant="destructive"
                                    @select="
                                        state.chain().focus().deleteRow().run()
                                    "
                                >
                                    Eliminar fila
                                </ContextMenuItem>
                                <ContextMenuItem
                                    variant="destructive"
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .deleteTable()
                                            .run()
                                    "
                                >
                                    Eliminar tabla
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem
                        :disabled="!state.can().mergeCells()"
                        @select="state.chain().focus().mergeCells().run()"
                    >
                        Unir celdas
                    </ContextMenuItem>
                    <ContextMenuItem
                        :disabled="!state.can().splitCell()"
                        @select="state.chain().focus().splitCell().run()"
                    >
                        Dividir celda
                    </ContextMenuItem>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>
                            Fondo de celda
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    v-for="color in cellColors"
                                    :key="color.label"
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .setCellAttribute(
                                                'backgroundColor',
                                                color.value,
                                            )
                                            .run()
                                    "
                                >
                                    <span
                                        class="size-3 rounded-sm border"
                                        :style="{
                                            backgroundColor:
                                                color.value ?? '#FFFFFF',
                                        }"
                                    />
                                    {{ color.label }}
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub v-if="repeatTable">
                        <ContextMenuSubTrigger>
                            Función de la fila
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .updateAttributes('tableRow', {
                                                rowRole: 'fixed',
                                            })
                                            .run()
                                    "
                                >
                                    Texto fijo
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .updateAttributes('tableRow', {
                                                rowRole: 'record',
                                            })
                                            .run()
                                    "
                                >
                                    Datos que se repiten
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .updateAttributes('tableRow', {
                                                rowRole: 'unit',
                                            })
                                            .run()
                                    "
                                >
                                    Datos de la unidad
                                </ContextMenuItem>
                                <ContextMenuItem
                                    @select="
                                        state
                                            .chain()
                                            .focus()
                                            .updateAttributes('tableRow', {
                                                rowRole: 'total',
                                            })
                                            .run()
                                    "
                                >
                                    Totales automáticos
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                </ContextMenuGroup>

                <ContextMenuGroup v-else>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>
                            Tipo de contenido
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    v-for="kind in fieldTypes"
                                    :key="kind.value"
                                    @select="setFieldPresentation(kind.value)"
                                >
                                    {{ kind.label }}
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem @select="emit('properties')">
                        <Settings2 />
                        Propiedades del campo
                    </ContextMenuItem>
                    <ContextMenuItem
                        variant="destructive"
                        @select="state.chain().focus().deleteSelection().run()"
                    >
                        <Trash2 />
                        Eliminar del diseño
                    </ContextMenuItem>
                </ContextMenuGroup>

                <ContextMenuSeparator />

                <ContextMenuGroup>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>
                            <Plus />
                            Insertar
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent class="max-h-80">
                            <ContextMenuGroup>
                                <ContextMenuItem @select="insertTeacherField">
                                    <UserRoundPlus />
                                    Respuesta del docente
                                </ContextMenuItem>
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger>
                                        <TableProperties />
                                        Tabla
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent>
                                        <ContextMenuGroup>
                                            <ContextMenuItem
                                                @select="insertTable(2, 2)"
                                            >
                                                Tabla 2 × 2
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                @select="insertTable(3, 3)"
                                            >
                                                Tabla 3 × 3
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                @select="insertTable(4, 4)"
                                            >
                                                Tabla 4 × 4
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                @select="insertTable(5, 5)"
                                            >
                                                Tabla 5 × 5
                                            </ContextMenuItem>
                                        </ContextMenuGroup>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger>
                                        <Braces />
                                        Dato automático
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent class="max-h-72">
                                        <ContextMenuGroup>
                                            <ContextMenuItem
                                                v-for="variable in variables"
                                                :key="variable.key"
                                                @select="
                                                    insertVariable(variable)
                                                "
                                            >
                                                <span>
                                                    <span
                                                        class="block font-medium"
                                                    >
                                                        @{{ variable.key }}
                                                    </span>
                                                    <span
                                                        class="block text-xs text-muted-foreground"
                                                    >
                                                        {{ variable.label }}
                                                    </span>
                                                </span>
                                            </ContextMenuItem>
                                        </ContextMenuGroup>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            </ContextMenuGroup>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem
                        :disabled="!state.can().undo()"
                        @select="state.chain().focus().undo().run()"
                    >
                        <Undo2 />
                        Deshacer
                    </ContextMenuItem>
                    <ContextMenuItem
                        :disabled="!state.can().redo()"
                        @select="state.chain().focus().redo().run()"
                    >
                        <Redo2 />
                        Rehacer
                    </ContextMenuItem>
                </ContextMenuGroup>
            </ContextMenuContent>
        </ContextMenu>

        <div
            v-if="suggestions"
            class="mt-2 flex flex-col gap-1 rounded-md border bg-popover p-2 text-popover-foreground"
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
.template-document-editor-embedded .tiptap {
    min-height: 1.5em;
    padding: 2px;
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
