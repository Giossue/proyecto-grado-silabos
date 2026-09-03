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
import { PARALLEL_SHIFTS as SHIFTS } from '@/lib/parallelShifts';
import type { AcademicStructureProps } from '@/types/academic';

type OfferingEntity = 'oferta' | 'paralelo';

const props = defineProps<
    Pick<AcademicStructureProps, 'options'> & {
        entity: OfferingEntity;
    }
>();

const submitLabel = computed(() =>
    props.entity === 'oferta' ? 'Crear oferta' : 'Crear paralelo',
);
const title = computed(() =>
    props.entity === 'oferta' ? 'Agregar oferta' : 'Agregar paralelo',
);
const description = computed(() =>
    props.entity === 'oferta'
        ? 'Abra una materia de la malla activa para un periodo académico y campus. La modalidad la fija la carrera, o cada materia si la carrera combina modalidades.'
        : 'Agregue un paralelo a una oferta académica existente.',
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
                    <template v-if="props.entity === 'oferta'">
                        <Field :data-invalid="Boolean(errors.subject_id)">
                            <FieldLabel for="offering-subject" required>
                                Materia de la malla activa
                            </FieldLabel>
                            <Select name="subject_id" required>
                                <SelectTrigger
                                    id="offering-subject"
                                    :aria-invalid="Boolean(errors.subject_id)"
                                >
                                    <SelectValue
                                        placeholder="Seleccione una materia"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            v-for="item in options.activeSubjects"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.codigo_institucional }}
                                            ·
                                            {{ item.nombre }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldError :errors="[errors.subject_id]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.period_id)">
                            <FieldLabel for="offering-period" required>
                                Periodo académico
                            </FieldLabel>
                            <Select name="period_id" required>
                                <SelectTrigger
                                    id="offering-period"
                                    :aria-invalid="Boolean(errors.period_id)"
                                >
                                    <SelectValue
                                        placeholder="Seleccione un periodo"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            v-for="item in options.periods"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.nombre }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldError :errors="[errors.period_id]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.campus_id)">
                            <FieldLabel for="offering-campus" required>
                                Campus
                            </FieldLabel>
                            <Select name="campus_id" required>
                                <SelectTrigger
                                    id="offering-campus"
                                    :aria-invalid="Boolean(errors.campus_id)"
                                >
                                    <SelectValue
                                        placeholder="Seleccione un campus"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            v-for="item in options.campuses"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.nombre }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldError :errors="[errors.campus_id]" />
                        </Field>
                    </template>

                    <template v-else>
                        <Field :data-invalid="Boolean(errors.offering_id)">
                            <FieldLabel for="parallel-offering" required>
                                Oferta académica
                            </FieldLabel>
                            <Select name="offering_id" required>
                                <SelectTrigger
                                    id="parallel-offering"
                                    :aria-invalid="Boolean(errors.offering_id)"
                                >
                                    <SelectValue
                                        placeholder="Seleccione una oferta"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            v-for="item in options.offerings"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.label }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldError :errors="[errors.offering_id]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel for="parallel-code" required>
                                Código de paralelo
                            </FieldLabel>
                            <Input
                                id="parallel-code"
                                name="code"
                                placeholder="Ej. A"
                                required
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.shift)">
                            <FieldLabel for="parallel-shift"
                                >Jornada</FieldLabel
                            >
                            <Select name="shift">
                                <SelectTrigger
                                    id="parallel-shift"
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
