<script setup lang="ts">
import { Form, useForm } from '@inertiajs/vue3';
import { CalendarCheck, Plus } from '@lucide/vue';
import { computed, watch } from 'vue';
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

const title = computed(() =>
    props.entity === 'oferta' ? 'Preparar periodo' : 'Agregar paralelo',
);
const description = computed(() =>
    props.entity === 'oferta'
        ? 'Toda materia de la malla activa queda con su oferta y un paralelo A. Campus y modalidad vienen de la carrera. Lo que no se dicte este periodo se archiva después.'
        : 'Agregue un paralelo a una oferta académica existente.',
);

/*
 * Preparar periodo (I-36): un solo dato, el periodo. Se envía como JSON con `useForm`
 * para leer la respuesta y cerrar el panel al terminar.
 */
const prepare = useForm<{ period_id: string }>({ period_id: '' });
const subjectCount = computed(() => props.options.activeSubjects.length);
const submitPrepare = (close: () => void): void => {
    prepare.post(CareerAcademicStructureController.preparePeriod.url(), {
        preserveScroll: true,
        onSuccess: () => {
            prepare.reset();
            close();
        },
    });
};
/* Cualquier rechazo del servidor se muestra: sin esto el panel quedaría mudo. */
const prepareError = computed(
    () => Object.values(prepare.errors).find(Boolean) ?? undefined,
);

watch(
    () => props.entity,
    () => prepare.reset(),
);
</script>

<template>
    <FormSheet
        :trigger-label="
            props.entity === 'oferta' ? 'Preparar periodo' : 'Agregar'
        "
        :title="title"
        :description="description"
    >
        <template #default="{ close }">
            <form
                v-if="props.entity === 'oferta'"
                class="contents"
                @submit.prevent="submitPrepare(close)"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(prepareError)">
                        <FieldLabel for="offering-period" required>
                            Periodo académico
                        </FieldLabel>
                        <Select v-model="prepare.period_id" required>
                            <SelectTrigger
                                id="offering-period"
                                :aria-invalid="Boolean(prepareError)"
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
                        <FieldError :errors="[prepareError]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="prepare.processing"
                        :disabled="subjectCount === 0"
                        :icon="CalendarCheck"
                        label="Preparar periodo"
                    />
                </FieldGroup>
            </form>
            <Form
                v-else
                v-bind="
                    CareerAcademicStructureController.store.form(props.entity)
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
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
                        <FieldLabel for="parallel-shift">Jornada</FieldLabel>
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
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Plus"
                        label="Crear paralelo"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
