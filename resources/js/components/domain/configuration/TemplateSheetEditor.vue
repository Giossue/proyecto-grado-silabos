<script setup lang="ts">
import { router } from '@inertiajs/vue3';
import {
    Check,
    GripVertical,
    Heading,
    List,
    ListOrdered,
    MoreHorizontal,
    Settings2,
    Table,
    Trash2,
    Type,
} from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateFieldSheet from '@/components/domain/configuration/TemplateFieldSheet.vue';
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
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

type TemplateField = {
    id: string;
    block_id: string;
    key: string;
    label: string;
    help: string | null;
    required: boolean;
    inherited: boolean;
    master_source: string | null;
    teacher_editable: boolean;
    ai_enabled: boolean;
    document_marker: string | null;
    content_type: string;
};

/** Un campo del documento: bloque técnico con su definición principal. */
type FieldContainer = {
    id: string;
    key: string;
    title: string;
    content_type: string;
    fields: TemplateField[];
};

type TemplateSection = {
    id: string;
    key: string;
    title: string;
    description: string | null;
    blocks: FieldContainer[];
};

type ContentType = 'text' | 'table' | 'bulleted_list' | 'numbered_list';

type Drag =
    | { kind: 'new-section' }
    | { kind: 'new-field'; contentType: ContentType }
    | { kind: 'section'; id: string }
    | { kind: 'field'; sectionId: string; id: string };

type Editing = { kind: 'section' | 'field'; id: string };

type Deletion =
    | { kind: 'section'; section: TemplateSection }
    | { kind: 'field'; section: TemplateSection; container: FieldContainer };

const props = defineProps<{
    templateId: string;
    sections: TemplateSection[];
    blockTypes: { value: string; label: string }[];
    /** Con el proceso abierto la hoja solo se mira. */
    readonly: boolean;
}>();

const PALETTE: { type: ContentType; label: string; icon: typeof Type }[] = [
    { type: 'text', label: 'Texto', icon: Type },
    { type: 'table', label: 'Tabla', icon: Table },
    { type: 'bulleted_list', label: 'Lista con viñetas', icon: List },
    { type: 'numbered_list', label: 'Lista numerada', icon: ListOrdered },
];

/** Texto de relleno: muestra cómo se verá el sílabo impreso, no contenido real. */
const LOREM_PARAGRAPHS = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

const LOREM_ITEMS = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
];

const LOREM_TABLE = {
    headers: ['Lorem ipsum', 'Dolor sit', 'Amet consectetur', 'Adipiscing'],
    rows: [
        ['Sed do eiusmod', 'Tempor incididunt', 'Ut labore et dolore', '12'],
        ['Magna aliqua', 'Ut enim ad minim', 'Veniam quis nostrud', '8'],
        ['Exercitation', 'Ullamco laboris', 'Nisi ut aliquip', '4'],
    ],
};

const doc = ref<TemplateSection[]>([]);
const dragging = ref<Drag | null>(null);
const hoveredZone = ref<string | null>(null);
const editing = ref<Editing | null>(null);
const renameValue = ref('');
const editorInput = ref<HTMLInputElement | null>(null);

/** El Input vive dentro de v-for: la referencia se asigna a mano al montarse. */
const setEditorRef = (element: unknown): void => {
    const instance = element as { $el?: HTMLInputElement } | null;
    editorInput.value = instance?.$el ?? null;
};
const activeSectionId = ref<string | null>(null);
const pendingFocus = ref<{ kind: 'section' | 'field'; key: string } | null>(
    null,
);
const deletion = ref<Deletion | null>(null);
const propertiesSheet = ref<InstanceType<typeof TemplateFieldSheet> | null>(
    null,
);

const copySections = (value: TemplateSection[]): TemplateSection[] =>
    value.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => ({
            ...block,
            fields: block.fields.map((field) => ({ ...field })),
        })),
    }));

const firstField = (container: FieldContainer): TemplateField | null =>
    container.fields[0] ?? null;

const fieldLabel = (container: FieldContainer): string =>
    firstField(container)?.label ?? container.title;

const typeLabel = (value: string): string =>
    props.blockTypes.find((type) => type.value === value)?.label ?? value;

const isEditing = (kind: Editing['kind'], id: string): boolean =>
    editing.value?.kind === kind && editing.value.id === id;

const focusEditor = async (): Promise<void> => {
    await nextTick();
    editorInput.value?.focus();
    editorInput.value?.select();
};

watch(
    () => props.sections,
    (value) => {
        doc.value = copySections(value);

        // Una pieza recién soltada nace con el nombre listo para escribirse.
        const focus = pendingFocus.value;

        if (focus === null) {
            return;
        }

        pendingFocus.value = null;

        if (focus.kind === 'section') {
            const section = doc.value.find((item) => item.key === focus.key);

            if (section) {
                startRename('section', section.id, section.title);
            }

            return;
        }

        for (const section of doc.value) {
            const container = section.blocks.find(
                (block) => firstField(block)?.key === focus.key,
            );

            if (container) {
                startRename('field', container.id, fieldLabel(container));

                return;
            }
        }
    },
    { immediate: true },
);

/** Código técnico único a partir del nombre; nunca se muestra. */
const keyFor = (value: string): string => {
    const normalized = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const base =
        normalized === '' || !/^[a-z]/.test(normalized)
            ? `elemento_${normalized || 'nuevo'}`
            : normalized;

    return `${base}_${Date.now().toString(36)}`;
};

const requestOptions = (success: string) => ({
    preserveScroll: true,
    onSuccess: () => toast.success(success),
    onError: (errors: Record<string, string>) =>
        toast.error(
            Object.values(errors)[0] ?? 'No se pudo guardar el cambio.',
        ),
});

const addSection = (position: number): void => {
    const key = keyFor('bloque');
    pendingFocus.value = { kind: 'section', key };
    router.post(
        TemplateController.storeSection.url(props.templateId),
        {
            title: 'Nuevo bloque',
            key,
            first_field_label: 'Nuevo campo',
            first_field_key: keyFor('campo'),
            first_field_content_type: 'text',
            position,
        },
        requestOptions('Bloque agregado.'),
    );
};

const addField = (
    sectionId: string,
    position: number,
    contentType: ContentType,
): void => {
    const key = keyFor('campo');
    pendingFocus.value = { kind: 'field', key };
    router.post(
        TemplateController.storeField.url(props.templateId),
        {
            section_id: sectionId,
            position,
            key,
            label: 'Nuevo campo',
            content_type: contentType,
            required: false,
            inherited: false,
            teacher_editable: true,
            ai_enabled: false,
        },
        requestOptions('Campo agregado.'),
    );
};

/** Clic en la paleta: agrega al final del bloque activo (o del último). */
const addFromPalette = (contentType: ContentType): void => {
    const section =
        doc.value.find((item) => item.id === activeSectionId.value) ??
        doc.value[doc.value.length - 1];

    if (!section) {
        toast.error('Agregue primero un bloque.');

        return;
    }

    addField(section.id, section.blocks.length, contentType);
};

const startRename = (
    kind: Editing['kind'],
    id: string,
    value: string,
): void => {
    if (props.readonly) {
        return;
    }

    editing.value = { kind, id };
    renameValue.value = value;
    void focusEditor();
};

const cancelRename = (): void => {
    editing.value = null;
};

const fieldPayload = (
    container: FieldContainer,
    overrides: Partial<TemplateField> = {},
): Record<string, string | boolean> => {
    const field = { ...firstField(container), ...overrides } as TemplateField;

    return {
        block_id: container.id,
        key: field.key,
        label: field.label,
        content_type: field.content_type,
        help: field.help ?? '',
        required: field.required,
        inherited: field.inherited,
        master_source: field.master_source ?? '',
        teacher_editable: field.teacher_editable,
        ai_enabled: field.ai_enabled,
        document_marker: field.document_marker ?? '',
    };
};

const saveField = (
    container: FieldContainer,
    overrides: Partial<TemplateField>,
    success: string,
): void => {
    const field = firstField(container);

    if (!field) {
        return;
    }

    router.patch(
        TemplateController.updateField.url({
            template: props.templateId,
            field: field.id,
        }),
        fieldPayload(container, overrides),
        requestOptions(success),
    );
};

const commitRename = (): void => {
    const current = editing.value;

    if (current === null) {
        return;
    }

    editing.value = null;
    const value = renameValue.value.trim();

    if (value === '') {
        return;
    }

    if (current.kind === 'section') {
        const section = doc.value.find((item) => item.id === current.id);

        if (!section || section.title === value) {
            return;
        }

        section.title = value;
        router.patch(
            TemplateController.updateSection.url({
                template: props.templateId,
                section: section.id,
            }),
            { title: value },
            requestOptions('Bloque renombrado.'),
        );

        return;
    }

    for (const section of doc.value) {
        const container = section.blocks.find(
            (block) => block.id === current.id,
        );

        if (container) {
            if (fieldLabel(container) === value) {
                return;
            }

            saveField(container, { label: value }, 'Campo renombrado.');

            return;
        }
    }
};

const changeType = (container: FieldContainer, contentType: string): void => {
    if (container.content_type === contentType) {
        return;
    }

    saveField(
        container,
        { content_type: contentType },
        `Ahora es ${typeLabel(contentType).toLowerCase()}.`,
    );
};

const openProperties = (container: FieldContainer): void => {
    const field = firstField(container);

    if (field) {
        propertiesSheet.value?.edit(field, container.id);
    }
};

const confirmDeletion = (): void => {
    const target = deletion.value;
    deletion.value = null;

    if (target === null) {
        return;
    }

    if (target.kind === 'section') {
        router.delete(
            TemplateController.destroySection.url({
                template: props.templateId,
                section: target.section.id,
            }),
            requestOptions('Bloque eliminado.'),
        );

        return;
    }

    router.delete(
        TemplateController.destroyBlock.url({
            template: props.templateId,
            block: target.container.id,
        }),
        requestOptions('Campo eliminado.'),
    );
};

const persistSectionOrder = (): void => {
    router.patch(
        TemplateController.reorderSections.url(props.templateId),
        { section_ids: doc.value.map((section) => section.id) },
        requestOptions('Orden guardado.'),
    );
};

const persistFieldOrder = (section: TemplateSection): void => {
    router.patch(
        TemplateController.reorderBlocks.url(props.templateId),
        {
            section_id: section.id,
            block_ids: section.blocks.map((block) => block.id),
        },
        requestOptions('Orden guardado.'),
    );
};

const startDrag = (event: DragEvent, drag: Drag, ghost?: HTMLElement): void => {
    dragging.value = drag;
    event.dataTransfer?.setData('text/plain', drag.kind);

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
    }

    if (ghost && event.dataTransfer) {
        event.dataTransfer.setDragImage(ghost, 16, 16);
    }
};

const startSectionDrag = (event: DragEvent, section: TemplateSection): void => {
    const ghost = (event.currentTarget as HTMLElement | null)?.closest(
        'section',
    );
    startDrag(event, { kind: 'section', id: section.id }, ghost ?? undefined);
};

const startFieldDrag = (
    event: DragEvent,
    section: TemplateSection,
    container: FieldContainer,
): void => {
    const ghost = (event.currentTarget as HTMLElement | null)?.closest(
        'article',
    );
    startDrag(
        event,
        { kind: 'field', sectionId: section.id, id: container.id },
        ghost ?? undefined,
    );
};

const endDrag = (): void => {
    dragging.value = null;
    hoveredZone.value = null;
};

const sectionZoneId = (index: number): string => `section:${index}`;
const fieldZoneId = (sectionId: string, index: number): string =>
    `field:${sectionId}:${index}`;

const acceptsSectionZone = computed(
    () =>
        dragging.value?.kind === 'new-section' ||
        dragging.value?.kind === 'section',
);

/** Un campo cae en cualquier bloque; el servidor lo muda y compacta el origen. */
/** Un campo se reordena dentro de su bloque; los bloques, entre sí. */
const acceptsFieldZone = (sectionId: string): boolean =>
    dragging.value?.kind === 'new-field' ||
    (dragging.value?.kind === 'field' &&
        dragging.value.sectionId === sectionId);

/** Solo las zonas compatibles aceptan el arrastre; el resto deja el cursor en «no». */
const overSectionZone = (event: DragEvent, index: number): void => {
    if (!acceptsSectionZone.value) {
        return;
    }

    event.preventDefault();
    hoveredZone.value = sectionZoneId(index);
};

const overFieldZone = (
    event: DragEvent,
    sectionId: string,
    index: number,
): void => {
    if (!acceptsFieldZone(sectionId)) {
        return;
    }

    event.preventDefault();
    hoveredZone.value = fieldZoneId(sectionId, index);
};

const closeDeletion = (open: boolean): void => {
    if (!open) {
        deletion.value = null;
    }
};

const dropOnSectionZone = (index: number): void => {
    const drag = dragging.value;
    endDrag();

    if (drag?.kind === 'new-section') {
        addSection(index);

        return;
    }

    if (drag?.kind !== 'section') {
        return;
    }

    const from = doc.value.findIndex((section) => section.id === drag.id);

    if (from < 0) {
        return;
    }

    const to = index > from ? index - 1 : index;

    if (to === from) {
        return;
    }

    const [section] = doc.value.splice(from, 1);
    doc.value.splice(to, 0, section);
    persistSectionOrder();
};

const dropOnFieldZone = (section: TemplateSection, index: number): void => {
    const drag = dragging.value;
    endDrag();

    if (drag?.kind === 'new-field') {
        addField(section.id, index, drag.contentType);

        return;
    }

    if (drag?.kind !== 'field' || drag.sectionId !== section.id) {
        return;
    }

    const from = section.blocks.findIndex((block) => block.id === drag.id);

    if (from < 0) {
        return;
    }

    const to = index > from ? index - 1 : index;

    if (to === from) {
        return;
    }

    const [container] = section.blocks.splice(from, 1);
    section.blocks.splice(to, 0, container);
    persistFieldOrder(section);
};
</script>

<template>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <!-- Paleta: arrastre a la hoja o clic para agregar al final del bloque activo. -->
        <aside
            v-if="!readonly"
            class="flex shrink-0 gap-1 overflow-x-auto rounded-xl border bg-card p-2 lg:sticky lg:top-4 lg:w-52 lg:flex-col"
            aria-label="Piezas de la plantilla"
        >
            <p
                class="hidden px-2 pt-1 pb-2 text-xs text-muted-foreground lg:block"
            >
                Arrastre a la hoja o pulse para agregar
            </p>
            <Button
                type="button"
                variant="ghost"
                class="justify-start"
                draggable="true"
                @dragstart="startDrag($event, { kind: 'new-section' })"
                @dragend="endDrag"
                @click="addSection(doc.length)"
            >
                <Heading data-icon="inline-start" aria-hidden="true" />
                Bloque
            </Button>
            <Button
                v-for="piece in PALETTE"
                :key="piece.type"
                type="button"
                variant="ghost"
                class="justify-start"
                draggable="true"
                @dragstart="
                    startDrag($event, {
                        kind: 'new-field',
                        contentType: piece.type,
                    })
                "
                @dragend="endDrag"
                @click="addFromPalette(piece.type)"
            >
                <component
                    :is="piece.icon"
                    data-icon="inline-start"
                    aria-hidden="true"
                />
                {{ piece.label }}
            </Button>
        </aside>

        <div
            class="min-w-0 flex-1 overflow-x-auto rounded-xl bg-muted p-4 sm:p-8"
            :aria-label="
                readonly
                    ? 'Plantilla del sílabo, solo lectura'
                    : 'Hoja del sílabo: arrastre piezas y pulse un título para renombrarlo'
            "
        >
            <div class="doc-page mx-auto">
                <header class="doc-header">
                    <img
                        src="/images/silabo/ueb.jpeg"
                        alt="Universidad Estatal de Bolívar"
                        class="doc-logo-ueb"
                    />
                    <img
                        src="/images/silabo/facultad.jpeg"
                        alt="Facultad"
                        class="doc-logo-facultad"
                    />
                </header>

                <h1 class="doc-title">PROGRAMA DE ASIGNATURA (SÍLABO)</h1>

                <p v-if="doc.length === 0 && readonly" class="doc-empty">
                    La plantilla no tiene bloques.
                </p>
                <p v-else-if="doc.length === 0" class="doc-empty">
                    Arrastre «Bloque» desde la paleta para empezar.
                </p>

                <template
                    v-for="(section, sectionIndex) in doc"
                    :key="section.id"
                >
                    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                    <div
                        v-if="!readonly"
                        class="doc-zone"
                        :class="{
                            'doc-zone-open': acceptsSectionZone,
                            'doc-zone-hover':
                                hoveredZone === sectionZoneId(sectionIndex),
                        }"
                        @dragover="overSectionZone($event, sectionIndex)"
                        @dragleave="hoveredZone = null"
                        @drop.prevent="dropOnSectionZone(sectionIndex)"
                    />

                    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                    <section
                        class="doc-section group/section"
                        :aria-label="`Bloque ${section.title}`"
                        @mouseenter="activeSectionId = section.id"
                        @focusin="activeSectionId = section.id"
                    >
                        <div class="doc-heading-row">
                            <Input
                                v-if="isEditing('section', section.id)"
                                :ref="setEditorRef"
                                v-model="renameValue"
                                class="doc-h2-input"
                                aria-label="Nombre del bloque"
                                placeholder="Ej. Evaluación"
                                @keydown.enter.prevent="commitRename"
                                @keydown.esc.prevent="cancelRename"
                                @blur="commitRename"
                            />
                            <h2 v-else class="doc-h2">
                                <button
                                    v-if="!readonly"
                                    type="button"
                                    class="doc-rename"
                                    :aria-label="`Renombrar ${section.title}`"
                                    @click="
                                        startRename(
                                            'section',
                                            section.id,
                                            section.title,
                                        )
                                    "
                                >
                                    {{ sectionIndex + 1 }}. {{ section.title }}
                                </button>
                                <template v-else>
                                    {{ sectionIndex + 1 }}. {{ section.title }}
                                </template>
                            </h2>

                            <div v-if="!readonly" class="doc-tools">
                                <button
                                    type="button"
                                    class="doc-handle"
                                    draggable="true"
                                    :aria-label="`Arrastrar ${section.title}`"
                                    @dragstart="
                                        startSectionDrag($event, section)
                                    "
                                    @dragend="endDrag"
                                >
                                    <GripVertical aria-hidden="true" />
                                </button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger as-child>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            :aria-label="`Acciones de ${section.title}`"
                                        >
                                            <MoreHorizontal
                                                aria-hidden="true"
                                            />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            @select="
                                                startRename(
                                                    'section',
                                                    section.id,
                                                    section.title,
                                                )
                                            "
                                        >
                                            Renombrar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            variant="destructive"
                                            @select="
                                                deletion = {
                                                    kind: 'section',
                                                    section,
                                                }
                                            "
                                        >
                                            <Trash2 aria-hidden="true" />
                                            Eliminar bloque
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        <p v-if="section.blocks.length === 0" class="doc-empty">
                            {{
                                readonly
                                    ? 'Este bloque no tiene campos.'
                                    : 'Suelte aquí un Texto, una Tabla o una Lista.'
                            }}
                        </p>

                        <template
                            v-for="(container, fieldIndex) in section.blocks"
                            :key="container.id"
                        >
                            <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                            <div
                                v-if="!readonly"
                                class="doc-zone"
                                :class="{
                                    'doc-zone-open': acceptsFieldZone(
                                        section.id,
                                    ),
                                    'doc-zone-hover':
                                        hoveredZone ===
                                        fieldZoneId(section.id, fieldIndex),
                                }"
                                @dragover="
                                    overFieldZone(
                                        $event,
                                        section.id,
                                        fieldIndex,
                                    )
                                "
                                @dragleave="hoveredZone = null"
                                @drop.prevent="
                                    dropOnFieldZone(section, fieldIndex)
                                "
                            />

                            <article
                                class="doc-field group/field"
                                :aria-label="`Campo ${fieldLabel(container)}`"
                            >
                                <div class="doc-heading-row">
                                    <Input
                                        v-if="isEditing('field', container.id)"
                                        :ref="setEditorRef"
                                        v-model="renameValue"
                                        class="doc-h3-input"
                                        aria-label="Nombre del campo"
                                        placeholder="Ej. Criterios de evaluación"
                                        @keydown.enter.prevent="commitRename"
                                        @keydown.esc.prevent="cancelRename"
                                        @blur="commitRename"
                                    />
                                    <h3 v-else class="doc-h3">
                                        <button
                                            v-if="!readonly"
                                            type="button"
                                            class="doc-rename"
                                            :aria-label="`Renombrar ${fieldLabel(container)}`"
                                            @click="
                                                startRename(
                                                    'field',
                                                    container.id,
                                                    fieldLabel(container),
                                                )
                                            "
                                        >
                                            {{ sectionIndex + 1 }}.{{
                                                fieldIndex + 1
                                            }}
                                            {{ fieldLabel(container) }}
                                        </button>
                                        <template v-else>
                                            {{ sectionIndex + 1 }}.{{
                                                fieldIndex + 1
                                            }}
                                            {{ fieldLabel(container) }}
                                        </template>
                                    </h3>

                                    <div v-if="!readonly" class="doc-tools">
                                        <button
                                            type="button"
                                            class="doc-handle"
                                            draggable="true"
                                            :aria-label="`Arrastrar ${fieldLabel(container)}`"
                                            @dragstart="
                                                startFieldDrag(
                                                    $event,
                                                    section,
                                                    container,
                                                )
                                            "
                                            @dragend="endDrag"
                                        >
                                            <GripVertical aria-hidden="true" />
                                        </button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger as-child>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    :aria-label="`Acciones de ${fieldLabel(container)}`"
                                                >
                                                    <MoreHorizontal
                                                        aria-hidden="true"
                                                    />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>
                                                    Tipo de contenido
                                                </DropdownMenuLabel>
                                                <DropdownMenuItem
                                                    v-for="type in blockTypes"
                                                    :key="type.value"
                                                    @select="
                                                        changeType(
                                                            container,
                                                            type.value,
                                                        )
                                                    "
                                                >
                                                    <Check
                                                        aria-hidden="true"
                                                        :class="{
                                                            invisible:
                                                                container.content_type !==
                                                                type.value,
                                                        }"
                                                    />
                                                    {{ type.label }}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    @select="
                                                        openProperties(
                                                            container,
                                                        )
                                                    "
                                                >
                                                    <Settings2
                                                        aria-hidden="true"
                                                    />
                                                    Propiedades
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    variant="destructive"
                                                    @select="
                                                        deletion = {
                                                            kind: 'field',
                                                            section,
                                                            container,
                                                        }
                                                    "
                                                >
                                                    <Trash2
                                                        aria-hidden="true"
                                                    />
                                                    Eliminar campo
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>

                                <table
                                    v-if="container.content_type === 'table'"
                                    class="doc-table"
                                >
                                    <thead>
                                        <tr>
                                            <th
                                                v-for="header in LOREM_TABLE.headers"
                                                :key="header"
                                            >
                                                {{ header }}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr
                                            v-for="(
                                                row, rowIndex
                                            ) in LOREM_TABLE.rows"
                                            :key="rowIndex"
                                        >
                                            <td v-for="cell in row" :key="cell">
                                                {{ cell }}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>

                                <ul
                                    v-else-if="
                                        container.content_type ===
                                        'bulleted_list'
                                    "
                                    class="doc-list doc-list-bullets"
                                >
                                    <li v-for="item in LOREM_ITEMS" :key="item">
                                        {{ item }}
                                    </li>
                                </ul>

                                <ol
                                    v-else-if="
                                        container.content_type ===
                                        'numbered_list'
                                    "
                                    class="doc-list doc-list-numbers"
                                >
                                    <li v-for="item in LOREM_ITEMS" :key="item">
                                        {{ item }}
                                    </li>
                                </ol>

                                <template v-else>
                                    <p
                                        v-for="paragraph in LOREM_PARAGRAPHS"
                                        :key="paragraph"
                                        class="doc-p"
                                    >
                                        {{ paragraph }}
                                    </p>
                                </template>
                            </article>
                        </template>

                        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                        <div
                            v-if="!readonly"
                            class="doc-zone"
                            :class="{
                                'doc-zone-open': acceptsFieldZone(section.id),
                                'doc-zone-hover':
                                    hoveredZone ===
                                    fieldZoneId(
                                        section.id,
                                        section.blocks.length,
                                    ),
                            }"
                            @dragover="
                                overFieldZone(
                                    $event,
                                    section.id,
                                    section.blocks.length,
                                )
                            "
                            @dragleave="hoveredZone = null"
                            @drop.prevent="
                                dropOnFieldZone(section, section.blocks.length)
                            "
                        />
                    </section>
                </template>

                <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                <div
                    v-if="!readonly"
                    class="doc-zone"
                    :class="{
                        'doc-zone-open': acceptsSectionZone,
                        'doc-zone-hover':
                            hoveredZone === sectionZoneId(doc.length),
                    }"
                    @dragover="overSectionZone($event, doc.length)"
                    @dragleave="hoveredZone = null"
                    @drop.prevent="dropOnSectionZone(doc.length)"
                />
            </div>
        </div>

        <TemplateFieldSheet
            v-if="!readonly"
            ref="propertiesSheet"
            :template-id="templateId"
        />

        <Dialog :open="deletion !== null" @update:open="closeDeletion">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {{
                            deletion?.kind === 'section'
                                ? 'Eliminar bloque'
                                : 'Eliminar campo'
                        }}
                    </DialogTitle>
                    <DialogDescription>
                        <template v-if="deletion?.kind === 'section'">
                            Se quitará «{{ deletion.section.title }}» con sus
                            {{ deletion.section.blocks.length }} campos. Los
                            sílabos ya entregados conservan su copia.
                        </template>
                        <template v-else-if="deletion">
                            Se quitará «{{ fieldLabel(deletion.container) }}» de
                            «{{ deletion.section.title }}». Los sílabos ya
                            entregados conservan su copia.
                        </template>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        @click="deletion = null"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        @click="confirmDeletion"
                    >
                        Eliminar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<style scoped>
/*
 * Estándar del sílabo impreso (formato de la carrera, ordenado): hoja carta,
 * márgenes 2.5 cm, Arial 11 pt, interlineado sencillo, 6 pt entre párrafos,
 * títulos numerados en negrita y tablas con cabecera azul institucional.
 * Los colores son fijos porque representan papel, no la interfaz.
 */
.doc-page {
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    box-sizing: border-box;
    color: #000;
    font-family: Arial, 'Liberation Sans', Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.15;
    min-height: 27.94cm;
    padding: clamp(1rem, 6vw, 2.5cm);
    width: min(21.59cm, 100%);
}

.doc-header {
    align-items: center;
    display: flex;
    gap: 1cm;
    justify-content: space-between;
    margin-bottom: 0.8cm;
}

.doc-logo-ueb {
    height: 1.2cm;
    width: auto;
}

.doc-logo-facultad {
    height: 1.5cm;
    width: auto;
}

.doc-title {
    color: #0070c0;
    font-size: 16pt;
    font-weight: 700;
    margin: 0 0 0.6cm;
    text-align: center;
}

.doc-section {
    margin-bottom: 0.3cm;
}

.doc-heading-row {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
}

.doc-h2 {
    font-size: 12pt;
    font-weight: 700;
    margin: 12pt 0 6pt;
}

.doc-h3 {
    font-size: 11pt;
    font-weight: 700;
    margin: 8pt 0 4pt;
}

/* El título se renombra en el sitio: el botón hereda la tipografía del documento. */
.doc-rename {
    background: none;
    border: 0;
    border-radius: 0.25rem;
    color: inherit;
    cursor: text;
    font: inherit;
    margin: 0 -0.25rem;
    padding: 0 0.25rem;
    text-align: left;
}

.doc-rename:hover,
.doc-rename:focus-visible {
    background: #e8f0fe;
    outline: none;
}

.doc-h2-input,
.doc-h3-input {
    color: #000;
    font-family: inherit;
    font-weight: 700;
    margin: 6pt 0;
    max-width: 32rem;
}

.doc-h2-input {
    font-size: 12pt;
}

.doc-h3-input {
    font-size: 11pt;
}

.doc-field {
    margin-bottom: 6pt;
}

.doc-tools {
    align-items: center;
    display: flex;
    flex-shrink: 0;
    gap: 0.125rem;
    opacity: 0;
    transition: opacity 120ms;
}

.group\/section:hover > .doc-heading-row > .doc-tools,
.group\/field:hover > .doc-heading-row > .doc-tools,
.doc-heading-row:focus-within > .doc-tools,
.doc-tools:has([data-state='open']) {
    opacity: 1;
}

.doc-handle {
    background: none;
    border: 0;
    border-radius: 0.25rem;
    color: #595959;
    cursor: grab;
    display: inline-flex;
    padding: 0.25rem;
}

.doc-handle:active {
    cursor: grabbing;
}

.doc-handle svg {
    height: 1rem;
    width: 1rem;
}

/* Zona de soltado: invisible en reposo, se abre mientras se arrastra algo compatible. */
.doc-zone {
    border-top: 2px solid transparent;
    height: 4px;
    margin: 0;
    transition:
        height 120ms,
        border-color 120ms;
}

.doc-zone-open {
    border-top-color: #bcd3ef;
    border-top-style: dashed;
    height: 1.25rem;
    margin: 2pt 0;
}

.doc-zone-hover {
    border-top-color: #0070c0;
    border-top-style: solid;
}

.doc-p {
    margin: 0 0 6pt;
    text-align: left;
}

.doc-empty {
    color: #595959;
    font-style: italic;
    margin: 0 0 6pt;
}

.doc-list {
    margin: 0 0 6pt;
    padding-inline-start: 0.63cm;
}

.doc-list li {
    margin-bottom: 3pt;
    padding-inline-start: 0.1cm;
}

.doc-list-bullets {
    list-style: disc;
}

.doc-list-numbers {
    list-style: decimal;
}

.doc-table {
    border-collapse: collapse;
    font-size: 9pt;
    margin: 0 0 6pt;
    width: 100%;
}

.doc-table th,
.doc-table td {
    border: 1px solid #7f7f7f;
    padding: 3pt 5pt;
    text-align: left;
    vertical-align: top;
}

.doc-table th {
    background: #4f81bd;
    color: #fff;
    font-weight: 700;
}

.doc-table tbody tr:nth-child(even) td {
    background: #dbe5f1;
}
</style>
