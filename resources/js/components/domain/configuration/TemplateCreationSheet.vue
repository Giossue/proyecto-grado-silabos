<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
} from '@/components/ui/field';
</script>

<template>
    <FormSheet
        trigger-label="Nueva plantilla"
        title="Nueva plantilla de sílabo"
        description="Se crearán las doce áreas funcionales base de la plantilla institucional. Después podrá completar su estructura en el constructor."
    >
        <template #default="{ close }">
            <Form
                v-bind="TemplateController.store.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.template)">
                        <FieldError :errors="[errors.template]" />
                        <FieldDescription>
                            La plantilla es una sola y se llama «Plantilla
                            institucional de sílabo». Nace con las doce áreas
                            funcionales base; después organiza sus bloques y
                            campos en el constructor.
                        </FieldDescription>
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Plus"
                        label="Crear plantilla"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
