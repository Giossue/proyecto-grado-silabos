<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { CalendarPlus, Check } from '@lucide/vue';
import { computed } from 'vue';
import SyllabusProcessController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/SyllabusProcessController';
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

const props = defineProps<{
    templates: { id: string; label: string }[];
    /** Sin proceso se prepara uno nuevo; con proceso se corrige el existente. */
    process?: {
        id: string;
        name: string;
        template_version_id: string;
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

// `datetime-local` no entiende la zona: se le da la hora tal como la ve quien edita.
const toLocalInput = (value: string | undefined): string | undefined => {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    const pad = (n: number): string => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Nuevo proceso"
        :title="
            process ? `Editar ${process.name}` : 'Preparar proceso de sílabos'
        "
        description="El calendario institucional obliga a todas las carreras: fija la plantilla con la que se elaboran los sílabos y las fechas de inicio y entrega. Cada coordinación convoca a su carrera dentro de este proceso."
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

                    <Field :data-invalid="Boolean(errors.template_version_id)">
                        <FieldLabel for="process-template" required>
                            Plantilla publicada
                        </FieldLabel>
                        <Select
                            name="template_version_id"
                            :default-value="process?.template_version_id"
                            required
                        >
                            <SelectTrigger
                                id="process-template"
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
                        <FieldDescription>
                            Los expedientes ya creados conservan la plantilla
                            con la que nacieron; el cambio aplica a las
                            convocatorias que se abran después.
                        </FieldDescription>
                        <FieldError :errors="[errors.template_version_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.starts_at)">
                        <FieldLabel for="process-starts" required>
                            Inicio de la elaboración
                        </FieldLabel>
                        <Input
                            id="process-starts"
                            name="starts_at"
                            type="datetime-local"
                            :default-value="toLocalInput(process?.starts_at)"
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
                        <Input
                            id="process-due"
                            name="due_at"
                            type="datetime-local"
                            :default-value="toLocalInput(process?.due_at)"
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
