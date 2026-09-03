<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { CalendarPlus } from '@lucide/vue';
import { computed, ref } from 'vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
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

const props = defineProps<{
    periods: { id: string; nombre: string }[];
    processes: {
        id: string;
        label: string;
        state: string;
        template: string;
        starts_at: string;
        due_at: string;
    }[];
    sources: { id: string; label: string }[];
}>();

// Un sílabo por paralelo es el valor inicial. La agrupación por oferta se conserva
// disponible porque la carrera puede cambiar el criterio.
const groupingMode = ref('por_paralelo');

// El calendario lo fija Administración: al elegir el proceso se muestra lo que la
// convocatoria hereda, para que no haga falta ir a mirarlo a otra pantalla.
const processId = ref('');
const selectedProcess = computed(() =>
    props.processes.find((process) => process.id === processId.value),
);

const processStateLabel = (state: string): string =>
    ({
        preparacion: 'en preparación',
        abierto: 'abierto',
        pausado: 'en pausa',
    })[state] ?? state;

const formatDate = (value: string): string =>
    new Intl.DateTimeFormat('es-EC', {
        dateStyle: 'long',
    }).format(new Date(value));
</script>

<template>
    <FormSheet
        trigger-label="Nueva convocatoria"
        title="Preparar convocatoria"
        description="Elija el proceso institucional, el periodo, las fuentes y el alcance. La plantilla y las fechas se heredan del proceso. Esta preparación todavía no genera sílabos; podrá revisar el resumen antes de abrirla."
    >
        <template #default="{ close }">
            <Form
                v-bind="ConvocationController.store.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel for="convocation-name" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="convocation-name"
                            name="nombre"
                            :aria-invalid="Boolean(errors.nombre)"
                            placeholder="Ej. Elaboración de sílabos 2026-2027"
                            required
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.process_id)">
                        <FieldLabel for="convocation-process" required>
                            Proceso institucional
                        </FieldLabel>
                        <Select v-model="processId" name="process_id" required>
                            <SelectTrigger
                                id="convocation-process"
                                :aria-invalid="Boolean(errors.process_id)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="process in processes"
                                        :key="process.id"
                                        :value="process.id"
                                    >
                                        {{ process.label }} ·
                                        {{ processStateLabel(process.state) }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldDescription v-if="selectedProcess">
                            Plantilla {{ selectedProcess.template }}.
                            Elaboración desde
                            {{ formatDate(selectedProcess.starts_at) }} hasta
                            {{ formatDate(selectedProcess.due_at) }}. Podrá
                            prorrogar la entrega de su carrera después.
                        </FieldDescription>
                        <FieldDescription v-else>
                            Lo abre Administración según el calendario
                            académico; aquí solo se elige a cuál convocar.
                        </FieldDescription>
                        <FieldError :errors="[errors.process_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.period_id)">
                        <FieldLabel for="convocation-period" required>
                            Periodo académico
                        </FieldLabel>
                        <Select name="period_id" required>
                            <SelectTrigger
                                id="convocation-period"
                                :aria-invalid="Boolean(errors.period_id)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="period in periods"
                                        :key="period.id"
                                        :value="period.id"
                                    >
                                        {{ period.nombre }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.period_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.grouping_mode)">
                        <FieldLabel for="convocation-grouping" required>
                            Agrupación explícita
                        </FieldLabel>
                        <Select
                            v-model="groupingMode"
                            name="grouping_mode"
                            required
                        >
                            <SelectTrigger
                                id="convocation-grouping"
                                :aria-invalid="Boolean(errors.grouping_mode)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="por_oferta">
                                        Un sílabo por oferta
                                    </SelectItem>
                                    <SelectItem value="por_paralelo">
                                        Un sílabo por paralelo
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.grouping_mode]" />
                    </Field>

                    <FieldSet>
                        <FieldLegend variant="label" required>
                            Fuentes académicas
                        </FieldLegend>
                        <FieldError
                            :errors="[
                                errors.source_ids,
                                errors['source_ids.0'],
                            ]"
                        />
                        <div class="grid gap-3">
                            <Field
                                v-for="source in sources"
                                :key="source.id"
                                orientation="horizontal"
                            >
                                <Checkbox
                                    :id="`source-${source.id}`"
                                    name="source_ids[]"
                                    :value="source.id"
                                />
                                <FieldLabel :for="`source-${source.id}`">
                                    {{ source.label }}
                                </FieldLabel>
                            </Field>
                        </div>
                    </FieldSet>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="CalendarPlus"
                        label="Preparar convocatoria"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
