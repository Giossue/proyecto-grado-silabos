<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import AcademicSourceController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/AcademicSourceController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
</script>

<template>
    <FormSheet
        trigger-label="Nueva fuente"
        title="Nueva fuente académica"
        description="Identifique el documento. Su contenido se redacta después, en la página de la fuente."
    >
        <template #default="{ close }">
            <Form
                v-bind="AcademicSourceController.store.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel for="source-name" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="source-name"
                            name="nombre"
                            placeholder="Ej. Reglamento de régimen académico"
                            required
                            :aria-invalid="Boolean(errors.nombre)"
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.description)">
                        <FieldLabel for="source-description">
                            Descripción
                        </FieldLabel>
                        <Textarea
                            id="source-description"
                            name="description"
                            :aria-invalid="Boolean(errors.description)"
                        />
                        <FieldError :errors="[errors.description]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.internal_notes)">
                        <FieldLabel for="source-internal-notes">
                            Notas internas
                        </FieldLabel>
                        <Textarea
                            id="source-internal-notes"
                            name="internal_notes"
                            :aria-invalid="Boolean(errors.internal_notes)"
                        />
                        <FieldError :errors="[errors.internal_notes]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Plus"
                        label="Crear fuente"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
