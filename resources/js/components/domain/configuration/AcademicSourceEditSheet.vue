<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check } from '@lucide/vue';
import AcademicSourceController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/AcademicSourceController';
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
import { Textarea } from '@/components/ui/textarea';

const props = defineProps<{
    source: {
        id: string;
        name: string;
        description: string | null;
        internal_notes: string | null;
    };
    /** `menu` lo dibuja sin disparador propio: lo abre la opción del menú de la fila. */
    display?: 'button' | 'menu';
}>();

const open = defineModel<boolean>('open', { default: false });
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Editar fuente"
        :show-trigger="props.display !== 'menu'"
        title="Editar fuente académica"
        description="Cambie el nombre, la descripción o las notas internas. El contenido se edita en la propia página."
    >
        <template #trigger>
            <Button variant="outline">Editar fuente</Button>
        </template>
        <template #default="{ close }">
            <Form
                v-bind="AcademicSourceController.update.form(source.id)"
                v-slot="{ errors, processing }"
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel for="source-edit-name" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="source-edit-name"
                            name="nombre"
                            placeholder="Ej. Reglamento de régimen académico"
                            :default-value="source.name"
                            required
                            :aria-invalid="Boolean(errors.nombre)"
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.description)">
                        <FieldLabel for="source-edit-description">
                            Descripción
                        </FieldLabel>
                        <Textarea
                            id="source-edit-description"
                            name="description"
                            :default-value="source.description ?? ''"
                            :aria-invalid="Boolean(errors.description)"
                        />
                        <FieldDescription>
                            Los docentes la ven junto al nombre de la fuente.
                        </FieldDescription>
                        <FieldError :errors="[errors.description]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.internal_notes)">
                        <FieldLabel for="source-edit-internal-notes">
                            Notas internas
                        </FieldLabel>
                        <Textarea
                            id="source-edit-internal-notes"
                            name="internal_notes"
                            :default-value="source.internal_notes ?? ''"
                            :aria-invalid="Boolean(errors.internal_notes)"
                        />
                        <FieldDescription>
                            Solo las ve la coordinación.
                        </FieldDescription>
                        <FieldError :errors="[errors.internal_notes]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Check"
                        label="Guardar cambios"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
