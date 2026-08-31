<script setup lang="ts">
import { Form, router } from '@inertiajs/vue3';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from '@lucide/vue';
import { ref, watch } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateBlockAddForm from '@/components/domain/configuration/TemplateBlockAddForm.vue';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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
import { Spinner } from '@/components/ui/spinner';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

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

type FieldContainer = {
    id: string;
    title: string;
    content_type: string;
    fields: TemplateField[];
};

type TemplateSection = {
    id: string;
    title: string;
    description: string | null;
    blocks: FieldContainer[];
};

const props = defineProps<{
    templateVersionId: string;
    sections: TemplateSection[];
    blockTypes: { value: string; label: string }[];
}>();

const builderBlocks = ref<TemplateSection[]>([]);
const addingFieldIn = ref<string | null>(null);
const addingBlockAt = ref<number | null>(null);
const fieldNames = ref<Record<string, string>>({});
const fieldTypes = ref<Record<string, string>>({});
const draggedBlockId = ref<string | null>(null);
const draggedField = ref<{ sectionId: string; id: string } | null>(null);

const copySections = (value: TemplateSection[]): TemplateSection[] =>
    value.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => ({
            ...block,
            fields: block.fields.map((field) => ({ ...field })),
        })),
    }));

watch(
    () => props.sections,
    (value) => {
        builderBlocks.value = copySections(value);
    },
    { immediate: true },
);

const keyFor = (value: string): string => {
    const normalized = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized === '' || !/^[a-z]/.test(normalized)
        ? `elemento_${normalized || 'nuevo'}`
        : normalized;
};

const firstField = (container: FieldContainer): TemplateField | null =>
    container.fields[0] ?? null;

const persistBlockOrder = (): void => {
    router.patch(
        TemplateController.reorderSections.url(props.templateVersionId),
        { section_ids: builderBlocks.value.map((section) => section.id) },
        { preserveScroll: true },
    );
};

const moveBlock = (id: string, direction: -1 | 1): void => {
    const from = builderBlocks.value.findIndex((section) => section.id === id);
    const to = from + direction;

    if (from < 0 || to < 0 || to >= builderBlocks.value.length) {
        return;
    }

    const [section] = builderBlocks.value.splice(from, 1);
    builderBlocks.value.splice(to, 0, section);
    persistBlockOrder();
};

const dropBlock = (targetId: string): void => {
    const sourceId = draggedBlockId.value;
    draggedBlockId.value = null;

    if (sourceId === null || sourceId === targetId) {
        return;
    }

    const from = builderBlocks.value.findIndex(
        (section) => section.id === sourceId,
    );
    const to = builderBlocks.value.findIndex(
        (section) => section.id === targetId,
    );

    if (from < 0 || to < 0) {
        return;
    }

    const [section] = builderBlocks.value.splice(from, 1);
    builderBlocks.value.splice(to, 0, section);
    persistBlockOrder();
};

const deleteBlock = (section: TemplateSection): void => {
    router.delete(
        TemplateController.destroySection.url({
            version: props.templateVersionId,
            section: section.id,
        }),
        { preserveScroll: true },
    );
};

const persistFieldOrder = (section: TemplateSection): void => {
    router.patch(
        TemplateController.reorderBlocks.url(props.templateVersionId),
        {
            section_id: section.id,
            block_ids: section.blocks.map((field) => field.id),
        },
        { preserveScroll: true },
    );
};

const moveField = (
    section: TemplateSection,
    id: string,
    direction: -1 | 1,
): void => {
    const from = section.blocks.findIndex((field) => field.id === id);
    const to = from + direction;

    if (from < 0 || to < 0 || to >= section.blocks.length) {
        return;
    }

    const [field] = section.blocks.splice(from, 1);
    section.blocks.splice(to, 0, field);
    persistFieldOrder(section);
};

const dropField = (section: TemplateSection, targetId: string): void => {
    const source = draggedField.value;
    draggedField.value = null;

    if (
        source === null ||
        source.sectionId !== section.id ||
        source.id === targetId
    ) {
        return;
    }

    const from = section.blocks.findIndex((field) => field.id === source.id);
    const to = section.blocks.findIndex((field) => field.id === targetId);

    if (from < 0 || to < 0) {
        return;
    }

    const [field] = section.blocks.splice(from, 1);
    section.blocks.splice(to, 0, field);
    persistFieldOrder(section);
};

const deleteField = (container: FieldContainer): void => {
    router.delete(
        TemplateController.destroyBlock.url({
            version: props.templateVersionId,
            block: container.id,
        }),
        { preserveScroll: true },
    );
};

const addBlockAt = (position: number): void => {
    addingBlockAt.value = position;
};

const closeBlockForm = (): void => {
    addingBlockAt.value = null;
};
</script>

<template>
    <TooltipProvider>
        <div class="flex flex-col">
            <template
                v-for="(section, sectionIndex) in builderBlocks"
                :key="section.id"
            >
                <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                <section
                    draggable="true"
                    role="group"
                    :aria-label="`Bloque ${section.title}`"
                    @dragend="draggedBlockId = null"
                    @dragover.prevent
                    @dragstart="draggedBlockId = section.id"
                    @drop.prevent="dropBlock(section.id)"
                >
                    <Card>
                        <CardHeader>
                            <Form
                                v-bind="
                                    TemplateController.updateSection.form({
                                        version: templateVersionId,
                                        section: section.id,
                                    })
                                "
                                :options="{ preserveScroll: true }"
                                v-slot="{ errors, processing }"
                            >
                                <div
                                    class="flex items-center justify-between gap-3"
                                >
                                    <div
                                        class="flex items-center gap-2 text-sm text-muted-foreground"
                                    >
                                        <GripVertical aria-hidden="true" />
                                        Arrastre para reordenar el bloque
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="ghost"
                                            :aria-label="`Subir ${section.title}`"
                                            :disabled="sectionIndex === 0"
                                            @click="moveBlock(section.id, -1)"
                                        >
                                            <ArrowUp aria-hidden="true" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="ghost"
                                            :aria-label="`Bajar ${section.title}`"
                                            :disabled="
                                                sectionIndex ===
                                                builderBlocks.length - 1
                                            "
                                            @click="moveBlock(section.id, 1)"
                                        >
                                            <ArrowDown aria-hidden="true" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="ghost"
                                            :aria-label="`Eliminar ${section.title}`"
                                            @click="deleteBlock(section)"
                                        >
                                            <Trash2 aria-hidden="true" />
                                        </Button>
                                    </div>
                                </div>
                                <FieldGroup class="mt-4">
                                    <Field
                                        :data-invalid="Boolean(errors.title)"
                                    >
                                        <FieldLabel
                                            :for="`block-name-${section.id}`"
                                            required
                                            >Nombre del bloque</FieldLabel
                                        >
                                        <Input
                                            :id="`block-name-${section.id}`"
                                            name="title"
                                            :default-value="section.title"
                                            placeholder="Ej. Evaluación"
                                            required
                                            :aria-invalid="
                                                Boolean(errors.title)
                                            "
                                        />
                                        <FieldError :errors="[errors.title]" />
                                    </Field>
                                </FieldGroup>
                                <div class="mt-4 flex justify-end">
                                    <Button
                                        type="submit"
                                        size="sm"
                                        :disabled="processing"
                                        ><Spinner v-if="processing" />Guardar
                                        bloque</Button
                                    >
                                </div>
                            </Form>
                            <CardDescription v-if="section.description">{{
                                section.description
                            }}</CardDescription>
                        </CardHeader>
                        <CardContent class="flex flex-col gap-4">
                            <CardTitle class="text-base">Campos</CardTitle>
                            <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                            <article
                                v-for="(
                                    container, fieldIndex
                                ) in section.blocks"
                                :key="container.id"
                                draggable="true"
                                role="group"
                                :aria-label="`Campo ${firstField(container)?.label ?? ''}`"
                                class="rounded-lg border bg-muted/20 p-4"
                                @dragend="draggedField = null"
                                @dragover.prevent
                                @dragstart="
                                    draggedField = {
                                        sectionId: section.id,
                                        id: container.id,
                                    }
                                "
                                @drop.prevent="dropField(section, container.id)"
                            >
                                <Form
                                    v-if="firstField(container)"
                                    v-bind="
                                        TemplateController.updateField.form({
                                            version: templateVersionId,
                                            field:
                                                firstField(container)?.id ?? '',
                                        })
                                    "
                                    :options="{ preserveScroll: true }"
                                    v-slot="{ errors, processing }"
                                >
                                    <input
                                        type="hidden"
                                        name="block_id"
                                        :value="container.id"
                                    />
                                    <input
                                        type="hidden"
                                        name="key"
                                        :value="firstField(container)?.key"
                                    />
                                    <input
                                        type="hidden"
                                        name="inherited"
                                        :value="
                                            firstField(container)?.inherited
                                                ? '1'
                                                : '0'
                                        "
                                    />
                                    <input
                                        type="hidden"
                                        name="required"
                                        :value="
                                            firstField(container)?.required
                                                ? '1'
                                                : '0'
                                        "
                                    />
                                    <input
                                        type="hidden"
                                        name="help"
                                        :value="
                                            firstField(container)?.help ?? ''
                                        "
                                    />
                                    <input
                                        type="hidden"
                                        name="master_source"
                                        :value="
                                            firstField(container)
                                                ?.master_source ?? ''
                                        "
                                    />
                                    <input
                                        type="hidden"
                                        name="teacher_editable"
                                        :value="
                                            firstField(container)
                                                ?.teacher_editable
                                                ? '1'
                                                : '0'
                                        "
                                    />
                                    <input
                                        type="hidden"
                                        name="ai_enabled"
                                        :value="
                                            firstField(container)?.ai_enabled
                                                ? '1'
                                                : '0'
                                        "
                                    />
                                    <input
                                        type="hidden"
                                        name="document_marker"
                                        :value="
                                            firstField(container)
                                                ?.document_marker ?? ''
                                        "
                                    />
                                    <div
                                        class="mb-4 flex items-center justify-between gap-3"
                                    >
                                        <div
                                            class="flex items-center gap-2 text-sm text-muted-foreground"
                                        >
                                            <GripVertical
                                                aria-hidden="true"
                                            />Arrastre para reordenar el campo
                                        </div>
                                        <div class="flex items-center gap-1">
                                            <Button
                                                type="button"
                                                size="icon-sm"
                                                variant="ghost"
                                                :aria-label="`Subir ${firstField(container)?.label}`"
                                                :disabled="fieldIndex === 0"
                                                @click="
                                                    moveField(
                                                        section,
                                                        container.id,
                                                        -1,
                                                    )
                                                "
                                                ><ArrowUp aria-hidden="true"
                                            /></Button>
                                            <Button
                                                type="button"
                                                size="icon-sm"
                                                variant="ghost"
                                                :aria-label="`Bajar ${firstField(container)?.label}`"
                                                :disabled="
                                                    fieldIndex ===
                                                    section.blocks.length - 1
                                                "
                                                @click="
                                                    moveField(
                                                        section,
                                                        container.id,
                                                        1,
                                                    )
                                                "
                                                ><ArrowDown aria-hidden="true"
                                            /></Button>
                                            <Button
                                                type="button"
                                                size="icon-sm"
                                                variant="ghost"
                                                :aria-label="`Eliminar ${firstField(container)?.label}`"
                                                @click="deleteField(container)"
                                                ><Trash2 aria-hidden="true"
                                            /></Button>
                                        </div>
                                    </div>
                                    <FieldGroup>
                                        <Field
                                            :data-invalid="
                                                Boolean(errors.label)
                                            "
                                        >
                                            <FieldLabel
                                                :for="`field-name-${container.id}`"
                                                required
                                                >Nombre del campo</FieldLabel
                                            >
                                            <Input
                                                :id="`field-name-${container.id}`"
                                                name="label"
                                                :default-value="
                                                    firstField(container)?.label
                                                "
                                                placeholder="Ej. Criterios de evaluación"
                                                required
                                                :aria-invalid="
                                                    Boolean(errors.label)
                                                "
                                            />
                                            <FieldError
                                                :errors="[errors.label]"
                                            />
                                        </Field>
                                        <Field
                                            :data-invalid="
                                                Boolean(errors.content_type)
                                            "
                                        >
                                            <FieldLabel
                                                :for="`field-type-${container.id}`"
                                                required
                                                >Tipo de contenido</FieldLabel
                                            >
                                            <Select
                                                name="content_type"
                                                required
                                                :default-value="
                                                    container.content_type
                                                "
                                            >
                                                <SelectTrigger
                                                    :id="`field-type-${container.id}`"
                                                    :aria-invalid="
                                                        Boolean(
                                                            errors.content_type,
                                                        )
                                                    "
                                                    ><SelectValue
                                                /></SelectTrigger>
                                                <SelectContent
                                                    ><SelectGroup
                                                        ><SelectItem
                                                            v-for="type in blockTypes"
                                                            :key="type.value"
                                                            :value="type.value"
                                                            >{{
                                                                type.label
                                                            }}</SelectItem
                                                        ></SelectGroup
                                                    ></SelectContent
                                                >
                                            </Select>
                                            <FieldError
                                                :errors="[errors.content_type]"
                                            />
                                        </Field>
                                    </FieldGroup>
                                    <div class="mt-4 flex justify-end">
                                        <Button
                                            type="submit"
                                            size="sm"
                                            :disabled="processing"
                                            ><Spinner
                                                v-if="processing"
                                            />Guardar campo</Button
                                        >
                                    </div>
                                </Form>
                            </article>

                            <Form
                                v-if="addingFieldIn === section.id"
                                v-bind="
                                    TemplateController.storeField.form(
                                        templateVersionId,
                                    )
                                "
                                :options="{ preserveScroll: true }"
                                v-slot="{ errors, processing }"
                                @success="addingFieldIn = null"
                            >
                                <input
                                    type="hidden"
                                    name="section_id"
                                    :value="section.id"
                                />
                                <input
                                    type="hidden"
                                    name="key"
                                    :value="
                                        keyFor(
                                            `${section.title} ${fieldNames[section.id] ?? ''}`,
                                        )
                                    "
                                />
                                <input
                                    type="hidden"
                                    name="required"
                                    value="0"
                                />
                                <input
                                    type="hidden"
                                    name="inherited"
                                    value="0"
                                />
                                <input
                                    type="hidden"
                                    name="teacher_editable"
                                    value="1"
                                />
                                <input
                                    type="hidden"
                                    name="ai_enabled"
                                    value="0"
                                />
                                <Card class="border-dashed">
                                    <CardHeader
                                        ><CardTitle class="text-base"
                                            >Nuevo campo</CardTitle
                                        ></CardHeader
                                    >
                                    <CardContent>
                                        <FieldGroup>
                                            <Field
                                                :data-invalid="
                                                    Boolean(errors.label)
                                                "
                                            >
                                                <FieldLabel
                                                    :for="`new-field-name-${section.id}`"
                                                    required
                                                    >Nombre del
                                                    campo</FieldLabel
                                                >
                                                <Input
                                                    :id="`new-field-name-${section.id}`"
                                                    v-model="
                                                        fieldNames[section.id]
                                                    "
                                                    name="label"
                                                    placeholder="Ej. Actividades de evaluación"
                                                    required
                                                    :aria-invalid="
                                                        Boolean(errors.label)
                                                    "
                                                />
                                                <FieldError
                                                    :errors="[errors.label]"
                                                />
                                            </Field>
                                            <Field
                                                :data-invalid="
                                                    Boolean(errors.content_type)
                                                "
                                            >
                                                <FieldLabel
                                                    :for="`new-field-type-${section.id}`"
                                                    required
                                                    >Tipo de
                                                    contenido</FieldLabel
                                                >
                                                <Select
                                                    v-model="
                                                        fieldTypes[section.id]
                                                    "
                                                    name="content_type"
                                                    required
                                                >
                                                    <SelectTrigger
                                                        :id="`new-field-type-${section.id}`"
                                                        :aria-invalid="
                                                            Boolean(
                                                                errors.content_type,
                                                            )
                                                        "
                                                        ><SelectValue
                                                            placeholder="Seleccione un tipo"
                                                    /></SelectTrigger>
                                                    <SelectContent
                                                        ><SelectGroup
                                                            ><SelectItem
                                                                v-for="type in blockTypes"
                                                                :key="
                                                                    type.value
                                                                "
                                                                :value="
                                                                    type.value
                                                                "
                                                                >{{
                                                                    type.label
                                                                }}</SelectItem
                                                            ></SelectGroup
                                                        ></SelectContent
                                                    >
                                                </Select>
                                                <FieldError
                                                    :errors="[
                                                        errors.content_type,
                                                    ]"
                                                />
                                            </Field>
                                        </FieldGroup>
                                        <div
                                            class="mt-4 flex justify-end gap-2"
                                        >
                                            <Button
                                                type="button"
                                                variant="outline"
                                                @click="addingFieldIn = null"
                                                >Cancelar</Button
                                            >
                                            <Button
                                                type="submit"
                                                :disabled="processing"
                                                ><Spinner
                                                    v-if="processing"
                                                />Agregar campo</Button
                                            >
                                        </div>
                                    </CardContent>
                                </Card>
                            </Form>
                            <Button
                                v-else
                                type="button"
                                variant="outline"
                                @click="
                                    addingFieldIn = section.id;
                                    fieldTypes[section.id] = 'text';
                                "
                                >Agregar campo</Button
                            >
                        </CardContent>
                    </Card>
                </section>

                <div class="flex min-h-10 items-center justify-center">
                    <TemplateBlockAddForm
                        v-if="addingBlockAt === sectionIndex + 1"
                        :template-version-id="templateVersionId"
                        :position="sectionIndex + 1"
                        :block-types="blockTypes"
                        @cancel="closeBlockForm"
                        @success="closeBlockForm"
                    />
                    <Tooltip v-else>
                        <TooltipTrigger as-child>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Agregar bloque"
                                @click="addBlockAt(sectionIndex + 1)"
                            >
                                <Plus
                                    data-icon="inline-start"
                                    aria-hidden="true"
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Agregar bloque</TooltipContent>
                    </Tooltip>
                </div>
            </template>

            <div
                v-if="builderBlocks.length === 0"
                class="flex min-h-10 items-center justify-center"
            >
                <TemplateBlockAddForm
                    v-if="addingBlockAt === 0"
                    :template-version-id="templateVersionId"
                    :position="0"
                    :block-types="blockTypes"
                    @cancel="closeBlockForm"
                    @success="closeBlockForm"
                />
                <Tooltip v-else>
                    <TooltipTrigger as-child>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Agregar bloque"
                            @click="addBlockAt(0)"
                        >
                            <Plus data-icon="inline-start" aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Agregar bloque</TooltipContent>
                </Tooltip>
            </div>
        </div>
    </TooltipProvider>
</template>
