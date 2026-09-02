<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import CurriculumSubjectFieldInput from '@/components/domain/academic/curriculum/CurriculumSubjectFieldInput.vue';
import OrganizationUnitInput from '@/components/domain/academic/curriculum/OrganizationUnitInput.vue';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCurriculumSubjectFieldValues } from '@/composables/useCurriculumSubjectFieldValues';
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
    organizationUnits: string[];
}>();

const emit = defineEmits<{
    cancel: [];
    saved: [];
}>();

const formRoute = computed(() =>
    props.subject
        ? CareerAcademicStructureController.update.form({
              entity: 'subject',
              record: props.subject.id,
          })
        : CareerAcademicStructureController.store.form('subject'),
);

const { updateValue, valueFor } = useCurriculumSubjectFieldValues(
    () => props.subject,
    () => props.fieldDefinitions,
);

const errorKey = (field: CurriculumFieldDefinition): string =>
    field.system_key ?? `custom_values.${field.id}`;
const organizationUnit = ref(props.subject?.organization_unit ?? '');

watch(
    () => props.subject?.organization_unit,
    (value) => {
        organizationUnit.value = value ?? '';
    },
);
</script>

<template>
    <Form
        :key="subject?.id ?? `new-${cycle}-${position}`"
        v-bind="formRoute"
        v-slot="{ errors, processing }"
        class="nodrag nopan nowheel w-[36rem] cursor-default rounded-md bg-card p-3 text-card-foreground shadow-modal ring-1 ring-surface-ring"
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
        <FieldGroup class="gap-3">
            <Field v-if="errors.record" data-invalid>
                <FieldError :errors="[errors.record]" />
            </Field>

            <div class="grid grid-cols-[10rem_minmax(0,1fr)] gap-2">
                <Field :data-invalid="Boolean(errors.code)">
                    <FieldLabel
                        :for="`visual-subject-code-${subject?.id ?? cycle}`"
                        required
                    >
                        Código
                    </FieldLabel>
                    <Input
                        :id="`visual-subject-code-${subject?.id ?? cycle}`"
                        name="code"
                        :default-value="subject?.code"
                        placeholder="Ej. SW-601"
                        required
                        :aria-invalid="Boolean(errors.code)"
                    />
                    <FieldError :errors="[errors.code]" />
                </Field>
                <Field :data-invalid="Boolean(errors.nombre)">
                    <FieldLabel
                        :for="`visual-subject-name-${subject?.id ?? cycle}`"
                        required
                    >
                        Nombre
                    </FieldLabel>
                    <Input
                        :id="`visual-subject-name-${subject?.id ?? cycle}`"
                        name="nombre"
                        :default-value="subject?.name"
                        placeholder="Ej. Ingeniería de requisitos"
                        required
                        :aria-invalid="Boolean(errors.nombre)"
                    />
                    <FieldError :errors="[errors.nombre]" />
                </Field>
            </div>

            <Field :data-invalid="Boolean(errors.organization_unit)">
                <FieldLabel
                    :for="`visual-subject-unit-${subject?.id ?? cycle}`"
                    required
                >
                    Unidad de organización curricular
                </FieldLabel>
                <OrganizationUnitInput
                    :id="`visual-subject-unit-${subject?.id ?? cycle}`"
                    name="organization_unit"
                    v-model="organizationUnit"
                    :options="organizationUnits"
                    :invalid="Boolean(errors.organization_unit)"
                />
                <FieldError :errors="[errors.organization_unit]" />
            </Field>

            <div
                v-if="fieldDefinitions.length > 0"
                class="-m-1 flex gap-2 overflow-x-auto p-1"
            >
                <CurriculumSubjectFieldInput
                    v-for="field in fieldDefinitions"
                    :key="field.id"
                    class="min-w-24 flex-1 gap-1"
                    :field="field"
                    :input-id="`visual-subject-${subject?.id ?? cycle}-${field.id}`"
                    :value="valueFor(field)"
                    :error="errors[errorKey(field)]"
                    @update:value="updateValue(field, $event)"
                />
            </div>

            <div class="flex justify-end gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="processing"
                    @click="emit('cancel')"
                >
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
