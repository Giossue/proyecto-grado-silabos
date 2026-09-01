<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { CalendarPlus } from '@lucide/vue';
import { ref } from 'vue';
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

defineProps<{
    periods: { id: string; nombre: string }[];
    templates: { id: string; label: string }[];
    sources: { id: string; label: string }[];
}>();

// Un sílabo por paralelo es el valor inicial. La agrupación por oferta se conserva
// disponible porque la carrera puede cambiar el criterio.
const groupingMode = ref('por_paralelo');
</script>

<template>
    <FormSheet
        trigger-label="Nueva convocatoria"
        title="Preparar convocatoria"
        description="Defina el periodo, la plantilla, las fuentes y el alcance. Esta preparación todavía no genera sílabos; podrá revisar el resumen antes de abrirla."
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

                    <Field :data-invalid="Boolean(errors.template_version_id)">
                        <FieldLabel for="convocation-template" required>
                            Plantilla publicada
                        </FieldLabel>
                        <Select name="template_version_id" required>
                            <SelectTrigger
                                id="convocation-template"
                                :aria-invalid="
                                    Boolean(errors.template_version_id)
                                "
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="template in templates"
                                        :key="template.id"
                                        :value="template.id"
                                    >
                                        {{ template.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.template_version_id]" />
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

                    <Field :data-invalid="Boolean(errors.start_date)">
                        <FieldLabel for="convocation-start" required>
                            Inicio de la elaboración
                        </FieldLabel>
                        <Input
                            id="convocation-start"
                            name="start_date"
                            type="datetime-local"
                            :aria-invalid="Boolean(errors.start_date)"
                            required
                        />
                        <FieldDescription>
                            Antes de esta fecha nadie puede enviar su sílabo.
                        </FieldDescription>
                        <FieldError :errors="[errors.start_date]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.draft_deadline)">
                        <FieldLabel for="convocation-deadline" required>
                            Fecha límite del borrador
                        </FieldLabel>
                        <Input
                            id="convocation-deadline"
                            name="draft_deadline"
                            type="datetime-local"
                            :aria-invalid="Boolean(errors.draft_deadline)"
                            required
                        />
                        <FieldDescription>
                            Vencida, el envío se bloquea hasta que usted conceda
                            una prórroga.
                        </FieldDescription>
                        <FieldError :errors="[errors.draft_deadline]" />
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
