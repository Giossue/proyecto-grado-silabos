<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import TemplateBlockCreator from '@/components/domain/configuration/TemplateBlockCreator.vue';
import TemplateDocumentView from '@/components/domain/configuration/TemplateDocumentView.vue';
import TemplateFieldCreator from '@/components/domain/configuration/TemplateFieldCreator.vue';
import TemplateTableDesigner from '@/components/domain/configuration/TemplateTableDesigner.vue';
import PaginatedDocument from '@/components/domain/PaginatedDocument.vue';
import { defaultDocument, nodesOfType } from '@/lib/templateDocument';
import { templatePreviewFields } from '@/lib/templatePreview';
import type {
    TemplateAppearance,
    TemplateBuilderProps,
    TemplateFieldContainer,
} from '@/types/configuration';

const props = defineProps<{
    template: TemplateBuilderProps['template'];
    appearance: TemplateAppearance;
    blockTypes: TemplateBuilderProps['blockTypes'];
    variables: TemplateBuilderProps['variables'];
    identificationDesign: TemplateBuilderProps['identificationDesign'];
    colorOptions: TemplateBuilderProps['appearanceOptions']['colors'];
    readonly: boolean;
}>();

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
</script>

<template>
    <div
        class="min-w-0 overflow-x-auto p-1 pb-4"
        :aria-label="
            readonly
                ? 'Plantilla del sílabo, solo lectura'
                : 'Constructor visual de la plantilla del sílabo'
        "
    >
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

            <template
                v-for="(section, sectionIndex) in template.sections"
                :key="section.id"
            >
                <section
                    class="group/template-section mb-6"
                    :aria-label="`Bloque ${section.title}`"
                >
                    <div
                        class="relative mb-3"
                        data-page-unit
                        data-page-keep-next
                    >
                        <h2
                            class="min-w-0 leading-snug"
                            :style="sectionStyle"
                        >
                            {{ sectionIndex + 1 }}. {{ section.title }}
                        </h2>
                        <div
                            v-if="!readonly"
                            class="template-section-actions absolute top-0 z-10 flex flex-col gap-1 opacity-0 transition-opacity group-hover/template-section:opacity-100 group-focus-within/template-section:opacity-100"
                            :aria-label="`Acciones del bloque ${section.title}`"
                        >
                            <TemplateFieldCreator
                                :template-id="template.id"
                                :section-id="section.id"
                                :position="section.blocks.length"
                                :block-types="blockTypes"
                            />
                            <TemplateBlockCreator
                                :template-id="template.id"
                                :position="sectionIndex + 1"
                                :block-types="blockTypes"
                            />
                        </div>
                    </div>

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
                        class="mb-4"
                        :aria-label="`Campo ${block.title}`"
                    >
                        <h3
                            v-if="section.blocks.length > 1"
                            class="mb-2 leading-snug font-semibold"
                            :style="fieldStyle"
                            data-page-unit
                            data-page-keep-next
                        >
                            {{ sectionIndex + 1 }}.{{ fieldIndex + 1 }}
                            {{ block.title }}
                        </h3>
                        <TemplateTableDesigner
                            v-if="!readonly && hasTable(block)"
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
                    </article>
                </section>
            </template>
        </PaginatedDocument>
    </div>
</template>

<style scoped>
.template-section-actions {
    right: calc(-1 * var(--page-margin) + 2rem);
}
</style>
