<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { ref } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
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
import { Spinner } from '@/components/ui/spinner';

defineProps<{
    templateVersionId: string;
    sectionId: string;
    sectionTitle: string;
    position: number;
    blockTypes: { value: string; label: string }[];
}>();

const emit = defineEmits<{
    cancel: [];
    success: [];
}>();

const fieldName = ref('');
const fieldType = ref('text');

const keyFor = (value: string): string => {
    const normalized = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized === '' || !/^[a-z]/.test(normalized)
        ? `elemento_${normalized || 'nuevo'}`
        : normalized;
};
</script>

<template>
    <Form
        v-bind="TemplateController.storeField.form(templateVersionId)"
        :options="{ preserveScroll: true }"
        v-slot="{ errors, processing }"
        @success="emit('success')"
    >
        <input type="hidden" name="section_id" :value="sectionId" />
        <input type="hidden" name="position" :value="position" />
        <input
            type="hidden"
            name="key"
            :value="keyFor(`${sectionTitle} ${fieldName}`)"
        />
        <input type="hidden" name="required" value="0" />
        <input type="hidden" name="inherited" value="0" />
        <input type="hidden" name="teacher_editable" value="1" />
        <input type="hidden" name="ai_enabled" value="0" />
        <Card class="border-dashed">
            <CardHeader
                ><CardTitle class="text-base"
                    >Nuevo campo</CardTitle
                ></CardHeader
            >
            <CardContent>
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.label)">
                        <FieldLabel for="new-field-name" required
                            >Nombre del campo</FieldLabel
                        >
                        <Input
                            id="new-field-name"
                            v-model="fieldName"
                            name="label"
                            placeholder="Ej. Actividades de evaluación"
                            required
                            :aria-invalid="Boolean(errors.label)"
                        />
                        <FieldError :errors="[errors.label]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.content_type)">
                        <FieldLabel for="new-field-type" required
                            >Tipo de contenido</FieldLabel
                        >
                        <Select
                            v-model="fieldType"
                            name="content_type"
                            required
                        >
                            <SelectTrigger
                                id="new-field-type"
                                :aria-invalid="Boolean(errors.content_type)"
                                ><SelectValue placeholder="Seleccione un tipo"
                            /></SelectTrigger>
                            <SelectContent
                                ><SelectGroup
                                    ><SelectItem
                                        v-for="type in blockTypes"
                                        :key="type.value"
                                        :value="type.value"
                                        >{{ type.label }}</SelectItem
                                    ></SelectGroup
                                ></SelectContent
                            >
                        </Select>
                        <FieldError :errors="[errors.content_type]" />
                    </Field>
                </FieldGroup>
                <div class="mt-4 flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        @click="emit('cancel')"
                        >Cancelar</Button
                    >
                    <Button type="submit" :disabled="processing"
                        ><Spinner v-if="processing" />Agregar campo</Button
                    >
                </div>
            </CardContent>
        </Card>
    </Form>
</template>
