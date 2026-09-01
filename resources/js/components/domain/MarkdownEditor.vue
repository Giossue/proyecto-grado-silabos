<script setup lang="ts">
import {
    Bold,
    Code,
    Eye,
    Heading2,
    Heading3,
    Italic,
    Link,
    List,
    ListOrdered,
    Minus,
    Pencil,
    Strikethrough,
    Table,
    TextQuote,
} from '@lucide/vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { Component } from 'vue';
import { computed, nextTick, ref } from 'vue';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

withDefaults(
    defineProps<{
        label: string;
        placeholder?: string;
    }>(),
    {
        placeholder: 'Escriba el contenido en Markdown…',
    },
);

const model = defineModel<string>({ default: '' });
const mode = ref<'write' | 'preview'>('write');
const textareaRef = ref<InstanceType<typeof Textarea> | null>(null);

const textareaElement = (): HTMLTextAreaElement | null => {
    const element = textareaRef.value?.$el as HTMLTextAreaElement | undefined;

    return element ?? null;
};

/** Reemplaza el documento y devuelve el foco al punto editado. */
const apply = (next: string, selectStart: number, selectEnd: number): void => {
    model.value = next;
    void nextTick(() => {
        const element = textareaElement();
        element?.focus();
        element?.setSelectionRange(selectStart, selectEnd);
    });
};

const selection = (): { start: number; end: number; value: string } => {
    const element = textareaElement();
    const value = model.value;

    return {
        start: element?.selectionStart ?? value.length,
        end: element?.selectionEnd ?? value.length,
        value,
    };
};

/** Negrita, cursiva, código…: envuelve la selección o un texto de ejemplo. */
const wrapSelection = (
    prefix: string,
    suffix: string,
    placeholder: string,
): void => {
    const { start, end, value } = selection();
    const selected = value.slice(start, end) || placeholder;
    const next =
        value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    apply(next, start + prefix.length, start + prefix.length + selected.length);
};

/** Encabezados, citas y listas: antepone el marcador a cada línea seleccionada. */
const prefixLines = (marker: string, numbered = false): void => {
    const { start, end, value } = selection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value
        .slice(lineStart, lineEnd)
        .split('\n')
        .map((line, index) =>
            numbered ? `${index + 1}. ${line}` : marker + line,
        )
        .join('\n');
    apply(
        next(value, lineStart, lineEnd, block),
        lineStart,
        lineStart + block.length,
    );
};

const next = (
    value: string,
    from: number,
    to: number,
    replacement: string,
): string => value.slice(0, from) + replacement + value.slice(to);

/** Tablas y divisores: bloques que necesitan aire (línea en blanco) alrededor. */
const insertBlock = (block: string): void => {
    const { start, end, value } = selection();
    const before = value.slice(0, start);
    const after = value.slice(end);
    const padBefore =
        before === '' || before.endsWith('\n\n')
            ? ''
            : before.endsWith('\n')
              ? '\n'
              : '\n\n';
    const padAfter = after.startsWith('\n') || after === '' ? '\n' : '\n\n';
    const inserted = padBefore + block + padAfter;
    const caret = start + inserted.length;
    apply(next(value, start, end, inserted), caret, caret);
};

// --- Tabla con selector de tamaño, como en un procesador de textos -------------
const GRID_COLUMNS = 6;
const GRID_ROWS = 5;
const tableOpen = ref(false);
const hoveredRows = ref(2);
const hoveredColumns = ref(3);

const highlightCell = (cell: number): void => {
    hoveredRows.value = Math.floor((cell - 1) / GRID_COLUMNS) + 1;
    hoveredColumns.value = ((cell - 1) % GRID_COLUMNS) + 1;
};

const cellHighlighted = (cell: number): boolean => {
    const row = Math.floor((cell - 1) / GRID_COLUMNS) + 1;
    const column = ((cell - 1) % GRID_COLUMNS) + 1;

    return row <= hoveredRows.value && column <= hoveredColumns.value;
};

const insertTable = (rows: number, columns: number): void => {
    const header = Array.from(
        { length: columns },
        (_, index) => `Columna ${index + 1}`,
    );
    const line = (cells: string[]): string => `| ${cells.join(' | ')} |`;
    const body = Array.from({ length: Math.max(rows - 1, 1) }, () =>
        line(Array.from({ length: columns }, () => '   ')),
    );
    tableOpen.value = false;
    insertBlock(
        [line(header), line(header.map(() => '---')), ...body].join('\n'),
    );
};

// --- Cinta de opciones ---------------------------------------------------------
type ToolbarAction = {
    label: string;
    icon: Component;
    run: () => void;
};

const toolbarGroups: ToolbarAction[][] = [
    [
        {
            label: 'Título',
            icon: Heading2,
            run: () => prefixLines('## '),
        },
        {
            label: 'Subtítulo',
            icon: Heading3,
            run: () => prefixLines('### '),
        },
    ],
    [
        {
            label: 'Negrita',
            icon: Bold,
            run: () => wrapSelection('**', '**', 'texto en negrita'),
        },
        {
            label: 'Cursiva',
            icon: Italic,
            run: () => wrapSelection('_', '_', 'texto en cursiva'),
        },
        {
            label: 'Tachado',
            icon: Strikethrough,
            run: () => wrapSelection('~~', '~~', 'texto tachado'),
        },
    ],
    [
        {
            label: 'Cita',
            icon: TextQuote,
            run: () => prefixLines('> '),
        },
        {
            label: 'Lista',
            icon: List,
            run: () => prefixLines('- '),
        },
        {
            label: 'Lista numerada',
            icon: ListOrdered,
            run: () => prefixLines('', true),
        },
    ],
    [
        {
            label: 'Código',
            icon: Code,
            run: () => wrapSelection('`', '`', 'código'),
        },
        {
            label: 'Enlace',
            icon: Link,
            run: () => wrapSelection('[', '](https://)', 'texto del enlace'),
        },
        {
            label: 'Línea divisoria',
            icon: Minus,
            run: () => insertBlock('---'),
        },
    ],
];

// La vista previa pasa por DOMPurify: el Markdown admite HTML incrustado y este
// documento se comparte entre cuentas, así que nunca se inyecta sin desinfectar.
const previewHtml = computed(() =>
    DOMPurify.sanitize(
        marked.parse(model.value, {
            async: false,
            gfm: true,
            breaks: true,
        }),
    ),
);
</script>

<template>
    <div class="flex flex-col overflow-hidden rounded-md border">
        <TooltipProvider>
            <div
                class="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-1"
                role="toolbar"
                aria-label="Formato del documento"
            >
                <template
                    v-for="(group, groupIndex) in toolbarGroups"
                    :key="groupIndex"
                >
                    <Separator
                        v-if="groupIndex > 0"
                        orientation="vertical"
                        class="mx-0.5 h-5!"
                    />
                    <Tooltip v-for="action in group" :key="action.label">
                        <TooltipTrigger as-child>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                :aria-label="action.label"
                                :disabled="mode === 'preview'"
                                @click="action.run"
                            >
                                <component
                                    :is="action.icon"
                                    aria-hidden="true"
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{{ action.label }}</TooltipContent>
                    </Tooltip>
                    <template v-if="groupIndex === toolbarGroups.length - 2">
                        <Popover v-model:open="tableOpen">
                            <Tooltip>
                                <TooltipTrigger as-child>
                                    <PopoverTrigger as-child>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="Insertar tabla"
                                            :disabled="mode === 'preview'"
                                        >
                                            <Table aria-hidden="true" />
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Insertar tabla</TooltipContent>
                            </Tooltip>
                            <PopoverContent class="w-auto p-3">
                                <div class="flex flex-col items-center gap-2">
                                    <div
                                        class="grid gap-1"
                                        :style="{
                                            gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                                        }"
                                    >
                                        <button
                                            v-for="cell in GRID_ROWS *
                                            GRID_COLUMNS"
                                            :key="cell"
                                            type="button"
                                            class="size-5 rounded-xs border transition-colors"
                                            :class="
                                                cellHighlighted(cell)
                                                    ? 'border-primary bg-primary/25'
                                                    : 'border-border bg-background'
                                            "
                                            :aria-label="`Tabla de ${Math.floor((cell - 1) / GRID_COLUMNS) + 1} filas por ${((cell - 1) % GRID_COLUMNS) + 1} columnas`"
                                            @mouseenter="highlightCell(cell)"
                                            @focus="highlightCell(cell)"
                                            @click="
                                                insertTable(
                                                    hoveredRows,
                                                    hoveredColumns,
                                                )
                                            "
                                        />
                                    </div>
                                    <p class="text-xs text-muted-foreground">
                                        {{ hoveredRows }} ×
                                        {{ hoveredColumns }}
                                    </p>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </template>
                </template>

                <div
                    class="ml-auto flex items-center gap-1"
                    role="group"
                    aria-label="Modo del editor"
                >
                    <Button
                        type="button"
                        size="sm"
                        :variant="mode === 'write' ? 'secondary' : 'ghost'"
                        :aria-pressed="mode === 'write'"
                        @click="mode = 'write'"
                    >
                        <Pencil data-icon="inline-start" aria-hidden="true" />
                        Editar
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        :variant="mode === 'preview' ? 'secondary' : 'ghost'"
                        :aria-pressed="mode === 'preview'"
                        @click="mode = 'preview'"
                    >
                        <Eye data-icon="inline-start" aria-hidden="true" />
                        Vista previa
                    </Button>
                </div>
            </div>
        </TooltipProvider>

        <Textarea
            v-if="mode === 'write'"
            ref="textareaRef"
            v-model="model"
            :aria-label="label"
            :placeholder="placeholder"
            class="min-h-[26rem] rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
        />
        <div
            v-else
            class="markdown-preview min-h-[26rem] px-4 py-3"
            aria-label="Vista previa del documento"
        >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-if="model.trim() !== ''" v-html="previewHtml" />
            <p v-else class="text-sm text-muted-foreground">
                Nada que previsualizar todavía.
            </p>
        </div>
    </div>
</template>

<style scoped>
/* Tipografía del documento renderizado; el contenido llega por v-html. */
.markdown-preview {
    font-size: var(--text-sm);
    line-height: 1.65;
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3),
.markdown-preview :deep(h4) {
    font-weight: 600;
    margin-block: 1.25em 0.5em;
}

.markdown-preview :deep(h1) {
    font-size: 1.5em;
}

.markdown-preview :deep(h2) {
    font-size: 1.3em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.25em;
}

.markdown-preview :deep(h3) {
    font-size: 1.15em;
}

.markdown-preview :deep(p) {
    margin-block: 0.75em;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
    margin-block: 0.75em;
    padding-inline-start: 1.5em;
}

.markdown-preview :deep(ul) {
    list-style: disc;
}

.markdown-preview :deep(ol) {
    list-style: decimal;
}

.markdown-preview :deep(blockquote) {
    border-inline-start: 3px solid var(--border);
    color: var(--muted-foreground);
    margin-block: 0.75em;
    padding-inline-start: 1em;
}

.markdown-preview :deep(code) {
    background: var(--muted);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.9em;
    padding: 0.15em 0.35em;
}

.markdown-preview :deep(pre) {
    background: var(--muted);
    border-radius: var(--radius-md);
    margin-block: 0.75em;
    overflow-x: auto;
    padding: 0.75em 1em;
}

.markdown-preview :deep(pre code) {
    background: transparent;
    padding: 0;
}

.markdown-preview :deep(table) {
    border-collapse: collapse;
    margin-block: 0.75em;
    width: 100%;
}

.markdown-preview :deep(th),
.markdown-preview :deep(td) {
    border: 1px solid var(--border);
    padding: 0.4em 0.75em;
    text-align: start;
}

.markdown-preview :deep(th) {
    background: var(--muted);
    font-weight: 600;
}

.markdown-preview :deep(a) {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 4px;
}

.markdown-preview :deep(hr) {
    border-color: var(--border);
    margin-block: 1.5em;
}
</style>
