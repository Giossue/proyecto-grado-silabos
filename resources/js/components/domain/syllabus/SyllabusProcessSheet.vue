<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { CalendarPlus, Check } from '@lucide/vue';
import { computed } from 'vue';
import SyllabusProcessController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/SyllabusProcessController';
import DateTimePicker from '@/components/DateTimePicker.vue';
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

const props = defineProps<{
    /** Nombre de la plantilla institucional; nula si aún no existe. */
    template: string | null;
    /** Sin proceso se prepara uno nuevo; con proceso se corrige el existente. */
    process?: {
        id: string;
        name: string;
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
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel for="process-name" required
                            >Nombre</FieldLabel
                        >
                        <Input
                            id="process-name"
                            name="nombre"
                            :default-value="process?.name"
                            :aria-invalid="Boolean(errors.nombre)"
                            placeholder="Ej. Elaboración de sílabos 2026-2027"
                            required
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <Field>
                        <p class="text-sm font-medium">Plantilla</p>
                        <FieldDescription>
                            <template v-if="template">
                                Se usará «{{ template }}», la plantilla
                                institucional. Los sílabos entregados conservan
                                su propia copia aunque la plantilla cambie
                                después.
                            </template>
                            <template v-else>
                                No hay plantilla institucional. Créela en
                                Plantillas antes de abrir el proceso.
                            </template>
                        </FieldDescription>
                    </Field>

                    <Field :data-invalid="Boolean(errors.starts_at)">
                        <FieldLabel for="process-starts" required>
                            Inicio de la elaboración
                        </FieldLabel>
                        <DateTimePicker
                            id="process-starts"
                            name="starts_at"
                            :default-value="process?.starts_at"
                            :aria-invalid="Boolean(errors.starts_at)"
                            required
                        />
                        <FieldDescription>
                            Antes de esta fecha nadie puede enviar su sílabo.
                        </FieldDescription>
                        <FieldError :errors="[errors.starts_at]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.due_at)">
                        <FieldLabel for="process-due" required>
                            Fecha límite de entrega
                        </FieldLabel>
                        <DateTimePicker
                            id="process-due"
                            name="due_at"
                            :default-value="process?.due_at"
                            :aria-invalid="Boolean(errors.due_at)"
                            required
                        />
                        <FieldDescription>
                            Cada coordinación puede prorrogar la de su carrera;
                            esta es la fecha de la que parten.
                        </FieldDescription>
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
