<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { CalendarPlus, Check } from '@lucide/vue';
import { computed } from 'vue';
import SyllabusProcessController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/SyllabusProcessController';
import DatePicker from '@/components/DatePicker.vue';
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

const props = defineProps<{
    /** Nombre de la plantilla institucional; nula si aún no existe. */
    template: string | null;
    periods: { id: string; nombre: string }[];
    /** Sin proceso se prepara uno nuevo; con proceso se corrige el existente. */
    process?: {
        id: string;
        name: string;
        period_id: string;
        period_name: string;
        starts_at: string;
        due_at: string;
    } | null;
    /** `menu` lo dibuja sin disparador propio: lo abre la opción del menú de la fila. */
    display?: 'button' | 'menu';
}>();

const open = defineModel<boolean>('open', { default: false });

const formRoute = computed(() =>
    props.process
        ? SyllabusProcessController.update.form(props.process.id)
        : SyllabusProcessController.store.form(),
);
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Nuevo proceso"
        :title="
            process ? `Editar ${process.name}` : 'Preparar proceso de sílabos'
        "
        description="El calendario institucional obliga a todas las carreras: fija las fechas de inicio y entrega con las que se elaboran los sílabos. Cada coordinación convoca a su carrera dentro de este proceso."
        :show-trigger="display !== 'menu'"
    >
        <template #default="{ close }">
            <Form
                :key="process?.id ?? 'new'"
                v-bind="formRoute"
                v-slot="{ errors, processing }"
                :reset-on-success="process === null"
                @success="close"
            >
                <FieldGroup>
                    <Field v-if="errors.process" data-invalid>
                        <FieldError :errors="[errors.process]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.period_id)">
                        <FieldLabel for="process-period" required>
                            Periodo académico
                        </FieldLabel>
                        <Select
                            name="period_id"
                            :default-value="process?.period_id"
                            required
                        >
                            <SelectTrigger
                                id="process-period"
                                :aria-invalid="Boolean(errors.period_id)"
                            >
                                <SelectValue placeholder="Seleccione un periodo" />
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
                        <p v-if="process" class="text-sm text-muted-foreground">
                            No se puede cambiar si ya existen convocatorias.
                        </p>
                        <FieldError :errors="[errors.period_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.starts_at)">
                        <FieldLabel for="process-starts" required>
                            Inicio de la elaboración
                        </FieldLabel>
                        <DatePicker
                            id="process-starts"
                            name="starts_at"
                            :default-value="process?.starts_at?.slice(0, 10)"
                            :aria-invalid="Boolean(errors.starts_at)"
                            required
                        />
                        <FieldError :errors="[errors.starts_at]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.due_at)">
                        <FieldLabel for="process-due" required>
                            Fecha límite de entrega
                        </FieldLabel>
                        <DatePicker
                            id="process-due"
                            name="due_at"
                            :default-value="process?.due_at?.slice(0, 10)"
                            :aria-invalid="Boolean(errors.due_at)"
                            required
                        />
                        <FieldError :errors="[errors.due_at]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="process ? Check : CalendarPlus"
                        :label="
                            process ? 'Guardar cambios' : 'Preparar proceso'
                        "
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
