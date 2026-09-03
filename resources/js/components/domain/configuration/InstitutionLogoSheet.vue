<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check } from '@lucide/vue';
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

/** Reemplazo del logo de la universidad que encabeza todos los sílabos. */
defineProps<{
    currentUrl: string;
    size: { width: number; height: number };
}>();
</script>

<template>
    <FormSheet
        trigger-label="Logo de la universidad"
        title="Logo de la universidad"
        description="Encabeza todos los sílabos, de todas las carreras. Se reemplaza en el sitio."
    >
        <template #default="{ close }">
            <Form
                v-bind="TemplateController.storeLogo.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <div class="rounded-md border bg-white p-3">
                        <img
                            :src="currentUrl"
                            alt="Logo actual de la universidad"
                            class="mx-auto h-16 w-auto"
                        />
                    </div>
                    <Field :data-invalid="Boolean(errors.logo)">
                        <FieldLabel for="institution-logo" required>
                            Nuevo logo (PNG sin fondo)
                        </FieldLabel>
                        <Input
                            id="institution-logo"
                            name="logo"
                            type="file"
                            accept="image/png"
                            required
                            :aria-invalid="Boolean(errors.logo)"
                        />
                        <FieldError :errors="[errors.logo]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Check"
                        label="Guardar logo"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
