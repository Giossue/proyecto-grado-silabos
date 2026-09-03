<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check } from '@lucide/vue';
import { computed } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import DatePicker from '@/components/DatePicker.vue';
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
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PARALLEL_SHIFTS as SHIFTS } from '@/lib/parallelShifts';
import type { AcademicStructureProps } from '@/types/academic';

export type CareerAcademicEntity =
    'malla' | 'asignatura' | 'oferta' | 'paralelo' | 'asignacion_docente';

export type CareerAcademicEditableRecord = {
    id: string;
    code?: string;
    shift?: string | null;
    name?: string;
    cycle?: number | null;
    credits?: string | null;
    total_hours?: number | null;
    subject_id?: string;
    period_id?: string;
    campus_id?: string;
    offering_id?: string;
    user_id?: string;
    parallel_id?: string;
    valid_from?: string;
    valid_until?: string | null;
};

const props = defineProps<{
    entity: CareerAcademicEntity;
    record: CareerAcademicEditableRecord;
    options: AcademicStructureProps['options'];
}>();

const open = defineModel<boolean>('open', { default: false });

const entityLabel = computed(
    () =>
        ({
            malla: 'malla',
            asignatura: 'materia',
            oferta: 'oferta académica',
            paralelo: 'paralelo',
            asignacion_docente: 'asignación docente',
        })[props.entity],
);
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Editar"
        :title="`Editar ${entityLabel}`"
        description="Actualice los datos dentro de su carrera. El cambio quedará registrado en auditoría."
        :show-trigger="false"
    >
        <template #default="{ close }">
            <Form
                :key="record.id"
                v-bind="
                    CareerAcademicStructureController.update.form({
                        entity,
                        record: record.id,
                    })
                "
                v-slot="{ errors, processing }"
                @success="close"
            >
                <FieldGroup>
                    <Field v-if="errors.record" data-invalid>
                        <FieldError :errors="[errors.record]" />
                    </Field>

                    <template v-if="entity === 'malla'">
                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel
                                :for="`edit-curriculum-code-${record.id}`"
                                required
                            >
                                Código
                            </FieldLabel>
                            <Input
                                :id="`edit-curriculum-code-${record.id}`"
                                name="code"
                                :default-value="record.code"
                                placeholder="Ej. MALLA-SW-2026"
                                required
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.shift)">
                            <FieldLabel
                                :for="`edit-parallel-shift-${record.id}`"
                                >Jornada</FieldLabel
                            >
                            <Select
                                name="shift"
                                :default-value="record.shift ?? undefined"
                            >
                                <SelectTrigger
                                    :id="`edit-parallel-shift-${record.id}`"
                                    :aria-invalid="Boolean(errors.shift)"
                                >
                                    <SelectValue
                                        placeholder="Seleccione la jornada"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            v-for="shift in SHIFTS"
                                            :key="shift.value"
                                            :value="shift.value"
                                        >
                                            {{ shift.label }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldError :errors="[errors.shift]" />
                        </Field>
                    </template>

                    <template v-else-if="entity === 'asignatura'">
                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel
                                :for="`edit-subject-code-${record.id}`"
                                required
                                >Código</FieldLabel
                            >
                            <Input
                                :id="`edit-subject-code-${record.id}`"
                                name="code"
                                :default-value="record.code"
                                placeholder="Ej. SW-601"
                                required
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.nombre)">
                            <FieldLabel
                                :for="`edit-subject-name-${record.id}`"
                                required
                                >Nombre</FieldLabel
                            >
                            <Input
                                :id="`edit-subject-name-${record.id}`"
                                name="nombre"
                                :default-value="record.name"
                                placeholder="Ej. Ingeniería de requisitos"
                                required
                                :aria-invalid="Boolean(errors.nombre)"
                            />
                            <FieldError :errors="[errors.nombre]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.cycle)">
                            <FieldLabel :for="`edit-subject-cycle-${record.id}`"
                                >Ciclo</FieldLabel
                            >
                            <Input
                                :id="`edit-subject-cycle-${record.id}`"
                                name="cycle"
                                type="number"
                                min="1"
                                :default-value="record.cycle ?? ''"
                                :aria-invalid="Boolean(errors.cycle)"
                            />
                            <FieldError :errors="[errors.cycle]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.creditos)">
                            <FieldLabel
                                :for="`edit-subject-credits-${record.id}`"
                                >Créditos</FieldLabel
                            >
                            <Input
                                :id="`edit-subject-credits-${record.id}`"
                                name="creditos"
                                type="number"
                                min="0"
                                step="0.01"
                                :default-value="record.credits ?? ''"
                                :aria-invalid="Boolean(errors.creditos)"
                            />
                            <FieldError :errors="[errors.creditos]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.horas_totales)">
                            <FieldLabel :for="`edit-subject-hours-${record.id}`"
                                >Horas totales</FieldLabel
                            >
                            <Input
                                :id="`edit-subject-hours-${record.id}`"
                                name="horas_totales"
                                type="number"
                                min="0"
                                :default-value="record.total_hours ?? ''"
                                :aria-invalid="Boolean(errors.horas_totales)"
                            />
                            <FieldError :errors="[errors.horas_totales]" />
                        </Field>
                    </template>

                    <template v-else-if="entity === 'oferta'">
                        <Field :data-invalid="Boolean(errors.subject_id)">
                            <FieldLabel
                                :for="`edit-offering-subject-${record.id}`"
                                required
                                >Materia de la malla activa</FieldLabel
                            >
                            <Select
                                name="subject_id"
                                :default-value="record.subject_id"
                                required
                            >
                                <SelectTrigger
                                    :id="`edit-offering-subject-${record.id}`"
                                    :aria-invalid="Boolean(errors.subject_id)"
                                >
                                    <SelectValue
                                        placeholder="Seleccione una materia"
                                    />
                                </SelectTrigger>
                                <SelectContent
                                    ><SelectGroup>
                                        <SelectItem
                                            v-for="item in options.activeSubjects"
                                            :key="item.id"
                                            :value="item.id"
                                            >{{ item.codigo_institucional }} ·
                                            {{ item.nombre }}</SelectItem
                                        >
                                    </SelectGroup></SelectContent
                                >
                            </Select>
                            <FieldError :errors="[errors.subject_id]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.period_id)">
                            <FieldLabel
                                :for="`edit-offering-period-${record.id}`"
                                required
                                >Periodo académico</FieldLabel
                            >
                            <Select
                                name="period_id"
                                :default-value="record.period_id"
                                required
                            >
                                <SelectTrigger
                                    :id="`edit-offering-period-${record.id}`"
                                    :aria-invalid="Boolean(errors.period_id)"
                                    ><SelectValue
                                        placeholder="Seleccione un periodo"
                                /></SelectTrigger>
                                <SelectContent
                                    ><SelectGroup>
                                        <SelectItem
                                            v-for="item in options.periods"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.nombre }}
                                        </SelectItem>
                                    </SelectGroup></SelectContent
                                >
                            </Select>
                            <FieldError :errors="[errors.period_id]" />
                        </Field>
                    </template>

                    <template v-else-if="entity === 'paralelo'">
                        <Field :data-invalid="Boolean(errors.offering_id)">
                            <FieldLabel
                                :for="`edit-parallel-offering-${record.id}`"
                                required
                                >Oferta académica</FieldLabel
                            >
                            <Select
                                name="offering_id"
                                :default-value="record.offering_id"
                                required
                            >
                                <SelectTrigger
                                    :id="`edit-parallel-offering-${record.id}`"
                                    :aria-invalid="Boolean(errors.offering_id)"
                                    ><SelectValue
                                        placeholder="Seleccione una oferta"
                                /></SelectTrigger>
                                <SelectContent
                                    ><SelectGroup>
                                        <SelectItem
                                            v-for="item in options.offerings"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.label }}
                                        </SelectItem>
                                    </SelectGroup></SelectContent
                                >
                            </Select>
                            <FieldError :errors="[errors.offering_id]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel
                                :for="`edit-parallel-code-${record.id}`"
                                required
                                >Código de paralelo</FieldLabel
                            >
                            <Input
                                :id="`edit-parallel-code-${record.id}`"
                                name="code"
                                :default-value="record.code"
                                placeholder="Ej. A"
                                required
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>
                    </template>

                    <template v-else>
                        <Field :data-invalid="Boolean(errors.user_id)">
                            <FieldLabel
                                :for="`edit-teacher-user-${record.id}`"
                                required
                                >Docente</FieldLabel
                            >
                            <Select
                                name="user_id"
                                :default-value="record.user_id"
                                required
                            >
                                <SelectTrigger
                                    :id="`edit-teacher-user-${record.id}`"
                                    :aria-invalid="Boolean(errors.user_id)"
                                    ><SelectValue
                                        placeholder="Seleccione un docente"
                                /></SelectTrigger>
                                <SelectContent
                                    ><SelectGroup>
                                        <SelectItem
                                            v-for="item in options.teacherUsers"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.name }} · {{ item.email }}
                                        </SelectItem>
                                    </SelectGroup></SelectContent
                                >
                            </Select>
                            <FieldDescription>
                                Aquí cambia quién dicta; el nombre y correo de
                                la cuenta solo los corrige Administración.
                            </FieldDescription>
                            <FieldError :errors="[errors.user_id]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.parallel_id)">
                            <FieldLabel
                                :for="`edit-teacher-parallel-${record.id}`"
                                required
                                >Materia, periodo y paralelo</FieldLabel
                            >
                            <Select
                                name="parallel_id"
                                :default-value="record.parallel_id"
                                required
                            >
                                <SelectTrigger
                                    :id="`edit-teacher-parallel-${record.id}`"
                                    :aria-invalid="Boolean(errors.parallel_id)"
                                    ><SelectValue
                                        placeholder="Seleccione un paralelo"
                                /></SelectTrigger>
                                <SelectContent
                                    ><SelectGroup>
                                        <SelectItem
                                            v-for="item in options.parallels"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.label }}
                                        </SelectItem>
                                    </SelectGroup></SelectContent
                                >
                            </Select>
                            <FieldError :errors="[errors.parallel_id]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.valid_from)">
                            <FieldLabel
                                :for="`edit-teacher-from-${record.id}`"
                                required
                                >Vigente desde</FieldLabel
                            >
                            <DatePicker
                                :id="`edit-teacher-from-${record.id}`"
                                name="valid_from"
                                :default-value="record.valid_from"
                                required
                                :aria-invalid="Boolean(errors.valid_from)"
                            />
                            <FieldError :errors="[errors.valid_from]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.valid_until)">
                            <FieldLabel :for="`edit-teacher-until-${record.id}`"
                                >Vigente hasta</FieldLabel
                            >
                            <DatePicker
                                :id="`edit-teacher-until-${record.id}`"
                                name="valid_until"
                                :default-value="record.valid_until ?? ''"
                                :aria-invalid="Boolean(errors.valid_until)"
                            />
                            <FieldError :errors="[errors.valid_until]" />
                        </Field>
                    </template>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Check"
                        label="Guardar cambios"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
