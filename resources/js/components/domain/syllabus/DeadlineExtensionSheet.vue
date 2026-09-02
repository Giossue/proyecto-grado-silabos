<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { CalendarClock } from '@lucide/vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';

defineProps<{
    convocationId: string;
}>();
</script>

<template>
    <FormSheet
        trigger-label="Prorrogar plazo"
        title="Prorrogar el plazo"
        description="La prórroga es una excepción: solo se puede mover la fecha hacia adelante y el motivo queda registrado en auditoría junto con la fecha anterior."
    >
        <template #trigger>
            <Button variant="outline">Prorrogar plazo</Button>
        </template>
        <template #default="{ close }">
            <Form
                v-bind="
                    ConvocationController.extendDeadline.form(convocationId)
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.stage)">
                        <FieldLabel for="extension-stage" required>
                            Etapa
                        </FieldLabel>
                        <Select name="stage" default-value="borrador" required>
                            <SelectTrigger
                                id="extension-stage"
                                :aria-invalid="Boolean(errors.stage)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="borrador">
                                        Entrega del borrador
                                    </SelectItem>
                                    <SelectItem value="inicio">
                                        Inicio de la elaboración
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.stage]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.due_at)">
                        <FieldLabel for="extension-due" required>
                            Nueva fecha
                        </FieldLabel>
                        <Input
                            id="extension-due"
                            name="due_at"
                            type="datetime-local"
                            :aria-invalid="Boolean(errors.due_at)"
                            required
                        />
                        <FieldDescription>
                            Debe ser posterior a la vigente: adelantarla dejaría
                            fuera de plazo a quien ya estaba dentro.
                        </FieldDescription>
                        <FieldError :errors="[errors.due_at]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.reason)">
                        <FieldLabel for="extension-reason" required>
                            Motivo
                        </FieldLabel>
                        <Textarea
                            id="extension-reason"
                            name="reason"
                            rows="3"
                            :aria-invalid="Boolean(errors.reason)"
                            placeholder="Relevo de docente por licencia; el reemplazo asumió el 12 de octubre."
                            required
                        />
                        <FieldError
                            :errors="[errors.reason, errors.convocation]"
                        />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="CalendarClock"
                        label="Prorrogar"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
