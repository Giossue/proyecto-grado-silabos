<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Play } from '@lucide/vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

defineProps<{ processes: { id: string; label: string; state: string; period_name: string; started_for_career: boolean }[] }>();
</script>

<template>
    <FormSheet
        trigger-label="Iniciar convocatoria"
        title="Iniciar convocatoria de carrera"
        description="Seleccione la convocatoria institucional abierta. Se usan automáticamente todas las fuentes activas de su carrera y se genera un sílabo por paralelo con docente vigente."
    >
        <template #default="{ close }">
            <Form v-bind="ConvocationController.store.form()" v-slot="{ errors, processing }" @success="close">
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.process_id)">
                        <FieldLabel for="convocation-process" required>Convocatoria institucional</FieldLabel>
                        <Select name="process_id" required>
                            <SelectTrigger id="convocation-process" :aria-invalid="Boolean(errors.process_id)">
                                <SelectValue placeholder="Seleccione una convocatoria abierta" />
                            </SelectTrigger>
                            <SelectContent><SelectGroup>
                                <SelectItem v-for="process in processes" :key="process.id" :value="process.id" :disabled="process.state !== 'abierto' || process.started_for_career">
                                    {{ process.label }} · {{ process.period_name }}{{ process.started_for_career ? ' · Ya iniciada para su carrera' : '' }}
                                </SelectItem>
                            </SelectGroup></SelectContent>
                        </Select>
                        <FieldError :errors="[errors.process_id, errors.convocation]" />
                    </Field>
                    <FormSheetActions :close="close" :processing="processing" :icon="Play" label="Iniciar convocatoria" />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
