<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
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
        trigger-label="Nueva plantilla"
        title="Nueva plantilla de sílabo"
        description="Se crearán las doce áreas funcionales base de la plantilla institucional en una versión borrador. Después podrá completar su estructura en el constructor."
    >
        <template #default="{ close }">
            <Form
                v-bind="TemplateController.store.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel for="template-name" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="template-name"
                            name="nombre"
                            placeholder="Ej. Plantilla institucional de sílabos"
                            required
                            :aria-invalid="Boolean(errors.nombre)"
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.description)">
                        <FieldLabel for="template-description">
                            Descripción
                        </FieldLabel>
                        <Textarea
                            id="template-description"
                            name="description"
                            :aria-invalid="Boolean(errors.description)"
                        />
                        <FieldError :errors="[errors.description]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Plus"
                        label="Crear y abrir constructor"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
