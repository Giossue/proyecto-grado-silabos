<script setup lang="ts">
import { router } from '@inertiajs/vue3';
import {
    Check,
    GripVertical,
    Heading,
    List,
    ListOrdered,
    MoreHorizontal,
    PencilLine,
    Table,
    Trash2,
    Type,
} from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateDesignBlock from '@/components/domain/configuration/TemplateDesignBlock.vue';
import PaginatedDocument from '@/components/domain/PaginatedDocument.vue';
import type { IdentificationCell } from '@/components/domain/syllabus/IdentificationCard.vue';
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { TableLayout } from '@/lib/tableLayout';
import type { DocumentNode, TemplateVariable } from '@/lib/templateDocument';

type TemplateField = {
    id: string;
    block_id: string;
    key: string;
    label: string;
    type?: string;
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
    /** Esquema de la tabla; nulo cuando el campo no es una tabla. */
    table: TableLayout | null;
    document?: DocumentNode | null;
    fingerprint?: string;
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
    /** Ficha de muestra: se llena sola desde la malla y la programación de asignatura. */
    identification: IdentificationCell[][];
    /** Logo de la universidad vigente; el de la facultad depende de cada carrera. */
    institutionLogo: string;
    variables?: TemplateVariable[];
    identificationDesign?: DocumentNode;
}>();

const PALETTE: { type: ContentType; label: string; icon: typeof Type }[] = [
    { type: 'text', label: 'Texto', icon: Type },
    { type: 'table', label: 'Tabla', icon: Table },
    { type: 'bulleted_list', label: 'Lista con viñetas', icon: List },
    { type: 'numbered_list', label: 'Lista numerada', icon: ListOrdered },
];

const doc = ref<TemplateSection[]>([]);
const dragging = ref<Drag | null>(null);
const hoveredZone = ref<string | null>(null);
const newSectionPosition = ref<number | null>(null);
const creatingSection = ref(false);
let beforeDrag: TemplateSection[] | null = null;
let lastPreviewY: number | null = null;
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
const documentEditing = ref(false);
const savingDocument = ref(false);
const discardDocument = ref(false);
const dirtyDesigns = ref<Set<string>>(new Set());
const canDesign = computed(() => !props.readonly && documentEditing.value);
const hasDesignChanges = computed(() => dirtyDesigns.value.size > 0);

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
    container.document
        ? container.title
        : (firstField(container)?.label ?? container.title);

const isEditing = (kind: Editing['kind'], id: string): boolean =>
    editing.value?.kind === kind && editing.value.id === id;

const focusEditor = async (): Promise<void> => {
    await nextTick();
    editorInput.value?.focus();
    editorInput.value?.select();
};

const restoreCreationFocus = (event: Event): void => {
    if (editing.value) {
        event.preventDefault();
        void focusEditor();
    }
};

watch(
    () => props.sections,
    (value) => {
        beforeDrag = null;
        dragging.value = null;
        hoveredZone.value = null;
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
    onError: (errors: Record<string, string>) => {
        // El borrado de sílabos en curso lo confirma el diálogo global (I-32).
        if ('purge_required' in errors) {
            return;
        }

        toast.error(
            Object.values(errors)[0] ?? 'No se pudo guardar el cambio.',
        );
    },
});

const addSection = (position: number): void => {
    if (!canDesign.value || creatingSection.value) {
        return;
    }

    newSectionPosition.value = position;
};

const createSection = (contentType: ContentType): void => {
    const position = newSectionPosition.value;

    if (position === null || !canDesign.value || creatingSection.value) {
        return;
    }

    newSectionPosition.value = null;
    creatingSection.value = true;
    const key = keyFor('bloque');
    pendingFocus.value = { kind: 'section', key };
    router.post(
        TemplateController.storeSection.url(props.templateId),
        {
            title: 'Nuevo bloque',
            key,
            first_field_label: PALETTE.find(
                (piece) => piece.type === contentType,
            )!.label,
            first_field_key: keyFor('campo'),
            first_field_content_type: contentType,
            position: position + 1,
        },
        {
            ...requestOptions('Bloque agregado.'),
            onFinish: () => {
                creatingSection.value = false;
            },
        },
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
            position: position + 1,
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
    if (!canDesign.value) {
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

    if (!field || (container.document && overrides.label)) {
        if (container.document && overrides.label) {
            router.patch(
                TemplateController.updateDocument.url({
                    template: props.templateId,
                    block: container.id,
                }),
                {
                    document: container.document,
                    fingerprint: container.fingerprint,
                    title: overrides.label,
                },
                requestOptions(success),
            );
        }

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

const designEditors = new Map<
    string,
    InstanceType<typeof TemplateDesignBlock>
>();
const setDesignEditor = (
    id: string,
    component: Element | ComponentPublicInstance | null,
) => {
    if (component) {
        designEditors.set(
            id,
            component as InstanceType<typeof TemplateDesignBlock>,
        );
    } else {
        designEditors.delete(id);
    }
};

const setDesignDirty = (id: string, value: boolean): void => {
    const next = new Set(dirtyDesigns.value);

    if (value) {
        next.add(id);
    } else {
        next.delete(id);
    }

    dirtyDesigns.value = next;
};

const startDocumentEditing = (): void => {
    if (props.readonly) {
        return;
    }

    dirtyDesigns.value = new Set();
    documentEditing.value = true;
};

const saveDocument = async (): Promise<boolean> => {
    if (savingDocument.value) {
        return false;
    }

    savingDocument.value = true;

    for (const id of [...dirtyDesigns.value]) {
        const saved = await designEditors.get(id)?.save(true);

        if (!saved) {
            savingDocument.value = false;
            toast.error(
                'No se guardaron todos los cambios. Revise el campo señalado.',
            );

            return false;
        }
    }

    savingDocument.value = false;
    dirtyDesigns.value = new Set();
    toast.success('Documento guardado.');

    return true;
};

const finishDocumentEditing = async (): Promise<void> => {
    if (hasDesignChanges.value && !(await saveDocument())) {
        return;
    }

    documentEditing.value = false;
};

const cancelDocumentEditing = (): void => {
    if (savingDocument.value) {
        return;
    }

    if (hasDesignChanges.value) {
        discardDocument.value = true;

        return;
    }

    documentEditing.value = false;
};

const confirmDiscardDocument = (): void => {
    dirtyDesigns.value = new Set();
    discardDocument.value = false;
    documentEditing.value = false;
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

const orderRequestOptions = () => ({
    ...requestOptions('Orden guardado.'),
    onError: (errors: Record<string, string>) => {
        doc.value = copySections(props.sections);
        requestOptions('Orden guardado.').onError(errors);
    },
    onCancel: () => {
        doc.value = copySections(props.sections);
    },
});

const persistSectionOrder = (): void => {
    router.patch(
        TemplateController.reorderSections.url(props.templateId),
        { section_ids: doc.value.map((section) => section.id) },
        orderRequestOptions(),
    );
};

const persistFieldOrder = (section: TemplateSection): void => {
    router.patch(
        TemplateController.reorderBlocks.url(props.templateId),
        {
            section_id: section.id,
            block_ids: section.blocks.map((block) => block.id),
        },
        orderRequestOptions(),
    );
};

const startDrag = (event: DragEvent, drag: Drag, ghost?: HTMLElement): void => {
    if (!canDesign.value) {
        event.preventDefault();

        return;
    }

    beforeDrag = copySections(doc.value);
    lastPreviewY = null;
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
    if (beforeDrag) {
        doc.value = beforeDrag;
    }

    beforeDrag = null;
    lastPreviewY = null;
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
    previewSection(index);
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
    const section = doc.value.find((item) => item.id === sectionId);

    if (section) {
        previewField(section, index);
    }
};

const previewSection = (index: number): void => {
    const drag = dragging.value;

    if (drag?.kind !== 'section') {
        return;
    }

    const from = doc.value.findIndex((section) => section.id === drag.id);
    const to = index > from ? index - 1 : index;

    if (from < 0 || from === to) {
        return;
    }

    const [section] = doc.value.splice(from, 1);
    doc.value.splice(to, 0, section);
};

const previewField = (section: TemplateSection, index: number): void => {
    const drag = dragging.value;

    if (drag?.kind !== 'field' || drag.sectionId !== section.id) {
        return;
    }

    const from = section.blocks.findIndex((block) => block.id === drag.id);
    const to = index > from ? index - 1 : index;

    if (from < 0 || from === to) {
        return;
    }

    const [block] = section.blocks.splice(from, 1);
    section.blocks.splice(to, 0, block);
};

/** Whole pieces are targets; no need to aim at a thin line. */
const overPiece = (
    event: DragEvent,
    section: TemplateSection,
    container?: FieldContainer,
): void => {
    const drag = dragging.value;
    const compatible = container
        ? acceptsFieldZone(section.id)
        : acceptsSectionZone.value;

    if (!compatible || !drag) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (
        (drag.kind === 'section' && drag.id === section.id) ||
        (drag.kind === 'field' && drag.id === container?.id)
    ) {
        return;
    }

    // Reflow under a stationary pointer must not alternate the order indefinitely.
    if (lastPreviewY !== null && Math.abs(event.clientY - lastPreviewY) < 4) {
        return;
    }

    lastPreviewY = event.clientY;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2 ? 1 : 0;

    if (container) {
        overFieldZone(
            event,
            section.id,
            section.blocks.findIndex((item) => item.id === container.id) +
                after,
        );
    } else {
        overSectionZone(
            event,
            doc.value.findIndex((item) => item.id === section.id) + after,
        );
    }
};

const commitPreview = (): void => {
    const drag = dragging.value;
    const original = beforeDrag;
    beforeDrag = null;
    endDrag();

    if (!original) {
        return;
    }

    if (drag?.kind === 'section') {
        if (
            doc.value.some(
                (section, index) => section.id !== original[index]?.id,
            )
        ) {
            persistSectionOrder();
        }
    } else if (drag?.kind === 'field') {
        const section = doc.value.find((item) => item.id === drag.sectionId);
        const previous = original.find((item) => item.id === drag.sectionId);

        if (
            section &&
            section.blocks.some(
                (block, index) => block.id !== previous?.blocks[index]?.id,
            )
        ) {
            persistFieldOrder(section);
        }
    }
};

const dropOnPiece = (
    event: DragEvent,
    section: TemplateSection,
    container?: FieldContainer,
): void => {
    if (
        !(container ? acceptsFieldZone(section.id) : acceptsSectionZone.value)
    ) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    const zone = hoveredZone.value;

    if (dragging.value?.kind === 'new-section') {
        dropOnSectionZone(
            zone
                ? Number(zone.split(':').at(-1))
                : doc.value.findIndex((item) => item.id === section.id),
        );
    } else if (dragging.value?.kind === 'new-field') {
        dropOnFieldZone(
            section,
            zone ? Number(zone.split(':').at(-1)) : section.blocks.length,
        );
    } else {
        commitPreview();
    }
};

const closeDeletion = (open: boolean): void => {
    if (!open) {
        deletion.value = null;
    }
};

const dropOnSectionZone = (index: number): void => {
    const drag = dragging.value;

    if (drag?.kind === 'new-section') {
        endDrag();
        addSection(index);

        return;
    }

    commitPreview();
};

const dropOnFieldZone = (section: TemplateSection, index: number): void => {
    const drag = dragging.value;

    if (drag?.kind === 'new-field') {
        endDrag();
        addField(section.id, index, drag.contentType);

        return;
    }

    commitPreview();
};
</script>

<template>
    <div class="flex flex-col gap-4">
        <div
            v-if="!readonly"
            class="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-2 shadow-sm backdrop-blur"
            role="toolbar"
            aria-label="Edición de la plantilla"
        >
            <template v-if="!documentEditing">
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium">Diseño de la plantilla</p>
                    <p class="text-xs text-muted-foreground">
                        Active la edición para modificar toda la hoja.
                    </p>
                </div>
                <Button type="button" @click="startDocumentEditing">
                    <PencilLine data-icon="inline-start" />
                    Editar documento
                </Button>
            </template>
            <template v-else>
                <div class="min-w-48 flex-1">
                    <p class="text-sm font-medium">Editando el documento</p>
                    <p class="text-xs text-muted-foreground" role="status">
                        {{
                            savingDocument
                                ? 'Guardando cambios…'
                                : hasDesignChanges
                                  ? 'Hay cambios sin guardar'
                                  : 'Clic derecho sobre el contenido para ver sus herramientas'
                        }}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    :disabled="savingDocument"
                    @click="cancelDocumentEditing"
                >
                    Cancelar
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    :disabled="savingDocument || !hasDesignChanges"
                    @click="saveDocument"
                >
                    {{ savingDocument ? 'Guardando…' : 'Guardar' }}
                </Button>
                <Button
                    type="button"
                    :disabled="savingDocument"
                    @click="finishDocumentEditing"
                >
                    <Check data-icon="inline-start" />
                    Finalizar edición
                </Button>
            </template>
        </div>

        <div
            class="flex flex-col gap-4 lg:flex-row lg:items-start"
            :class="{
                'doc-new-piece':
                    dragging?.kind === 'new-section' ||
                    dragging?.kind === 'new-field',
            }"
        >
            <!-- Paleta: arrastre a la hoja o clic para agregar al final del bloque activo. -->
            <aside
                v-if="canDesign"
                class="sticky top-[calc(5rem+env(safe-area-inset-top))] z-20 flex max-h-[calc(100dvh-6rem-env(safe-area-inset-top))] w-full shrink-0 flex-wrap gap-1 overflow-auto rounded-xl border bg-card p-2 lg:w-52 lg:flex-col lg:flex-nowrap"
                aria-label="Piezas de la plantilla"
            >
                <p class="w-full px-2 pt-1 pb-2 text-xs text-muted-foreground">
                    Arrastre a la hoja o pulse para agregar
                </p>
                <Button
                    type="button"
                    variant="ghost"
                    class="justify-start"
                    draggable="true"
                    :disabled="creatingSection"
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
                class="min-w-0 flex-1 overflow-x-auto p-1"
                :aria-label="
                    readonly
                        ? 'Plantilla del sílabo, solo lectura'
                        : canDesign
                          ? 'Documento del sílabo en edición'
                          : 'Vista previa de la plantilla del sílabo'
                "
            >
                <PaginatedDocument>
                    <header
                        class="doc-header"
                        data-page-unit
                        data-page-keep-next
                    >
                        <img
                            :src="institutionLogo"
                            alt="Universidad Estatal de Bolívar"
                            class="doc-logo-ueb"
                        />
                        <!-- El logo de la facultad lo pone cada carrera en su sílabo. -->
                        <span class="doc-logo-facultad-placeholder">
                            Logo de la facultad de la carrera
                        </span>
                    </header>

                    <h1 class="doc-title" data-page-unit>
                        PROGRAMA DE ASIGNATURA (SÍLABO)
                    </h1>

                    <p
                        v-if="doc.length === 0 && readonly"
                        class="doc-empty"
                        data-page-unit
                    >
                        La plantilla no tiene bloques.
                    </p>
                    <p
                        v-else-if="doc.length === 0"
                        class="doc-empty"
                        data-page-unit
                    >
                        Arrastre «Bloque» desde la paleta para empezar.
                    </p>

                    <template
                        v-for="(section, sectionIndex) in doc"
                        :key="section.id"
                    >
                        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                        <div
                            v-if="canDesign"
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
                            :class="{
                                'doc-drag-source':
                                    dragging?.kind === 'section' &&
                                    dragging.id === section.id,
                            }"
                            :aria-label="`Bloque ${section.title}`"
                            @dragover="overPiece($event, section)"
                            @drop="dropOnPiece($event, section)"
                            @mouseenter="activeSectionId = section.id"
                            @focusin="activeSectionId = section.id"
                        >
                            <div
                                class="doc-heading-row"
                                data-page-unit
                                data-page-keep-next
                            >
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
                                        v-if="canDesign"
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
                                        {{ sectionIndex + 1 }}.
                                        {{ section.title }}
                                    </button>
                                    <template v-else>
                                        {{ sectionIndex + 1 }}.
                                        {{ section.title }}
                                    </template>
                                </h2>

                                <div v-if="canDesign" class="doc-tools">
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

                            <p
                                v-if="section.blocks.length === 0"
                                class="doc-empty"
                                data-page-unit
                            >
                                {{
                                    readonly
                                        ? 'Este bloque no tiene campos.'
                                        : 'Suelte aquí un Texto, una Tabla o una Lista.'
                                }}
                            </p>

                            <template
                                v-for="(
                                    container, fieldIndex
                                ) in section.blocks"
                                :key="container.id"
                            >
                                <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                                <div
                                    v-if="canDesign"
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

                                <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                                <article
                                    class="doc-field group/field"
                                    :class="{
                                        'doc-drag-source':
                                            dragging?.kind === 'field' &&
                                            dragging.id === container.id,
                                    }"
                                    :aria-label="`Campo ${fieldLabel(container)}`"
                                    @dragover="
                                        overPiece($event, section, container)
                                    "
                                    @drop="
                                        dropOnPiece($event, section, container)
                                    "
                                >
                                    <div
                                        class="doc-heading-row"
                                        data-page-unit
                                        data-page-keep-next
                                        :class="{
                                            'doc-heading-row-compact':
                                                section.blocks.length === 1 &&
                                                !isEditing(
                                                    'field',
                                                    container.id,
                                                ),
                                        }"
                                    >
                                        <Input
                                            v-if="
                                                isEditing('field', container.id)
                                            "
                                            :ref="setEditorRef"
                                            v-model="renameValue"
                                            class="doc-h3-input"
                                            aria-label="Nombre del campo"
                                            placeholder="Ej. Criterios de evaluación"
                                            @keydown.enter.prevent="
                                                commitRename
                                            "
                                            @keydown.esc.prevent="cancelRename"
                                            @blur="commitRename"
                                        />
                                        <!-- Un solo campo en la sección: basta el título de la sección. -->
                                        <h3
                                            v-else-if="
                                                section.blocks.length > 1
                                            "
                                            class="doc-h3"
                                        >
                                            <button
                                                v-if="canDesign"
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
                                        <span v-else class="doc-h3-spacer" />

                                        <div v-if="canDesign" class="doc-tools">
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
                                                <GripVertical
                                                    aria-hidden="true"
                                                />
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
                                                <DropdownMenuContent
                                                    align="end"
                                                >
                                                    <DropdownMenuItem
                                                        @select="
                                                            designEditors
                                                                .get(
                                                                    container.id,
                                                                )
                                                                ?.openProperties()
                                                        "
                                                    >
                                                        Propiedades
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
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

                                    <TemplateDesignBlock
                                        :ref="
                                            (component) =>
                                                setDesignEditor(
                                                    container.id,
                                                    component,
                                                )
                                        "
                                        :template-id="templateId"
                                        :block="container"
                                        :identification="
                                            identificationDesign ?? {
                                                type: 'doc',
                                                content: [
                                                    { type: 'paragraph' },
                                                ],
                                            }
                                        "
                                        :variables="variables ?? []"
                                        :readonly="readonly"
                                        :editing="canDesign"
                                        @dirty="
                                            setDesignDirty(container.id, $event)
                                        "
                                    />
                                </article>
                            </template>

                            <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                            <div
                                v-if="canDesign"
                                class="doc-zone"
                                :class="{
                                    'doc-zone-open': acceptsFieldZone(
                                        section.id,
                                    ),
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
                                    dropOnFieldZone(
                                        section,
                                        section.blocks.length,
                                    )
                                "
                            />
                        </section>
                    </template>

                    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                    <div
                        v-if="canDesign"
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
                </PaginatedDocument>
            </div>
        </div>

        <Dialog
            :open="newSectionPosition !== null"
            @update:open="
                (open) => {
                    if (!open) newSectionPosition = null;
                }
            "
        >
            <DialogContent @close-auto-focus="restoreCreationFocus">
                <DialogHeader>
                    <DialogTitle>Primer campo del bloque</DialogTitle>
                    <DialogDescription
                        >Elija con qué contenido empezará el bloque. Después
                        podrá agregar más campos y cambiar su
                        nombre.</DialogDescription
                    >
                </DialogHeader>
                <div class="grid gap-2 sm:grid-cols-2">
                    <Button
                        v-for="piece in PALETTE"
                        :key="piece.type"
                        type="button"
                        variant="outline"
                        :disabled="creatingSection"
                        @click="createSection(piece.type)"
                    >
                        <component
                            :is="piece.icon"
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        {{ piece.label }}
                    </Button>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        @click="newSectionPosition = null"
                        >Cancelar</Button
                    >
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="discardDocument">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle
                        >¿Descartar los cambios del documento?</DialogTitle
                    >
                    <DialogDescription>
                        Se recuperará el último diseño guardado. Los cambios
                        estructurales que ya se enviaron al servidor se
                        conservan.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        @click="discardDocument = false"
                    >
                        Seguir editando
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        @click="confirmDiscardDocument"
                    >
                        <Trash2 data-icon="inline-start" aria-hidden="true" />
                        Descartar cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

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
                        <Trash2 data-icon="inline-start" aria-hidden="true" />
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

.doc-logo-facultad-placeholder {
    align-items: center;
    border: 1px dashed #7f7f7f;
    color: #595959;
    display: inline-flex;
    font-size: 8pt;
    height: 1.2cm;
    justify-content: center;
    padding: 0 0.4cm;
    text-align: center;
    width: 4cm;
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

.doc-h3-spacer {
    flex: 1;
}

/* Sin subtítulo: las herramientas flotan a la derecha sin ocupar altura. */
.doc-heading-row-compact {
    height: 0;
    justify-content: flex-end;
    margin: 0;
    overflow: visible;
}

.doc-heading-row-compact > .doc-tools {
    position: relative;
    top: -4pt;
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
    height: 8px;
}

.doc-zone-hover {
    border-top-color: transparent;
}

.doc-new-piece .doc-zone-hover {
    align-items: center;
    background: #e8f0fe;
    border: 1px dashed #0070c0;
    border-radius: 4px;
    display: flex;
    height: 80px;
    justify-content: center;
}

.doc-new-piece .doc-zone-hover::after {
    color: #365f91;
    content: 'Soltar aquí';
    font-size: 10pt;
}

.doc-drag-source {
    opacity: 0.35;
}

.doc-empty {
    color: #595959;
    font-style: italic;
    margin: 0 0 6pt;
}
</style>
