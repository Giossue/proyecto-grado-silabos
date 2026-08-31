<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check, X } from '@lucide/vue';
import { computed } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
    CurriculumFieldDefinition,
} from '@/types/academic';

const props = defineProps<{
    curriculum: CurriculumBuilderProps['curriculum'];
    fieldDefinitions: CurriculumFieldDefinition[];
    subject: CurriculumBuilderSubject | null;
    cycle: number;
    position: number;
}>();

const emit = defineEmits<{
    cancel: [];
    saved: [];
}>();

const visibleFields = computed(() =>
    props.fieldDefinitions.filter((field) => field.visible_on_card),
);
const editableSystemKeys = computed(
    () =>
        new Set(
            visibleFields.value.flatMap((field) =>
                field.system_key ? [field.system_key] : [],
            ),
        ),
);
const preservedSystemValues = computed(() =>
    Object.entries(props.subject?.system_values ?? {}).filter(
        ([key]) => !editableSystemKeys.value.has(key),
    ),
);
const formRoute = computed(() =>
    props.subject
        ? CareerAcademicStructureController.update.form({
              entity: 'subject',
              record: props.subject.id,
          })
        : CareerAcademicStructureController.store.form('subject'),
);

const inputType = (type: CurriculumFieldDefinition['type']): string =>
    type === 'number' || type === 'integer' ? 'number' : 'text';

const fieldValue = (field: CurriculumFieldDefinition): number | string => {
    const value = field.system_key
        ? props.subject?.system_values[field.system_key]
        : props.subject?.custom_values[field.id];

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    return value ?? '';
};

const errorKey = (field: CurriculumFieldDefinition): string =>
    field.system_key ?? `custom_values.${field.id}`;
</script>

<template>
    <Form
        :key="subject?.id ?? `new-${cycle}-${position}`"
        v-bind="formRoute"
        v-slot="{ errors, processing }"
        class="nodrag nopan nowheel w-[36rem] rounded-md border-2 bg-card p-3 text-card-foreground shadow-modal"
        :options="{ preserveScroll: true }"
        @keydown.stop
        @mousedown.stop
        @success="emit('saved')"
    >
        <input
            v-if="subject === null"
            type="hidden"
            name="curriculum_id"
            :value="curriculum.id"
        />
        <input type="hidden" name="cycle" :value="cycle" />
        <input type="hidden" name="position" :value="position" />
        <input
            v-for="[key, value] in preservedSystemValues"
            :key="key"
            type="hidden"
            :name="key"
            :value="value ?? ''"
        />

        <FieldGroup class="gap-3">
            <Field v-if="errors.record" data-invalid>
                <FieldError :errors="[errors.record]" />
            </Field>

            <div class="grid grid-cols-[10rem_minmax(0,1fr)] gap-2">
                <Field :data-invalid="Boolean(errors.code)">
                    <FieldLabel
                        :for="`visual-subject-code-${subject?.id ?? cycle}`"
                        class="sr-only"
                        required
                    >
                        Código
                    </FieldLabel>
                    <Input
                        :id="`visual-subject-code-${subject?.id ?? cycle}`"
                        name="code"
                        :default-value="subject?.code"
                        placeholder="Código"
                        required
                        :aria-invalid="Boolean(errors.code)"
                    />
                    <FieldError :errors="[errors.code]" />
                </Field>
                <Field :data-invalid="Boolean(errors.name)">
                    <FieldLabel
                        :for="`visual-subject-name-${subject?.id ?? cycle}`"
                        class="sr-only"
                        required
                    >
                        Nombre
                    </FieldLabel>
                    <Input
                        :id="`visual-subject-name-${subject?.id ?? cycle}`"
                        name="name"
                        :default-value="subject?.name"
                        placeholder="Nombre de la materia"
                        required
                        :aria-invalid="Boolean(errors.name)"
                    />
                    <FieldError :errors="[errors.name]" />
                </Field>
            </div>

            <Field :data-invalid="Boolean(errors.organization_unit)">
                <FieldLabel
                    :for="`visual-subject-unit-${subject?.id ?? cycle}`"
                    class="sr-only"
                >
                    Unidad de organización curricular
                </FieldLabel>
                <Input
                    :id="`visual-subject-unit-${subject?.id ?? cycle}`"
                    name="organization_unit"
                    :default-value="subject?.organization_unit ?? ''"
                    placeholder="Unidad de organización curricular"
                    :aria-invalid="Boolean(errors.organization_unit)"
                />
                <FieldError :errors="[errors.organization_unit]" />
            </Field>

            <div
                v-if="visibleFields.length > 0"
                class="flex gap-2 overflow-x-auto pb-1"
            >
                <Field
                    v-for="field in visibleFields"
                    :key="field.id"
                    class="min-w-24 flex-1 gap-1"
                    :data-invalid="Boolean(errors[errorKey(field)])"
                >
                    <FieldLabel
                        :for="`visual-subject-${subject?.id ?? cycle}-${field.id}`"
                    >
                        {{ field.label }}
                    </FieldLabel>
                    <NativeSelect
                        v-if="field.type === 'boolean'"
                        :id="`visual-subject-${subject?.id ?? cycle}-${field.id}`"
                        :name="field.system_key ?? `custom_values[${field.id}]`"
                        :model-value="fieldValue(field)"
                        :aria-invalid="Boolean(errors[errorKey(field)])"
                    >
                        <NativeSelectOption value="">—</NativeSelectOption>
                        <NativeSelectOption value="true">Sí</NativeSelectOption>
                        <NativeSelectOption value="false"
                            >No</NativeSelectOption
                        >
                    </NativeSelect>
                    <Input
                        v-else
                        :id="`visual-subject-${subject?.id ?? cycle}-${field.id}`"
                        :name="field.system_key ?? `custom_values[${field.id}]`"
                        :type="inputType(field.type)"
                        :step="field.type === 'number' ? '0.01' : undefined"
                        :min="
                            field.type === 'number' || field.type === 'integer'
                                ? 0
                                : undefined
                        "
                        :default-value="fieldValue(field)"
                        :aria-invalid="Boolean(errors[errorKey(field)])"
                    />
                    <FieldError :errors="[errors[errorKey(field)]]" />
                </Field>
            </div>

            <div class="flex justify-end gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="processing"
                    @click="emit('cancel')"
                >
                    <X data-icon="inline-start" aria-hidden="true" />
                    Cancelar
                </Button>
                <Button type="submit" size="sm" :disabled="processing">
                    <Spinner v-if="processing" data-icon="inline-start" />
                    <Check v-else data-icon="inline-start" aria-hidden="true" />
                    {{ subject ? 'Guardar' : 'Agregar materia' }}
                </Button>
            </div>
        </FieldGroup>
    </Form>
</template>
