<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { computed, ref, watch } from 'vue';
import ReviewController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ReviewController';
import FormSheet from '@/components/domain/FormSheet.vue';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type ReviewSection = {
    key: string;
    title: string;
    blocks: {
        fields: { key: string; label: string }[];
    }[];
};

const props = defineProps<{
    revisionId: string;
    sections: ReviewSection[];
}>();

const open = ref(false);
const selectedSection = ref('__document');
const selectedField = ref('__section');

const currentSection = computed(() =>
    props.sections.find((section) => section.key === selectedSection.value),
);
const currentFields = computed(
    () => currentSection.value?.blocks.flatMap((block) => block.fields) ?? [],
);

const chooseSection = (value: unknown): void => {
    if (typeof value === 'string') {
        selectedSection.value = value;
        selectedField.value = '__section';
    }
};

watch(open, (isOpen) => {
    if (!isOpen) {
        selectedSection.value = '__document';
        selectedField.value = '__section';
    }
});
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Nueva observación"
        title="Nueva observación"
        description="Vincule la observación al documento completo, a una sección o a un campo de esta revisión."
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    ReviewController.storeObservation.form(props.revisionId)
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <input
                    type="hidden"
                    name="section_key"
                    :value="
                        selectedSection === '__document' ? '' : selectedSection
                    "
                />
                <input
                    type="hidden"
                    name="field_key"
                    :value="selectedField === '__section' ? '' : selectedField"
                />

                <FieldGroup>
                    <Field
                        :data-invalid="
                            Boolean(errors.location || errors.section_key)
                        "
                    >
                        <FieldLabel for="observation-location">
                            Ubicación
                        </FieldLabel>
                        <Select
                            :model-value="selectedSection"
                            @update:model-value="chooseSection"
                        >
                            <SelectTrigger
                                id="observation-location"
                                :aria-invalid="
                                    Boolean(
                                        errors.location || errors.section_key,
                                    )
                                "
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="__document">
                                        Documento completo
                                    </SelectItem>
                                    <SelectItem
                                        v-for="section in props.sections"
                                        :key="section.key"
                                        :value="section.key"
                                    >
                                        {{ section.title }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError
                            :errors="[errors.location, errors.section_key]"
                        />
                    </Field>

                    <Field
                        v-if="currentSection"
                        :data-invalid="Boolean(errors.field_key)"
                    >
                        <FieldLabel for="observation-field">
                            Campo (opcional)
                        </FieldLabel>
                        <Select v-model="selectedField">
                            <SelectTrigger
                                id="observation-field"
                                :aria-invalid="Boolean(errors.field_key)"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="__section">
                                        Sección completa
                                    </SelectItem>
                                    <SelectItem
                                        v-for="field in currentFields"
                                        :key="field.key"
                                        :value="field.key"
                                    >
                                        {{ field.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.field_key]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.content)">
                        <FieldLabel for="observation-content">
                            Observación
                        </FieldLabel>
                        <Textarea
                            id="observation-content"
                            name="content"
                            rows="5"
                            required
                            placeholder="Indique qué debe revisarse y cómo comprobarlo."
                            :aria-invalid="Boolean(errors.content)"
                        />
                        <FieldError :errors="[errors.content]" />
                    </Field>

                    <Field orientation="horizontal">
                        <Button type="submit" :disabled="processing">
                            <Spinner v-if="processing" />
                            Registrar observación
                        </Button>
                    </Field>
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
