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
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type TemplateField = {
    id: string;
    block_id: string;
    key: string;
    label: string;
    help: string | null;
    type: string;
    required: boolean;
    inherited: boolean;
    master_source: string | null;
    teacher_editable: boolean;
    ai_enabled: boolean;
    document_marker: string | null;
};

const props = defineProps<{
    templateVersionId: string;
    blockOptions: { id: string; label: string }[];
    fieldTypes: { value: string; label: string }[];
}>();

const open = ref(false);
const selectedField = ref<TemplateField | null>(null);
const inherited = ref(false);

const fieldForm = computed(() =>
    selectedField.value
        ? TemplateController.updateField.form({
              version: props.templateVersionId,
              field: selectedField.value.id,
          })
        : TemplateController.storeField.form(props.templateVersionId),
);

const title = computed(() =>
    selectedField.value ? 'Editar campo' : 'Agregar campo',
);

const edit = (field: TemplateField): void => {
    selectedField.value = field;
    open.value = true;
};

watch(open, (isOpen) => {
    if (isOpen) {
        inherited.value = selectedField.value?.inherited ?? false;

        return;
    }

    selectedField.value = null;
    inherited.value = false;
});

defineExpose({ edit });
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Agregar campo"
        :title="title"
        description="Las claves son estables. Las fórmulas no podrán publicarse hasta resolver PV-08."
    >
        <template #default="{ close }">
            <Form
                :key="selectedField?.id ?? 'new'"
                v-bind="fieldForm"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.block_id)">
                        <FieldLabel for="template-field-block" required>
                            Bloque
                        </FieldLabel>
                        <Select
                            name="block_id"
                            required
                            :default-value="
                                selectedField?.block_id ?? blockOptions[0]?.id
                            "
                        >
                            <SelectTrigger
                                id="template-field-block"
                                :aria-invalid="Boolean(errors.block_id)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="block in blockOptions"
                                        :key="block.id"
                                        :value="block.id"
                                    >
                                        {{ block.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.block_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.key)">
                        <FieldLabel for="template-field-key" required>
                            Clave estable
                        </FieldLabel>
                        <Input
                            id="template-field-key"
                            name="key"
                            :default-value="selectedField?.key"
                            required
                            :aria-invalid="Boolean(errors.key)"
                        />
                        <FieldError :errors="[errors.key]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.label)">
                        <FieldLabel for="template-field-label" required>
                            Etiqueta
                        </FieldLabel>
                        <Input
                            id="template-field-label"
                            name="label"
                            :default-value="selectedField?.label"
                            required
                            :aria-invalid="Boolean(errors.label)"
                        />
                        <FieldError :errors="[errors.label]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.type)">
                        <FieldLabel for="template-field-type" required>
                            Tipo
                        </FieldLabel>
                        <Select
                            name="type"
                            required
                            :default-value="selectedField?.type ?? 'short_text'"
                        >
                            <SelectTrigger
                                id="template-field-type"
                                :aria-invalid="Boolean(errors.type)"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="type in fieldTypes"
                                        :key="type.value"
                                        :value="type.value"
                                    >
                                        {{ type.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.type]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.help)">
                        <FieldLabel for="template-field-help">
                            Ayuda para el docente
                        </FieldLabel>
                        <Textarea
                            id="template-field-help"
                            name="help"
                            :default-value="selectedField?.help ?? ''"
                            :aria-invalid="Boolean(errors.help)"
                        />
                        <FieldError :errors="[errors.help]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.master_source)">
                        <FieldLabel
                            for="template-field-master-source"
                            :required="inherited"
                        >
                            Origen maestro (si es heredado)
                        </FieldLabel>
                        <Input
                            id="template-field-master-source"
                            name="master_source"
                            :default-value="selectedField?.master_source ?? ''"
                            :required="inherited"
                            :aria-invalid="Boolean(errors.master_source)"
                        />
                        <FieldError :errors="[errors.master_source]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.document_marker)">
                        <FieldLabel for="template-field-document-marker">
                            Marcador documental opcional
                        </FieldLabel>
                        <Input
                            id="template-field-document-marker"
                            name="document_marker"
                            :default-value="
                                selectedField?.document_marker ?? ''
                            "
                            :aria-invalid="Boolean(errors.document_marker)"
                        />
                        <FieldError :errors="[errors.document_marker]" />
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
                                    :default-value="
                                        selectedField?.required ?? false
                                    "
                                    :aria-invalid="Boolean(errors.required)"
                                />
                                <FieldLabel for="template-field-required">
                                    Obligatorio
                                </FieldLabel>
                                <FieldError :errors="[errors.required]" />
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
                                    Heredado de maestro
                                </FieldLabel>
                                <FieldError :errors="[errors.inherited]" />
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
                                        selectedField?.teacher_editable ?? true
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
                                    :default-value="
                                        selectedField?.ai_enabled ?? false
                                    "
                                    :aria-invalid="Boolean(errors.ai_enabled)"
                                />
                                <FieldLabel for="template-field-ai-enabled">
                                    Permite asistencia de IA
                                </FieldLabel>
                                <FieldError :errors="[errors.ai_enabled]" />
                            </Field>
                        </FieldGroup>
                    </FieldSet>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Check"
                        :label="
                            selectedField ? 'Guardar campo' : 'Agregar campo'
                        "
                    />
                    <FieldError :errors="[errors.field]" />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
