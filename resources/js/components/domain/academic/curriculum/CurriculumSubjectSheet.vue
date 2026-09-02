<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check, Plus } from '@lucide/vue';
import { computed, watch } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import CurriculumSubjectFieldInput from '@/components/domain/academic/curriculum/CurriculumSubjectFieldInput.vue';
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
import { useCurriculumSubjectFieldValues } from '@/composables/useCurriculumSubjectFieldValues';
import { cn } from '@/lib/utils';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
    CurriculumFieldDefinition,
} from '@/types/academic';

const props = defineProps<{
    curriculum: CurriculumBuilderProps['curriculum'];
    fieldDefinitions: CurriculumBuilderProps['fieldDefinitions'];
    subject: CurriculumBuilderSubject | null;
    organizationUnits: string[];
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
const { reset, updateValue, valueFor } = useCurriculumSubjectFieldValues(
    () => props.subject,
    () => props.fieldDefinitions,
);

watch(open, (isOpen) => {
    if (isOpen) {
        reset();
    }
});

const errorKey = (field: CurriculumFieldDefinition): string =>
    field.system_key ?? `custom_values.${field.id}`;
const fieldGridClass = (field: CurriculumFieldDefinition): string =>
    cn(field.type === 'texto' && 'col-span-2 sm:col-span-5');
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
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel for="builder-subject-name" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="builder-subject-name"
                            name="nombre"
                            :default-value="subject?.name"
                            placeholder="Ej. Ingeniería de requisitos"
                            required
                            :aria-invalid="Boolean(errors.nombre)"
                        />
                        <FieldError :errors="[errors.nombre]" />
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
                    <Field :data-invalid="Boolean(errors.organization_unit)">
                        <FieldLabel for="builder-subject-unit" required>
                            Unidad de organización curricular
                        </FieldLabel>
                        <Input
                            id="builder-subject-unit"
                            name="organization_unit"
                            list="builder-subject-organization-units"
                            :default-value="subject?.organization_unit ?? ''"
                            placeholder="Ej. Unidad básica"
                            required
                            :aria-invalid="Boolean(errors.organization_unit)"
                        />
                        <datalist id="builder-subject-organization-units">
                            <option
                                v-for="unit in organizationUnits"
                                :key="unit"
                                :value="unit"
                            />
                        </datalist>
                        <FieldError :errors="[errors.organization_unit]" />
                    </Field>

                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <CurriculumSubjectFieldInput
                            v-for="field in fieldDefinitions"
                            :key="field.id"
                            :class="fieldGridClass(field)"
                            :field="field"
                            :input-id="`builder-field-${field.id}`"
                            :value="valueFor(field)"
                            :error="errors[errorKey(field)]"
                            @update:value="updateValue(field, $event)"
                        />
                    </div>

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
