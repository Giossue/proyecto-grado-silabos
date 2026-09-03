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
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type TemplateField = {
    id: string;
    key: string;
    label: string;
    help: string | null;
    required: boolean;
    inherited: boolean;
    master_source: string | null;
    teacher_editable: boolean;
    ai_enabled: boolean;
    document_marker: string | null;
    content_type: string;
};

const props = defineProps<{
    templateId: string;
}>();

/**
 * Propiedades avanzadas de un campo. El nombre y el tipo se cambian sobre la
 * hoja; aquí va lo que no cabe en un clic: obligatoriedad, herencia, IA y ayuda.
 */
const open = ref(false);
const selected = ref<{ field: TemplateField; blockId: string } | null>(null);
const inherited = ref(false);

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
    inherited.value = field.inherited;
    open.value = true;
};

watch(open, (isOpen) => {
    if (!isOpen) {
        selected.value = null;
        inherited.value = false;
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

                    <FieldSet>
                        <FieldLegend variant="label">
                            Comportamiento del campo
                        </FieldLegend>
                        <FieldGroup>
                            <Field
                                orientation="horizontal"
                                :data-invalid="Boolean(errors.required)"
                            >
                                <input
                                    type="hidden"
                                    name="required"
                                    value="0"
                                />
                                <Checkbox
                                    id="template-field-required"
                                    name="required"
                                    value="1"
                                    :default-value="selected.field.required"
                                    :aria-invalid="Boolean(errors.required)"
                                />
                                <FieldLabel for="template-field-required">
                                    Obligatorio
                                </FieldLabel>
                                <FieldError :errors="[errors.required]" />
                            </Field>

                            <Field
                                orientation="horizontal"
                                :data-invalid="Boolean(errors.teacher_editable)"
                            >
                                <input
                                    type="hidden"
                                    name="teacher_editable"
                                    value="0"
                                />
                                <Checkbox
                                    id="template-field-teacher-editable"
                                    name="teacher_editable"
                                    value="1"
                                    :default-value="
                                        selected.field.teacher_editable
                                    "
                                    :aria-invalid="
                                        Boolean(errors.teacher_editable)
                                    "
                                />
                                <FieldLabel
                                    for="template-field-teacher-editable"
                                >
                                    Editable por docente
                                </FieldLabel>
                                <FieldError
                                    :errors="[errors.teacher_editable]"
                                />
                            </Field>

                            <Field
                                orientation="horizontal"
                                :data-invalid="Boolean(errors.ai_enabled)"
                            >
                                <input
                                    type="hidden"
                                    name="ai_enabled"
                                    value="0"
                                />
                                <Checkbox
                                    id="template-field-ai-enabled"
                                    name="ai_enabled"
                                    value="1"
                                    :default-value="selected.field.ai_enabled"
                                    :aria-invalid="Boolean(errors.ai_enabled)"
                                />
                                <FieldLabel for="template-field-ai-enabled">
                                    Permite asistencia de IA
                                </FieldLabel>
                                <FieldError :errors="[errors.ai_enabled]" />
                            </Field>

                            <Field
                                orientation="horizontal"
                                :data-invalid="Boolean(errors.inherited)"
                            >
                                <input
                                    type="hidden"
                                    name="inherited"
                                    value="0"
                                />
                                <Checkbox
                                    id="template-field-inherited"
                                    v-model="inherited"
                                    name="inherited"
                                    value="1"
                                    :aria-invalid="Boolean(errors.inherited)"
                                />
                                <FieldLabel for="template-field-inherited">
                                    Se llena desde la malla
                                </FieldLabel>
                                <FieldError :errors="[errors.inherited]" />
                            </Field>
                        </FieldGroup>
                    </FieldSet>

                    <Field
                        v-if="inherited"
                        :data-invalid="Boolean(errors.master_source)"
                    >
                        <FieldLabel for="template-field-master-source" required>
                            Dato de la malla que lo llena
                        </FieldLabel>
                        <Input
                            id="template-field-master-source"
                            name="master_source"
                            :default-value="selected.field.master_source ?? ''"
                            placeholder="Ej. perfil_egreso"
                            required
                            :aria-invalid="Boolean(errors.master_source)"
                        />
                        <FieldError :errors="[errors.master_source]" />
                    </Field>
                    <input v-else type="hidden" name="master_source" value="" />

                    <Field :data-invalid="Boolean(errors.document_marker)">
                        <FieldLabel for="template-field-document-marker">
                            Marcador en el documento exportado
                        </FieldLabel>
                        <Input
                            id="template-field-document-marker"
                            name="document_marker"
                            :default-value="
                                selected.field.document_marker ?? ''
                            "
                            placeholder="Ej. RESULTADOS_APRENDIZAJE"
                            :aria-invalid="Boolean(errors.document_marker)"
                        />
                        <FieldError :errors="[errors.document_marker]" />
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
