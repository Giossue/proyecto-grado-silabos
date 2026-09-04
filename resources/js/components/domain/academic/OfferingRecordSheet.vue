<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
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
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PARALLEL_SHIFTS as SHIFTS } from '@/lib/parallelShifts';
import type { AcademicStructureProps } from '@/types/academic';

type OfferingEntity = 'oferta' | 'paralelo';

const props = defineProps<
    Pick<AcademicStructureProps, 'options'> & {
        entity: OfferingEntity;
    }
>();

const title = computed(() =>
    props.entity === 'oferta' ? 'Preparar periodo' : 'Agregar paralelos',
);
const description = computed(() =>
    props.entity === 'oferta'
        ? 'Toda materia de la malla activa queda con su oferta y un paralelo A. Campus y modalidad vienen de la carrera. Lo que no se dicte este periodo se elimina después.'
        : 'Agregue varios paralelos a una oferta. Escriba un código por línea o sepárelos con comas; todos tendrán la misma jornada.',
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

const parallels = useForm<{
    offering_id: string;
    codes: string;
    shift: string;
}>({
    offering_id: '',
    codes: '',
    shift: '',
});
const parallelCodes = (): string[] =>
    parallels.codes
        .split(/[;,\n]/)
        .map((code) => code.trim())
        .filter(Boolean);
const submitParallels = (close: () => void): void => {
    parallels
        .transform((data) => ({
            offering_id: data.offering_id,
            codes: parallelCodes(),
            shift: data.shift || null,
        }))
        .post(CareerAcademicStructureController.storeParallels.url(), {
            preserveScroll: true,
            onSuccess: () => {
                parallels.reset();
                close();
            },
        });
};

watch(
    () => props.entity,
    () => {
        prepare.reset();
        parallels.reset();
    },
);
</script>

<template>
    <FormSheet
        :trigger-label="
            props.entity === 'oferta' ? 'Preparar periodo' : 'Agregar varios'
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
            <form
                v-else
                class="contents"
                @submit.prevent="submitParallels(close)"
            >
                <FieldGroup>
                    <Field
                        :data-invalid="Boolean(parallels.errors.offering_id)"
                    >
                        <FieldLabel for="parallel-offering" required>
                            Oferta académica
                        </FieldLabel>
                        <Select v-model="parallels.offering_id" required>
                            <SelectTrigger
                                id="parallel-offering"
                                :aria-invalid="
                                    Boolean(parallels.errors.offering_id)
                                "
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
                        <FieldError :errors="[parallels.errors.offering_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(parallels.errors.codes)">
                        <FieldLabel for="parallel-codes" required>
                            Códigos de paralelo
                        </FieldLabel>
                        <Textarea
                            id="parallel-codes"
                            v-model="parallels.codes"
                            placeholder="Ej. B, C, D"
                            required
                            :aria-invalid="Boolean(parallels.errors.codes)"
                        />
                        <p class="text-sm text-muted-foreground">
                            Un código por línea, o separados por coma.
                        </p>
                        <FieldError :errors="[parallels.errors.codes]" />
                    </Field>
                    <Field :data-invalid="Boolean(parallels.errors.shift)">
                        <FieldLabel for="parallel-shift">Jornada</FieldLabel>
                        <Select v-model="parallels.shift">
                            <SelectTrigger
                                id="parallel-shift"
                                :aria-invalid="Boolean(parallels.errors.shift)"
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
                        <FieldError :errors="[parallels.errors.shift]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="parallels.processing"
                        :icon="Plus"
                        label="Crear paralelos"
                    />
                </FieldGroup>
            </form>
        </template>
    </FormSheet>
</template>
