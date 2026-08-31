<script setup lang="ts">
import { Form, router } from '@inertiajs/vue3';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from '@lucide/vue';
import { ref, watch } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
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

type TemplateBlock = {
    id: string;
    title: string;
    content_type: string;
    fields: TemplateField[];
};

type TemplateSection = {
    id: string;
    title: string;
    description: string | null;
    blocks: TemplateBlock[];
};

const props = defineProps<{
    templateVersionId: string;
    sections: TemplateSection[];
    blockTypes: { value: string; label: string }[];
}>();

const builderSections = ref<TemplateSection[]>([]);
const addingSectionId = ref<string | null>(null);
const newNames = ref<Record<string, string>>({});
const dragged = ref<{ sectionId: string; blockId: string } | null>(null);

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
        builderSections.value = copySections(value);
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
        ? `bloque_${normalized || 'nuevo'}`
        : normalized;
};

const fieldFor = (block: TemplateBlock): TemplateField | null =>
    block.fields[0] ?? null;

const move = (
    section: TemplateSection,
    blockId: string,
    direction: -1 | 1,
): void => {
    const from = section.blocks.findIndex((block) => block.id === blockId);
    const to = from + direction;

    if (from < 0 || to < 0 || to >= section.blocks.length) {
        return;
    }

    const [block] = section.blocks.splice(from, 1);
    section.blocks.splice(to, 0, block);
    persistOrder(section);
};

const persistOrder = (section: TemplateSection): void => {
    router.patch(
        TemplateController.reorderBlocks.url(props.templateVersionId),
        {
            section_id: section.id,
            block_ids: section.blocks.map((block) => block.id),
        },
        { preserveScroll: true },
    );
};

const startDrag = (sectionId: string, blockId: string): void => {
    dragged.value = { sectionId, blockId };
};

const dropBlock = (section: TemplateSection, targetBlockId: string): void => {
    const source = dragged.value;
    dragged.value = null;

    if (
        source === null ||
        source.sectionId !== section.id ||
        source.blockId === targetBlockId
    ) {
        return;
    }

    const from = section.blocks.findIndex(
        (block) => block.id === source.blockId,
    );
    const to = section.blocks.findIndex((block) => block.id === targetBlockId);

    if (from < 0 || to < 0) {
        return;
    }

    const [block] = section.blocks.splice(from, 1);
    section.blocks.splice(to, 0, block);
    persistOrder(section);
};

const deleteBlock = (block: TemplateBlock): void => {
    router.delete(
        TemplateController.destroyBlock.url({
            version: props.templateVersionId,
            block: block.id,
        }),
        { preserveScroll: true },
    );
};
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card v-for="section in builderSections" :key="section.id">
            <CardHeader>
                <CardTitle>{{ section.title }}</CardTitle>
                <CardDescription v-if="section.description">
                    {{ section.description }}
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-4">
                <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                <article
                    v-for="(block, index) in section.blocks"
                    :key="block.id"
                    draggable="true"
                    role="group"
                    :aria-label="`Bloque ${block.title}`"
                    class="rounded-lg border bg-muted/20 p-4"
                    @dragend="dragged = null"
                    @dragover.prevent
                    @dragstart="startDrag(section.id, block.id)"
                    @drop.prevent="dropBlock(section, block.id)"
                >
                    <Form
                        v-if="fieldFor(block)"
                        v-bind="
                            TemplateController.updateField.form({
                                version: templateVersionId,
                                field: fieldFor(block)?.id ?? '',
                            })
                        "
                        v-slot="{ errors, processing }"
                        reset-on-success
                    >
                        <input
                            type="hidden"
                            name="block_id"
                            :value="block.id"
                        />
                        <input
                            type="hidden"
                            name="key"
                            :value="fieldFor(block)?.key"
                        />
                        <input
                            type="hidden"
                            name="inherited"
                            :value="fieldFor(block)?.inherited ? '1' : '0'"
                        />
                        <input
                            type="hidden"
                            name="required"
                            :value="fieldFor(block)?.required ? '1' : '0'"
                        />
                        <input
                            type="hidden"
                            name="help"
                            :value="fieldFor(block)?.help ?? ''"
                        />
                        <input
                            type="hidden"
                            name="master_source"
                            :value="fieldFor(block)?.master_source ?? ''"
                        />
                        <input
                            type="hidden"
                            name="teacher_editable"
                            :value="
                                fieldFor(block)?.teacher_editable ? '1' : '0'
                            "
                        />
                        <input
                            type="hidden"
                            name="ai_enabled"
                            :value="fieldFor(block)?.ai_enabled ? '1' : '0'"
                        />
                        <input
                            type="hidden"
                            name="document_marker"
                            :value="fieldFor(block)?.document_marker ?? ''"
                        />
                        <div
                            class="mb-4 flex items-center justify-between gap-3"
                        >
                            <div
                                class="flex items-center gap-2 text-sm text-muted-foreground"
                            >
                                <GripVertical aria-hidden="true" />
                                Arrastre para reordenar
                            </div>
                            <div class="flex items-center gap-1">
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    :aria-label="`Subir ${block.title}`"
                                    :disabled="index === 0"
                                    @click="move(section, block.id, -1)"
                                >
                                    <ArrowUp aria-hidden="true" />
                                </Button>
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    :aria-label="`Bajar ${block.title}`"
                                    :disabled="
                                        index === section.blocks.length - 1
                                    "
                                    @click="move(section, block.id, 1)"
                                >
                                    <ArrowDown aria-hidden="true" />
                                </Button>
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    :aria-label="`Eliminar ${block.title}`"
                                    @click="deleteBlock(block)"
                                >
                                    <Trash2 aria-hidden="true" />
                                </Button>
                            </div>
                        </div>
                        <FieldGroup>
                            <Field :data-invalid="Boolean(errors.label)">
                                <FieldLabel
                                    :for="`template-block-name-${block.id}`"
                                    required
                                >
                                    Nombre del bloque
                                </FieldLabel>
                                <Input
                                    :id="`template-block-name-${block.id}`"
                                    name="label"
                                    :default-value="block.title"
                                    placeholder="Ej. Objetivo general"
                                    required
                                    :aria-invalid="Boolean(errors.label)"
                                />
                                <FieldError :errors="[errors.label]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.content_type)">
                                <FieldLabel
                                    :for="`template-block-type-${block.id}`"
                                    required
                                >
                                    Tipo de contenido
                                </FieldLabel>
                                <Select
                                    name="content_type"
                                    required
                                    :default-value="block.content_type"
                                >
                                    <SelectTrigger
                                        :id="`template-block-type-${block.id}`"
                                        :aria-invalid="
                                            Boolean(errors.content_type)
                                        "
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="type in blockTypes"
                                                :key="type.value"
                                                :value="type.value"
                                            >
                                                {{ type.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.content_type]" />
                            </Field>
                        </FieldGroup>
                        <div class="mt-4 flex justify-end">
                            <Button
                                type="submit"
                                size="sm"
                                :disabled="processing"
                            >
                                <Spinner v-if="processing" />
                                Guardar bloque
                            </Button>
                        </div>
                    </Form>
                </article>

                <Form
                    v-if="addingSectionId === section.id"
                    v-bind="
                        TemplateController.storeField.form(templateVersionId)
                    "
                    v-slot="{ errors, processing }"
                    reset-on-success
                    @success="addingSectionId = null"
                >
                    <input
                        type="hidden"
                        name="section_id"
                        :value="section.id"
                    />
                    <input
                        type="hidden"
                        name="key"
                        :value="keyFor(newNames[section.id] ?? '')"
                    />
                    <input type="hidden" name="inherited" value="0" />
                    <input type="hidden" name="required" value="0" />
                    <input type="hidden" name="teacher_editable" value="1" />
                    <input type="hidden" name="ai_enabled" value="0" />
                    <div class="rounded-lg border border-dashed p-4">
                        <FieldGroup>
                            <Field :data-invalid="Boolean(errors.label)">
                                <FieldLabel
                                    :for="`new-template-block-name-${section.id}`"
                                    required
                                >
                                    Nombre del bloque
                                </FieldLabel>
                                <Input
                                    :id="`new-template-block-name-${section.id}`"
                                    v-model="newNames[section.id]"
                                    name="label"
                                    placeholder="Ej. Estrategias metodológicas"
                                    required
                                    :aria-invalid="Boolean(errors.label)"
                                />
                                <FieldError :errors="[errors.label]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.content_type)">
                                <FieldLabel
                                    :for="`new-template-block-type-${section.id}`"
                                    required
                                >
                                    Tipo de contenido
                                </FieldLabel>
                                <Select
                                    name="content_type"
                                    required
                                    default-value="text"
                                >
                                    <SelectTrigger
                                        :id="`new-template-block-type-${section.id}`"
                                        :aria-invalid="
                                            Boolean(errors.content_type)
                                        "
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="type in blockTypes"
                                                :key="type.value"
                                                :value="type.value"
                                            >
                                                {{ type.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.content_type]" />
                            </Field>
                        </FieldGroup>
                        <div class="mt-4 flex flex-wrap justify-end gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                @click="addingSectionId = null"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                :disabled="processing"
                            >
                                <Spinner v-if="processing" />
                                Agregar bloque
                            </Button>
                        </div>
                    </div>
                </Form>

                <Button
                    v-else
                    type="button"
                    variant="outline"
                    class="self-start"
                    @click="addingSectionId = section.id"
                >
                    <Plus data-icon="inline-start" />
                    Agregar bloque
                </Button>
            </CardContent>
        </Card>
    </div>
</template>
