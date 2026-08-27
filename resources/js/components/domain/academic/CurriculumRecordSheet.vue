<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import { computed, ref } from 'vue';
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

defineProps<Pick<AcademicStructureProps, 'options'>>();

const entity = ref<CurriculumEntity>('curriculum');
const submitLabel = computed(() =>
    entity.value === 'curriculum' ? 'Crear malla' : 'Agregar materia',
);
</script>

<template>
    <FormSheet
        trigger-label="Agregar"
        title="Agregar malla o materia"
        description="Las mallas nacen como borrador. Las materias se incorporan únicamente a una malla en borrador de esta carrera."
    >
        <template #default="{ close }">
            <div class="flex flex-col gap-6">
                <FieldGroup>
                    <Field>
                        <FieldLabel for="curriculum-entity">
                            Tipo de registro
                        </FieldLabel>
                        <Select v-model="entity">
                            <SelectTrigger id="curriculum-entity">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="curriculum">
                                        Malla
                                    </SelectItem>
                                    <SelectItem value="subject">
                                        Materia
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>
                </FieldGroup>

                <Form
                    :key="entity"
                    v-bind="
                        CareerAcademicStructureController.store.form(entity)
                    "
                    v-slot="{ errors, processing }"
                    reset-on-success
                    @success="close"
                >
                    <FieldGroup>
                        <template v-if="entity === 'curriculum'">
                            <Field :data-invalid="Boolean(errors.code)">
                                <FieldLabel for="curriculum-code">
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
                            <Field
                                :data-invalid="Boolean(errors.version_number)"
                            >
                                <FieldLabel for="curriculum-version">
                                    Número de versión
                                </FieldLabel>
                                <Input
                                    id="curriculum-version"
                                    name="version_number"
                                    type="number"
                                    min="1"
                                    required
                                    :aria-invalid="
                                        Boolean(errors.version_number)
                                    "
                                />
                                <FieldError :errors="[errors.version_number]" />
                            </Field>
                        </template>

                        <template v-else>
                            <Field
                                :data-invalid="Boolean(errors.curriculum_id)"
                            >
                                <FieldLabel for="subject-curriculum">
                                    Malla en borrador
                                </FieldLabel>
                                <Select name="curriculum_id">
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
                                                v-for="item in options.draftCurricula"
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
                                <FieldLabel for="subject-code">
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
                                <FieldLabel for="subject-name">
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
                                <FieldLabel for="subject-cycle">
                                    Ciclo
                                </FieldLabel>
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
            </div>
        </template>
    </FormSheet>
</template>
