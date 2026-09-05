<script setup lang="ts">
import {
    Bold,
    Code,
    Heading2,
    Heading3,
    Italic,
    Link,
    List,
    ListOrdered,
    Minus,
    Strikethrough,
    Table as TableIcon,
    TextQuote,
} from '@lucide/vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { Component } from 'vue';
import { nextTick, onMounted, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

const props = withDefaults(
    defineProps<{
        label: string;
        placeholder?: string;
        disabled?: boolean;
    }>(),
    {
        placeholder: 'Empiece a redactar el documento…',
        disabled: false,
    },
);

const model = defineModel<string>({ default: '' });
const editorRef = ref<HTMLElement | null>(null);
const lastEmitted = ref<string | null>(null);

const renderMarkdown = (markdown: string): string =>
    DOMPurify.sanitize(
        marked.parse(markdown, {
            async: false,
            gfm: true,
            breaks: true,
        }),
    );

const normaliseMarkdown = (markdown: string): string =>
    markdown
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const nodesToMarkdown = (nodes: NodeListOf<ChildNode> | ChildNode[]): string =>
    Array.from(nodes)
        .map((node) => nodeToMarkdown(node))
        .join('');

const listToMarkdown = (list: HTMLElement, ordered: boolean): string => {
    const items = Array.from(list.children).filter(
        (child): child is HTMLLIElement => child.tagName === 'LI',
    );

    return (
        items
            .map((item, index) => {
                const content = nodesToMarkdown(
                    Array.from(item.childNodes).filter(
                        (node) =>
                            !(
                                node instanceof HTMLElement &&
                                ['OL', 'UL'].includes(node.tagName)
                            ),
                    ),
                ).trim();
                const nested = Array.from(item.children)
                    .filter((child) => ['OL', 'UL'].includes(child.tagName))
                    .map((child) =>
                        listToMarkdown(
                            child as HTMLElement,
                            child.tagName === 'OL',
                        )
                            .trim()
                            .split('\n')
                            .map((line) => `  ${line}`)
                            .join('\n'),
                    )
                    .join('\n');
                const marker = ordered ? `${index + 1}.` : '-';

                return `${marker} ${content}${nested ? `\n${nested}` : ''}`;
            })
            .join('\n') + '\n\n'
    );
};

const tableToMarkdown = (table: HTMLTableElement): string => {
    const rows = Array.from(table.rows)
        .map((row) =>
            Array.from(row.cells).map((cell) =>
                nodesToMarkdown(cell.childNodes)
                    .replace(/\|/g, '\\|')
                    .replace(/\n+/g, ' ')
                    .trim(),
            ),
        )
        .filter((cells) => cells.length > 0);

    if (rows.length === 0) {
        return '';
    }

    const line = (cells: string[]): string => `| ${cells.join(' | ')} |`;
    const header = rows[0];
    const body = rows.slice(1);

    return (
        [line(header), line(header.map(() => '---')), ...body.map(line)].join(
            '\n',
        ) + '\n\n'
    );
};

const nodeToMarkdown = (node: ChildNode): string => {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? '';
    }

    if (!(node instanceof HTMLElement)) {
        return '';
    }

    const content = nodesToMarkdown(node.childNodes);

    switch (node.tagName) {
        case 'BR':
            return '\n';
        case 'H1':
            return `# ${content.trim()}\n\n`;
        case 'H2':
            return `## ${content.trim()}\n\n`;
        case 'H3':
            return `### ${content.trim()}\n\n`;
        case 'H4':
            return `#### ${content.trim()}\n\n`;
        case 'H5':
            return `##### ${content.trim()}\n\n`;
        case 'H6':
            return `###### ${content.trim()}\n\n`;
        case 'P':
        case 'DIV':
            return `${content.trim()}\n\n`;
        case 'STRONG':
        case 'B':
            return `**${content}**`;
        case 'EM':
        case 'I':
            return `_${content}_`;
        case 'S':
        case 'STRIKE':
        case 'DEL':
            return `~~${content}~~`;
        case 'CODE':
            return node.parentElement?.tagName === 'PRE'
                ? content
                : `\`${content}\``;
        case 'PRE':
            return `\`\`\`\n${node.textContent?.trim() ?? ''}\n\`\`\`\n\n`;
        case 'BLOCKQUOTE':
            return `${content
                .trim()
                .split('\n')
                .filter((line) => line.trim() !== '')
                .map((line) => `> ${line}`)
                .join('\n')}\n\n`;
        case 'UL':
            return listToMarkdown(node, false);
        case 'OL':
            return listToMarkdown(node, true);
        case 'A': {
            const href = node.getAttribute('href');

            return href ? `[${content}](${href})` : content;
        }
        case 'HR':
            return '---\n\n';
        case 'TABLE':
            return tableToMarkdown(node as HTMLTableElement);
        default:
            return content;
    }
};

const syncModel = (): void => {
    const editor = editorRef.value;

    if (!editor) {
        return;
    }

    const markdown = normaliseMarkdown(nodesToMarkdown(editor.childNodes));
    lastEmitted.value = markdown;
    model.value = markdown;
};

const selectedRange = (): Range | null => {
    const editor = editorRef.value;
    const selection = window.getSelection();

    if (!editor || !selection || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0);

    return editor.contains(range.commonAncestorContainer) ? range : null;
};

const focusEditor = (): void => {
    editorRef.value?.focus();

    if (selectedRange() || !editorRef.value) {
        return;
    }

    const range = document.createRange();
    range.selectNodeContents(editorRef.value);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
};

const runCommand = (command: string, value?: string): void => {
    if (props.disabled) {
        return;
    }

    focusEditor();
    document.execCommand(command, false, value);
    syncModel();
};

const insertBlock = (node: HTMLElement): void => {
    if (props.disabled) {
        return;
    }

    focusEditor();
    const editor = editorRef.value;
    const range = selectedRange();

    if (!editor || !range) {
        return;
    }

    range.deleteContents();
    range.insertNode(node);
    const paragraph = document.createElement('p');
    paragraph.append(document.createElement('br'));
    node.after(paragraph);

    const selection = window.getSelection();
    const caret = document.createRange();
    caret.setStart(paragraph, 0);
    caret.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(caret);
    syncModel();
};

const pastePlainText = (event: ClipboardEvent): void => {
    if (props.disabled) {
        return;
    }

    const text = event.clipboardData?.getData('text/plain') ?? '';
    focusEditor();
    document.execCommand('insertText', false, text);
    syncModel();
};

const insertLink = (): void => {
    if (props.disabled) {
        return;
    }

    const value = window.prompt('Dirección del enlace (https://…):');

    if (!value) {
        return;
    }

    let url: URL;

    try {
        url = new URL(value);
    } catch {
        return;
    }

    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
        return;
    }

    focusEditor();
    const range = selectedRange();

    if (!range) {
        return;
    }

    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = range.toString().trim() || 'Texto del enlace';
    range.deleteContents();
    range.insertNode(link);

    const selection = window.getSelection();
    const caret = document.createRange();
    caret.setStartAfter(link);
    caret.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(caret);
    syncModel();
};

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
    tableOpen.value = false;
    const table = document.createElement('table');
    const head = table.createTHead();
    const header = head.insertRow();
    const body = table.createTBody();

    Array.from({ length: columns }, (_, index) => {
        const cell = document.createElement('th');
        cell.textContent = `Columna ${index + 1}`;
        header.append(cell);
    });

    Array.from({ length: Math.max(rows - 1, 1) }, () => {
        const row = body.insertRow();
        Array.from({ length: columns }, () => row.insertCell());
    });

    insertBlock(table);
};

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
            run: () => runCommand('formatBlock', '<h2>'),
        },
        {
            label: 'Subtítulo',
            icon: Heading3,
            run: () => runCommand('formatBlock', '<h3>'),
        },
    ],
    [
        { label: 'Negrita', icon: Bold, run: () => runCommand('bold') },
        { label: 'Cursiva', icon: Italic, run: () => runCommand('italic') },
        {
            label: 'Tachado',
            icon: Strikethrough,
            run: () => runCommand('strikeThrough'),
        },
    ],
    [
        {
            label: 'Cita',
            icon: TextQuote,
            run: () => runCommand('formatBlock', '<blockquote>'),
        },
        {
            label: 'Lista',
            icon: List,
            run: () => runCommand('insertUnorderedList'),
        },
        {
            label: 'Lista numerada',
            icon: ListOrdered,
            run: () => runCommand('insertOrderedList'),
        },
    ],
    [
        {
            label: 'Código',
            icon: Code,
            run: () => runCommand('formatBlock', '<pre>'),
        },
        { label: 'Enlace', icon: Link, run: insertLink },
        {
            label: 'Línea divisoria',
            icon: Minus,
            run: () => insertBlock(document.createElement('hr')),
        },
    ],
];

onMounted(() => {
    if (editorRef.value) {
        editorRef.value.innerHTML = renderMarkdown(model.value);
    }
});

watch(model, (markdown) => {
    if (markdown === lastEmitted.value || !editorRef.value) {
        return;
    }

    void nextTick(() => {
        if (editorRef.value) {
            editorRef.value.innerHTML = renderMarkdown(markdown);
        }
    });
});
</script>

<template>
    <div class="overflow-hidden rounded-lg border bg-muted/30">
        <TooltipProvider>
            <div
                class="flex flex-wrap items-center gap-1 border-b bg-background/90 p-1.5"
                role="toolbar"
                aria-label="Formato del documento"
                @mousedown.prevent
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
                                :disabled="props.disabled"
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
                                            :disabled="props.disabled"
                                        >
                                            <TableIcon aria-hidden="true" />
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
                                        {{ hoveredRows }} × {{ hoveredColumns }}
                                    </p>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </template>
                </template>
            </div>
        </TooltipProvider>

        <div class="overflow-auto p-3 sm:p-8">
            <div
                ref="editorRef"
                class="document-page min-h-[42rem] w-full bg-background px-6 py-8 shadow-sm outline-none sm:mx-auto sm:max-w-[52rem] sm:px-12 sm:py-12"
                :contenteditable="!props.disabled"
                role="textbox"
                aria-multiline="true"
                :aria-label="label"
                :aria-disabled="props.disabled"
                :data-placeholder="placeholder"
                spellcheck="true"
                @input="syncModel"
                @paste.prevent="pastePlainText"
                @drop.prevent
            />
        </div>
    </div>
</template>

<style scoped>
.document-page {
    color: var(--foreground);
    font-family: Georgia, Cambria, 'Times New Roman', serif;
    font-size: 1rem;
    line-height: 1.7;
}
.document-page:empty::before {
    color: var(--muted-foreground);
    content: attr(data-placeholder);
    pointer-events: none;
}
.document-page[contenteditable='true']:focus-visible {
    box-shadow: 0 0 0 2px var(--ring);
}
.document-page :deep(h1),
.document-page :deep(h2),
.document-page :deep(h3),
.document-page :deep(h4),
.document-page :deep(h5),
.document-page :deep(h6) {
    font-family: var(--font-sans);
    font-weight: 650;
    line-height: 1.25;
    margin-block: 1.25em 0.55em;
}
.document-page :deep(h1) {
    font-size: 1.75em;
}
.document-page :deep(h2) {
    border-bottom: 1px solid var(--border);
    font-size: 1.4em;
    padding-bottom: 0.25em;
}
.document-page :deep(h3) {
    font-size: 1.18em;
}
.document-page :deep(p) {
    margin-block: 0.8em;
}
.document-page :deep(ul),
.document-page :deep(ol) {
    margin-block: 0.8em;
    padding-inline-start: 1.6em;
}
.document-page :deep(ul) {
    list-style: disc;
}
.document-page :deep(ol) {
    list-style: decimal;
}
.document-page :deep(blockquote) {
    border-inline-start: 3px solid var(--border);
    color: var(--muted-foreground);
    margin-block: 0.8em;
    padding-inline-start: 1em;
}
.document-page :deep(code) {
    background: var(--muted);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.9em;
    padding: 0.15em 0.35em;
}
.document-page :deep(pre) {
    background: var(--muted);
    border-radius: var(--radius-md);
    margin-block: 0.8em;
    overflow-x: auto;
    padding: 0.8em 1em;
}
.document-page :deep(pre code) {
    background: transparent;
    padding: 0;
}
.document-page :deep(table) {
    border-collapse: collapse;
    margin-block: 1em;
    width: 100%;
}
.document-page :deep(th),
.document-page :deep(td) {
    border: 1px solid var(--border);
    min-width: 7rem;
    padding: 0.45em 0.7em;
    text-align: start;
    vertical-align: top;
}
.document-page :deep(th) {
    background: var(--muted);
    font-family: var(--font-sans);
    font-weight: 600;
}
.document-page :deep(a) {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 4px;
}
.document-page :deep(hr) {
    border-color: var(--border);
    margin-block: 1.75em;
}
</style>
