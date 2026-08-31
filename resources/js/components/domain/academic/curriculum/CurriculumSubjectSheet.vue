<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check, Plus } from '@lucide/vue';
import { computed } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
    CurriculumFieldDefinition,
} from '@/types/academic';

const props = defineProps<{
    curriculum: CurriculumBuilderProps['curriculum'];
    fieldDefinitions: CurriculumBuilderProps['fieldDefinitions'];
    subject: CurriculumBuilderSubject | null;
}>();

const open = defineModel<boolean>('open', { default: false });
const formRoute = computed(() =>
    props.subject
        ? CareerAcademicStructureController.update.form({
              entity: 'subject',
              record: props.subject.id,
          })
        : CareerAcademicStructureController.store.form('subject'),
);
const title = computed(() =>
    props.subject ? `Editar ${props.subject.name}` : 'Agregar materia',
);

const inputType = (type: string): 'number' | 'text' =>
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
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Agregar materia"
        :title="title"
        description="La tarjeta y la vista formulario guardan exactamente la misma información académica."
        :show-trigger="false"
    >
        <template #default="{ close }">
            <Form
                :key="subject?.id ?? 'new'"
                v-bind="formRoute"
                v-slot="{ errors, processing }"
                :reset-on-success="subject === null"
                @success="close"
            >
                <input
                    v-if="subject === null"
                    type="hidden"
                    name="curriculum_id"
                    :value="curriculum.id"
                />
                <FieldGroup>
                    <Field v-if="errors.record" data-invalid>
                        <FieldError :errors="[errors.record]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.code)">
                        <FieldLabel for="builder-subject-code" required>
                            Código
                        </FieldLabel>
                        <Input
                            id="builder-subject-code"
                            name="code"
                            :default-value="subject?.code"
                            placeholder="Ej. SW-601"
                            required
                            :aria-invalid="Boolean(errors.code)"
                        />
                        <FieldError :errors="[errors.code]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.name)">
                        <FieldLabel for="builder-subject-name" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="builder-subject-name"
                            name="name"
                            :default-value="subject?.name"
                            placeholder="Ej. Ingeniería de requisitos"
                            required
                            :aria-invalid="Boolean(errors.name)"
                        />
                        <FieldError :errors="[errors.name]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.cycle)">
                        <FieldLabel for="builder-subject-cycle" required>
                            Ciclo
                        </FieldLabel>
                        <Input
                            id="builder-subject-cycle"
                            name="cycle"
                            type="number"
                            min="1"
                            :max="curriculum.cycle_count"
                            :default-value="subject?.cycle ?? 1"
                            required
                            :aria-invalid="Boolean(errors.cycle)"
                        />
                        <FieldDescription>
                            Entre 1 y {{ curriculum.cycle_count }}.
                        </FieldDescription>
                        <FieldError :errors="[errors.cycle]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.position)">
                        <FieldLabel for="builder-subject-position">
                            Orden dentro del ciclo
                        </FieldLabel>
                        <Input
                            id="builder-subject-position"
                            name="position"
                            type="number"
                            min="0"
                            :default-value="subject?.position ?? 0"
                            :aria-invalid="Boolean(errors.position)"
                        />
                        <FieldError :errors="[errors.position]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.organization_unit)">
                        <FieldLabel for="builder-subject-unit">
                            Unidad de organización curricular
                        </FieldLabel>
                        <Input
                            id="builder-subject-unit"
                            name="organization_unit"
                            :default-value="subject?.organization_unit ?? ''"
                            placeholder="Ej. Unidad básica"
                            :aria-invalid="Boolean(errors.organization_unit)"
                        />
                        <FieldError :errors="[errors.organization_unit]" />
                    </Field>

                    <Field
                        v-for="field in fieldDefinitions"
                        :key="field.id"
                        :data-invalid="
                            Boolean(
                                errors[
                                    field.system_key ??
                                        `custom_values.${field.id}`
                                ],
                            )
                        "
                    >
                        <FieldLabel :for="`builder-field-${field.id}`">
                            {{ field.label }}
                        </FieldLabel>
                        <NativeSelect
                            v-if="field.type === 'boolean'"
                            :id="`builder-field-${field.id}`"
                            :name="
                                field.system_key ?? `custom_values[${field.id}]`
                            "
                            :model-value="fieldValue(field)"
                        >
                            <NativeSelectOption value=""
                                >Sin valor</NativeSelectOption
                            >
                            <NativeSelectOption value="true"
                                >Sí</NativeSelectOption
                            >
                            <NativeSelectOption value="false"
                                >No</NativeSelectOption
                            >
                        </NativeSelect>
                        <Input
                            v-else
                            :id="`builder-field-${field.id}`"
                            :name="
                                field.system_key ?? `custom_values[${field.id}]`
                            "
                            :type="inputType(field.type)"
                            :step="field.type === 'number' ? '0.01' : undefined"
                            min="0"
                            :default-value="fieldValue(field)"
                            :placeholder="
                                field.type === 'text'
                                    ? `Ej. ${field.label}`
                                    : undefined
                            "
                            :aria-invalid="
                                Boolean(
                                    errors[
                                        field.system_key ??
                                            `custom_values.${field.id}`
                                    ],
                                )
                            "
                        />
                        <FieldError
                            :errors="[
                                errors[
                                    field.system_key ??
                                        `custom_values.${field.id}`
                                ],
                            ]"
                        />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="subject ? Check : Plus"
                        :label="subject ? 'Guardar materia' : 'Agregar materia'"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
