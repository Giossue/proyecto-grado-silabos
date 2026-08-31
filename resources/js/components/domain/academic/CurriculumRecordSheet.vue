<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import { computed } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
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
import type { AcademicStructureProps } from '@/types/academic';

type CurriculumEntity = 'curriculum' | 'subject';

const props = defineProps<
    Pick<AcademicStructureProps, 'options'> & {
        entity: CurriculumEntity;
    }
>();

const submitLabel = computed(() =>
    props.entity === 'curriculum' ? 'Crear malla' : 'Agregar materia',
);
const title = computed(() =>
    props.entity === 'curriculum' ? 'Agregar malla' : 'Agregar materia',
);
const description = computed(() =>
    props.entity === 'curriculum'
        ? 'Cree la malla única de la carrera para incorporar materias, campos y relaciones.'
        : 'Las materias se incorporan a la malla actual de esta carrera.',
);
</script>

<template>
    <FormSheet
        trigger-label="Agregar"
        :title="title"
        :description="description"
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    CareerAcademicStructureController.store.form(props.entity)
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <template v-if="props.entity === 'curriculum'">
                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel for="curriculum-code" required>
                                Código
                            </FieldLabel>
                            <Input
                                id="curriculum-code"
                                name="code"
                                required
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>
                    </template>

                    <template v-else>
                        <Field :data-invalid="Boolean(errors.curriculum_id)">
                            <FieldLabel for="subject-curriculum" required>
                                Malla actual
                            </FieldLabel>
                            <Select name="curriculum_id" required>
                                <SelectTrigger
                                    id="subject-curriculum"
                                    :aria-invalid="
                                        Boolean(errors.curriculum_id)
                                    "
                                >
                                    <SelectValue
                                        placeholder="Seleccione una malla"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            v-for="item in options.currentCurricula"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.codigo }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldError :errors="[errors.curriculum_id]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel for="subject-code" required>
                                Código
                            </FieldLabel>
                            <Input
                                id="subject-code"
                                name="code"
                                required
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.name)">
                            <FieldLabel for="subject-name" required>
                                Nombre
                            </FieldLabel>
                            <Input
                                id="subject-name"
                                name="name"
                                required
                                :aria-invalid="Boolean(errors.name)"
                            />
                            <FieldError :errors="[errors.name]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.cycle)">
                            <FieldLabel for="subject-cycle"> Ciclo </FieldLabel>
                            <Input
                                id="subject-cycle"
                                name="cycle"
                                type="number"
                                min="1"
                                :aria-invalid="Boolean(errors.cycle)"
                            />
                            <FieldError :errors="[errors.cycle]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.credits)">
                            <FieldLabel for="subject-credits">
                                Créditos
                            </FieldLabel>
                            <Input
                                id="subject-credits"
                                name="credits"
                                type="number"
                                min="0"
                                step="0.01"
                                :aria-invalid="Boolean(errors.credits)"
                            />
                            <FieldError :errors="[errors.credits]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.total_hours)">
                            <FieldLabel for="subject-total-hours">
                                Horas totales
                            </FieldLabel>
                            <Input
                                id="subject-total-hours"
                                name="total_hours"
                                type="number"
                                min="0"
                                :aria-invalid="Boolean(errors.total_hours)"
                            />
                            <FieldError :errors="[errors.total_hours]" />
                        </Field>
                    </template>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Plus"
                        :label="submitLabel"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
