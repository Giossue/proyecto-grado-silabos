<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

type TemplateField = {
    id: string;
    key: string;
    label: string;
    help: string | null;
    ai_enabled: boolean;
    content_type: string;
};

const props = defineProps<{
    templateId: string;
}>();

/**
 * Lo poco que se decide por campo: la ayuda que ve el docente y, en los campos que
 * escribe, si la IA puede asistirlo. Todo campo es obligatorio y todo lo que no viene de
 * la malla lo llena el docente, así que no hay más casillas (decisión del responsable
 * del producto, 2026-09-03). La ficha de identificación y el estado de revisión son
 * bloques fijos: solo admiten ayuda.
 */
const FIXED_BLOCKS = ['institutional', 'flow'];
const open = ref(false);
const selected = ref<{ field: TemplateField; blockId: string } | null>(null);
const fixedBlock = computed(() =>
    FIXED_BLOCKS.includes(selected.value?.field.content_type ?? ''),
);

const form = computed(() =>
    selected.value
        ? TemplateController.updateField.form({
              template: props.templateId,
              field: selected.value.field.id,
          })
        : null,
);

const edit = (field: TemplateField, blockId: string): void => {
    selected.value = { field, blockId };
    open.value = true;
};

watch(open, (isOpen) => {
    if (!isOpen) {
        selected.value = null;
    }
});

defineExpose({ edit });
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Propiedades del campo"
        :show-trigger="false"
        title="Propiedades del campo"
        :description="
            selected
                ? `Cómo se comporta «${selected.field.label}» al llenar el sílabo.`
                : ''
        "
    >
        <template #default="{ close }">
            <Form
                v-if="selected && form"
                :key="selected.field.id"
                v-bind="form"
                :options="{ preserveScroll: true }"
                v-slot="{ errors, processing }"
                @success="close"
            >
                <input
                    type="hidden"
                    name="block_id"
                    :value="selected.blockId"
                />
                <input type="hidden" name="key" :value="selected.field.key" />
                <input
                    type="hidden"
                    name="label"
                    :value="selected.field.label"
                />
                <input
                    type="hidden"
                    name="content_type"
                    :value="selected.field.content_type"
                />

                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.help)">
                        <FieldLabel for="template-field-help">
                            Ayuda para el docente
                        </FieldLabel>
                        <Textarea
                            id="template-field-help"
                            name="help"
                            :default-value="selected.field.help ?? ''"
                            placeholder="Ej. Describa los resultados en infinitivo"
                            :aria-invalid="Boolean(errors.help)"
                        />
                        <FieldError :errors="[errors.help]" />
                    </Field>

                    <Field
                        v-if="!fixedBlock"
                        orientation="horizontal"
                        :data-invalid="Boolean(errors.ai_enabled)"
                    >
                        <input type="hidden" name="ai_enabled" value="0" />
                        <Checkbox
                            id="template-field-ai-enabled"
                            name="ai_enabled"
                            value="1"
                            :default-value="selected.field.ai_enabled"
                            :aria-invalid="Boolean(errors.ai_enabled)"
                        />
                        <FieldContent>
                            <FieldLabel for="template-field-ai-enabled">
                                Permite asistencia de IA
                            </FieldLabel>
                            <FieldError :errors="[errors.ai_enabled]" />
                        </FieldContent>
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Check"
                        label="Guardar cambios"
                    />
                    <FieldError :errors="[errors.field]" />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
