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

type CurriculumEntity = 'malla' | 'asignatura';

const props = defineProps<
    Pick<AcademicStructureProps, 'options'> & {
        entity: CurriculumEntity;
    }
>();

const submitLabel = computed(() =>
    props.entity === 'malla' ? 'Crear malla' : 'Agregar materia',
);
const title = computed(() =>
    props.entity === 'malla' ? 'Agregar malla' : 'Agregar materia',
);
const description = computed(() =>
    props.entity === 'malla'
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
                    <template v-if="props.entity === 'malla'">
                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel for="curriculum-code" required>
                                Código
                            </FieldLabel>
                            <Input
                                id="curriculum-code"
                                name="code"
                                placeholder="Ej. MALLA-SW-2026"
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
                                placeholder="Ej. SW-601"
                                required
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.nombre)">
                            <FieldLabel for="subject-name" required>
                                Nombre
                            </FieldLabel>
                            <Input
                                id="subject-name"
                                name="nombre"
                                placeholder="Ej. Ingeniería de requisitos"
                                required
                                :aria-invalid="Boolean(errors.nombre)"
                            />
                            <FieldError :errors="[errors.nombre]" />
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
                        <Field :data-invalid="Boolean(errors.creditos)">
                            <FieldLabel for="subject-credits">
                                Créditos
                            </FieldLabel>
                            <Input
                                id="subject-credits"
                                name="creditos"
                                type="number"
                                min="0"
                                step="0.01"
                                :aria-invalid="Boolean(errors.creditos)"
                            />
                            <FieldError :errors="[errors.creditos]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.horas_totales)">
                            <FieldLabel for="subject-total-hours">
                                Horas totales
                            </FieldLabel>
                            <Input
                                id="subject-total-hours"
                                name="horas_totales"
                                type="number"
                                min="0"
                                :aria-invalid="Boolean(errors.horas_totales)"
                            />
                            <FieldError :errors="[errors.horas_totales]" />
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
