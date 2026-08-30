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

defineProps<{
    sourceVersionId: string;
}>();
</script>

<template>
    <FormSheet
        trigger-label="Agregar fragmento"
        title="Agregar fragmento de evidencia"
        description="Registre contenido narrativo, un valor JSON estructurado o ambos. El fragmento conservará la identidad de esta versión."
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    AcademicSourceController.addFragment.form(sourceVersionId)
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.key)">
                        <FieldLabel for="source-fragment-key" required>
                            Clave estable
                        </FieldLabel>
                        <Input
                            id="source-fragment-key"
                            name="key"
                            placeholder="perfil.egreso"
                            required
                            :aria-invalid="Boolean(errors.key)"
                        />
                        <FieldError :errors="[errors.key]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.title)">
                        <FieldLabel for="source-fragment-title" required>
                            Título
                        </FieldLabel>
                        <Input
                            id="source-fragment-title"
                            name="title"
                            required
                            :aria-invalid="Boolean(errors.title)"
                        />
                        <FieldError :errors="[errors.title]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.content)">
                        <FieldLabel for="source-fragment-content" required>
                            Contenido textual (si no registra valor JSON)
                        </FieldLabel>
                        <Textarea
                            id="source-fragment-content"
                            name="content"
                            :aria-invalid="Boolean(errors.content)"
                        />
                        <FieldError :errors="[errors.content]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.data_key)">
                        <FieldLabel for="source-fragment-data-key">
                            Clave de dato exacto (opcional)
                        </FieldLabel>
                        <Input
                            id="source-fragment-data-key"
                            name="data_key"
                            placeholder="creditos.sw601"
                            :aria-invalid="Boolean(errors.data_key)"
                        />
                        <FieldError :errors="[errors.data_key]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.structured_value)">
                        <FieldLabel
                            for="source-fragment-structured-value"
                            required
                        >
                            Valor JSON (si no registra contenido textual)
                        </FieldLabel>
                        <Textarea
                            id="source-fragment-structured-value"
                            name="structured_value"
                            placeholder='{"value": 4, "unit": "credits"}'
                            :aria-invalid="Boolean(errors.structured_value)"
                        />
                        <FieldError :errors="[errors.structured_value]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Plus"
                        label="Agregar fragmento"
                    />
                    <FieldError :errors="[errors.version]" />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
