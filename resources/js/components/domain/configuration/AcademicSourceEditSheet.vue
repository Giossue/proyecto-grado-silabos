<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check, Pencil } from '@lucide/vue';
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

defineProps<{
    source: {
        id: string;
        name: string;
        description: string | null;
        internal_notes: string | null;
    };
}>();
</script>

<template>
    <FormSheet
        trigger-label="Editar fuente"
        title="Editar fuente académica"
        description="Cambie el nombre, la descripción o las notas internas. El contenido se edita en la propia página."
    >
        <template #trigger>
            <Button variant="outline">
                <Pencil data-icon="inline-start" aria-hidden="true" />
                Editar fuente
            </Button>
        </template>
        <template #default="{ close }">
            <Form
                v-bind="AcademicSourceController.update.form(source.id)"
                v-slot="{ errors, processing }"
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.name)">
                        <FieldLabel for="source-edit-name" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="source-edit-name"
                            name="name"
                            :default-value="source.name"
                            required
                            :aria-invalid="Boolean(errors.name)"
                        />
                        <FieldError :errors="[errors.name]" />
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
