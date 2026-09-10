<script setup lang="ts">
import { Pencil, Settings, TableProperties, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';
import type { CSSProperties } from 'vue';
import TemplateBlockCreator from '@/components/domain/configuration/TemplateBlockCreator.vue';
import TemplateDocumentView from '@/components/domain/configuration/TemplateDocumentView.vue';
import TemplateFieldActions from '@/components/domain/configuration/TemplateFieldActions.vue';
import TemplateInsertPopover from '@/components/domain/configuration/TemplateInsertPopover.vue';
import TemplateSectionActions from '@/components/domain/configuration/TemplateSectionActions.vue';
import TemplateTableDesigner from '@/components/domain/configuration/TemplateTableDesigner.vue';
import PaginatedDocument from '@/components/domain/PaginatedDocument.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { defaultDocument, nodesOfType } from '@/lib/templateDocument';
import { templatePreviewFields } from '@/lib/templatePreview';
import { cn } from '@/lib/utils';
import type {
    TemplateAppearance,
    TemplateBuilderProps,
    TemplateFieldContainer,
    TemplateSection,
} from '@/types/configuration';

const props = withDefaults(
    defineProps<{
        template: TemplateBuilderProps['template'];
        appearance: TemplateAppearance;
        blockTypes: TemplateBuilderProps['blockTypes'];
        variables: TemplateBuilderProps['variables'];
        identificationDesign: TemplateBuilderProps['identificationDesign'];
        colorOptions: TemplateBuilderProps['appearanceOptions']['colors'];
        readonly: boolean;
        ribbon?: boolean;
        fixedRibbon?: boolean;
    }>(),
    { ribbon: false },
);

const emit = defineEmits<{ personalize: [] }>();
type Editable = { openEdit: () => void; openDelete: () => void };
type TableDesigner = { start: () => void };
type Selection =
    | { kind: 'document' }
    | { kind: 'section'; sectionId: string }
    | { kind: 'field'; sectionId: string; blockId: string };

const selection = ref<Selection>({ kind: 'document' });
const activeTable = ref<string | null>(null);
const sectionActions = ref<Record<string, Editable>>({});
const fieldActions = ref<Record<string, Editable>>({});
const tableDesigners = ref<Record<string, TableDesigner>>({});

const bindHandle = <T,>(
    collection: Record<string, T>,
    id: string,
    instance: unknown,
): void => {
    if (instance) {
        collection[id] = instance as T;

        return;
    }

    delete collection[id];
};

const selectedSection = computed<TemplateSection | null>(() => {
    const current = selection.value;

    if (current.kind === 'document') {
        return null;
    }

    return (
        props.template.sections.find(
            (section) => section.id === current.sectionId,
        ) ?? null
    );
});

const selectedField = computed<TemplateFieldContainer | null>(() => {
    const current = selection.value;

    if (current.kind !== 'field') {
        return null;
    }

    return (
        selectedSection.value?.blocks.find(
            (block) => block.id === current.blockId,
        ) ?? null
    );
});

const selectionLabel = computed(() => {
    if (selectedField.value) {
        return `Campo · ${selectedField.value.title}`;
    }

    if (selectedSection.value) {
        return `Bloque · ${selectedSection.value.title}`;
    }

    return 'Ningún elemento seleccionado';
});

const variableSamples = computed(() =>
    Object.fromEntries(
        props.variables.map((variable) => [variable.key, variable.sample]),
    ),
);

const titleStyle = computed<CSSProperties>(() => ({
    color: props.appearance.accent_color,
    fontFamily: props.appearance.font_family,
    fontSize: `${props.appearance.title_font_size}pt`,
    fontWeight: props.appearance.title_bold ? '700' : '400',
    fontStyle: props.appearance.title_italic ? 'italic' : 'normal',
    textAlign: props.appearance.title_alignment,
}));

const sectionStyle = computed<CSSProperties>(() => ({
    color: props.appearance.text_color,
    fontFamily: props.appearance.font_family,
    fontSize: `${props.appearance.section_font_size}pt`,
    fontWeight: props.appearance.section_bold ? '700' : '400',
    fontStyle: props.appearance.section_italic ? 'italic' : 'normal',
    textAlign: props.appearance.section_alignment,
}));

const fieldStyle = computed<CSSProperties>(() => ({
    color: props.appearance.text_color,
    fontFamily: props.appearance.font_family,
    fontSize: `${props.appearance.field_font_size}pt`,
}));

const documentFor = (block: TemplateFieldContainer) =>
    block.document ?? defaultDocument(block, props.identificationDesign);
const fieldsFor = (block: TemplateFieldContainer) =>
    templatePreviewFields(block.fields, block.table);
const hasTable = (block: TemplateFieldContainer): boolean =>
    nodesOfType(documentFor(block), 'table').length > 0;

const selectSection = (sectionId: string): void => {
    if (!activeTable.value) {
        selection.value = { kind: 'section', sectionId };
    }
};

const selectField = (sectionId: string, blockId: string): void => {
    if (activeTable.value && activeTable.value !== blockId) {
        return;
    }

    selection.value = { kind: 'field', sectionId, blockId };
};

const updateTableEditing = (
    sectionId: string,
    blockId: string,
    editing: boolean,
): void => {
    if (editing) {
        activeTable.value = blockId;
        selection.value = { kind: 'field', sectionId, blockId };

        return;
    }

    if (activeTable.value === blockId) {
        activeTable.value = null;
    }
};

const sectionSelectionListeners = (sectionId: string) =>
    props.readonly
        ? {}
        : {
              pointerdown: () => selectSection(sectionId),
              keydown: (event: KeyboardEvent) => {
                  if (
                      event.key === 'Enter' &&
                      event.target === event.currentTarget
                  ) {
                      selectSection(sectionId);
                  }
              },
          };

const fieldSelectionListeners = (sectionId: string, blockId: string) =>
    props.readonly
        ? {}
        : {
              pointerdown: (event: PointerEvent) => {
                  event.stopPropagation();
                  selectField(sectionId, blockId);
              },
              keydown: (event: KeyboardEvent) => {
                  if (
                      event.key === 'Enter' &&
                      event.target === event.currentTarget
                  ) {
                      selectField(sectionId, blockId);
                  }
              },
          };
</script>

<template>
    <div
        class="min-w-0"
        :aria-label="
            readonly
                ? 'Plantilla del sílabo, solo lectura'
                : 'Constructor visual de la plantilla del sílabo'
        "
    >
        <Teleport to="body" :disabled="!fixedRibbon">
            <div
                v-if="ribbon && !readonly"
                id="template-editor-ribbon"
                :class="
                    cn(
                        'min-w-0 bg-background/95 backdrop-blur',
                        fixedRibbon
                            ? 'fixed inset-x-0 top-12 z-40 border-b shadow-sm'
                            : 'sticky top-2 z-20 mb-4 rounded-lg border shadow-sm',
                    )
                "
            >
                <div
                    class="flex min-h-14 min-w-0 items-center gap-2 overflow-hidden px-3 py-2 sm:px-5"
                >
                    <div
                        id="template-editor-ribbon-tools"
                        class="flex min-w-0 items-center gap-2 overflow-x-auto"
                    >
                        <template v-if="!activeTable">
                            <template v-if="selectedSection && !selectedField">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    @click="
                                        sectionActions[
                                            selectedSection.id
                                        ]?.openEdit()
                                    "
                                >
                                    <Pencil
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Renombrar bloque
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    class="text-destructive hover:text-destructive"
                                    @click="
                                        sectionActions[
                                            selectedSection.id
                                        ]?.openDelete()
                                    "
                                >
                                    <Trash2
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Eliminar bloque
                                </Button>
                            </template>

                            <template v-if="selectedField && selectedSection">
                                <Button
                                    v-if="hasTable(selectedField)"
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    @click="
                                        tableDesigners[
                                            selectedField.id
                                        ]?.start()
                                    "
                                >
                                    <TableProperties
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Editar tabla
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    @click="
                                        fieldActions[
                                            selectedField.id
                                        ]?.openEdit()
                                    "
                                >
                                    <Pencil
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Editar campo
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    class="text-destructive hover:text-destructive"
                                    @click="
                                        fieldActions[
                                            selectedField.id
                                        ]?.openDelete()
                                    "
                                >
                                    <Trash2
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Eliminar campo
                                </Button>
                            </template>
                        </template>

                        <Badge
                            variant="secondary"
                            class="ms-1 max-w-64 shrink-0 gap-1.5 px-2.5 py-1 font-normal"
                            :title="selectionLabel"
                        >
                            <span class="text-muted-foreground">
                                Selección:
                            </span>
                            <span class="truncate font-medium text-foreground">
                                {{ selectionLabel }}
                            </span>
                        </Badge>
                    </div>

                    <div
                        id="template-editor-ribbon-actions"
                        class="ms-auto flex shrink-0 items-center gap-2"
                    >
                        <Button
                            v-if="!activeTable"
                            type="button"
                            variant="ghost"
                            size="sm"
                            @click="emit('personalize')"
                        >
                            <Settings
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            Documento
                        </Button>
                    </div>
                </div>
            </div>
        </Teleport>

        <div class="min-w-0 overflow-x-auto p-1 pb-4">
            <PaginatedDocument
                :orientation="appearance.orientation"
                :margin-cm="appearance.margin_cm"
                :font-family="appearance.font_family"
                :font-size="appearance.body_font_size"
                :text-color="appearance.text_color"
            >
                <h1
                    class="mb-8 leading-tight"
                    :style="titleStyle"
                    data-page-unit
                    data-page-keep-next
                >
                    PROGRAMA DE ASIGNATURA (SÍLABO)
                </h1>

                <div
                    v-if="template.sections.length === 0"
                    class="flex min-h-80 items-center justify-center"
                    data-page-unit
                >
                    <TemplateBlockCreator
                        v-if="!readonly"
                        :template-id="template.id"
                        :position="0"
                        :block-types="blockTypes"
                        empty
                    />
                    <p v-else class="text-center text-muted-foreground">
                        La plantilla todavía no tiene bloques.
                    </p>
                </div>

                <section
                    v-for="(section, sectionIndex) in template.sections"
                    :key="section.id"
                    class="relative mb-6 rounded-xs outline-offset-4 transition-shadow"
                    :class="{
                        'cursor-pointer outline-2 outline-primary/50':
                            !readonly &&
                            selection.kind === 'section' &&
                            selection.sectionId === section.id,
                    }"
                    :aria-label="`Bloque ${section.title}`"
                    :role="readonly ? undefined : 'button'"
                    :aria-pressed="
                        readonly
                            ? undefined
                            : selection.kind === 'section' &&
                              selection.sectionId === section.id
                    "
                    :tabindex="readonly ? undefined : 0"
                    v-on="sectionSelectionListeners(section.id)"
                >
                    <div v-if="!readonly" class="hidden" aria-hidden="true">
                        <TemplateSectionActions
                            :ref="
                                (instance) =>
                                    bindHandle(
                                        sectionActions,
                                        section.id,
                                        instance,
                                    )
                            "
                            :template-id="template.id"
                            :section="section"
                        />
                        <TemplateFieldActions
                            v-for="block in section.blocks"
                            :key="block.id"
                            :ref="
                                (instance) =>
                                    bindHandle(fieldActions, block.id, instance)
                            "
                            :template-id="template.id"
                            :section-title="section.title"
                            :field="block"
                            :block-types="blockTypes"
                        />
                    </div>

                    <h2
                        :id="`template-section-${section.id}`"
                        class="mb-3 min-w-0 scroll-mt-40 leading-snug"
                        :style="sectionStyle"
                        data-page-unit
                        data-page-keep-next
                        tabindex="-1"
                    >
                        {{ sectionIndex + 1 }}. {{ section.title }}
                    </h2>

                    <p
                        v-if="section.blocks.length === 0"
                        class="mb-3 text-sm text-muted-foreground"
                        data-page-unit
                    >
                        Este bloque todavía no tiene campos.
                    </p>

                    <article
                        v-for="(block, fieldIndex) in section.blocks"
                        :key="block.id"
                        :id="`template-field-${block.id}`"
                        class="relative mb-4 scroll-mt-40 rounded-xs outline-offset-4 transition-shadow"
                        :class="{
                            'cursor-pointer outline-2 outline-primary':
                                !readonly &&
                                selection.kind === 'field' &&
                                selection.blockId === block.id,
                        }"
                        :aria-label="`Campo ${block.title}`"
                        :role="readonly ? undefined : 'button'"
                        :aria-pressed="
                            readonly
                                ? undefined
                                : selection.kind === 'field' &&
                                  selection.blockId === block.id
                        "
                        :tabindex="readonly ? undefined : 0"
                        v-on="fieldSelectionListeners(section.id, block.id)"
                    >
                        <h3
                            v-if="section.blocks.length > 1"
                            class="mb-2 leading-snug font-semibold"
                            :style="fieldStyle"
                            data-page-unit
                            data-page-keep-next
                            tabindex="-1"
                        >
                            {{ sectionIndex + 1 }}.{{ fieldIndex + 1 }}
                            {{ block.title }}
                        </h3>

                        <TemplateTableDesigner
                            v-if="!readonly && hasTable(block)"
                            :ref="
                                (instance) =>
                                    bindHandle(
                                        tableDesigners,
                                        block.id,
                                        instance,
                                    )
                            "
                            :template-id="template.id"
                            :block-id="block.id"
                            :block-title="block.title"
                            :fingerprint="block.fingerprint ?? ''"
                            :document="documentFor(block)"
                            :fields="fieldsFor(block)"
                            :variables="variables"
                            :variable-samples="variableSamples"
                            :layout="block.table"
                            :appearance="appearance"
                            :colors="colorOptions"
                            ribbon-target="#template-editor-ribbon"
                            @activate="selectField(section.id, block.id)"
                            @editing-change="
                                updateTableEditing(section.id, block.id, $event)
                            "
                        />
                        <TemplateDocumentView
                            v-else
                            :document="documentFor(block)"
                            :fields="fieldsFor(block)"
                            :variables="variableSamples"
                            :layout="block.table"
                            :font-family="appearance.font_family"
                            :font-size="appearance.body_font_size"
                            :text-color="appearance.text_color"
                            :text-align="appearance.body_alignment"
                            :table-header-background="
                                appearance.table_header_background
                            "
                            :table-header-color="appearance.table_header_color"
                            preview
                        />
                        <div
                            v-if="
                                !readonly &&
                                !activeTable &&
                                selection.kind === 'field' &&
                                selection.blockId === block.id
                            "
                            class="absolute top-1/2 -right-1 z-10 flex h-5 translate-x-1/2 -translate-y-1/2 items-center justify-center"
                            data-template-insert="content"
                            @pointerdown.stop
                            @click.stop
                        >
                            <TemplateInsertPopover
                                :template-id="template.id"
                                :section-id="section.id"
                                :field-position="fieldIndex + 1"
                                :block-position="sectionIndex + 1"
                                :block-types="blockTypes"
                            />
                        </div>
                    </article>

                    <div
                        v-if="
                            !readonly &&
                            !activeTable &&
                            selection.kind === 'section' &&
                            selection.sectionId === section.id
                        "
                        class="absolute top-1/2 -right-1 z-10 flex h-5 translate-x-1/2 -translate-y-1/2 items-center justify-center"
                        data-template-insert="content"
                        @pointerdown.stop
                        @click.stop
                    >
                        <TemplateInsertPopover
                            :template-id="template.id"
                            :section-id="section.id"
                            :field-position="section.blocks.length"
                            :block-position="sectionIndex + 1"
                            :block-types="blockTypes"
                        />
                    </div>
                </section>
            </PaginatedDocument>
        </div>
    </div>
</template>
