<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { ref } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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
    position: number;
    blockTypes: { value: string; label: string }[];
}>();

const emit = defineEmits<{
    cancel: [];
    success: [];
}>();

const blockName = ref('');
const firstFieldName = ref('');
const firstFieldType = ref('text');

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
        v-bind="TemplateController.storeSection.form(templateVersionId)"
        :options="{ preserveScroll: true }"
        v-slot="{ errors, processing }"
        @success="emit('success')"
    >
        <input type="hidden" name="key" :value="keyFor(blockName)" />
        <input type="hidden" name="position" :value="position" />
        <input
            type="hidden"
            name="first_field_key"
            :value="keyFor(`${blockName} ${firstFieldName}`)"
        />
        <Card class="border-dashed">
            <CardHeader>
                <CardTitle>Nuevo bloque</CardTitle>
                <CardDescription>
                    Un bloque organiza los campos de una parte del sílabo.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.title)">
                        <FieldLabel for="new-block-name" required>
                            Nombre del bloque
                        </FieldLabel>
                        <Input
                            id="new-block-name"
                            v-model="blockName"
                            name="title"
                            placeholder="Ej. Recursos y materiales"
                            required
                            :aria-invalid="Boolean(errors.title)"
                        />
                        <FieldError :errors="[errors.title]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.first_field_label)">
                        <FieldLabel for="new-block-field" required>
                            Nombre del primer campo
                        </FieldLabel>
                        <Input
                            id="new-block-field"
                            v-model="firstFieldName"
                            name="first_field_label"
                            placeholder="Ej. Recursos principales"
                            required
                            :aria-invalid="Boolean(errors.first_field_label)"
                        />
                        <FieldError :errors="[errors.first_field_label]" />
                    </Field>
                    <Field
                        :data-invalid="Boolean(errors.first_field_content_type)"
                    >
                        <FieldLabel for="new-block-field-type" required>
                            Tipo de contenido del primer campo
                        </FieldLabel>
                        <Select
                            v-model="firstFieldType"
                            name="first_field_content_type"
                            required
                        >
                            <SelectTrigger
                                id="new-block-field-type"
                                :aria-invalid="
                                    Boolean(errors.first_field_content_type)
                                "
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="type in blockTypes"
                                        :key="type.value"
                                        :value="type.value"
                                    >
                                        {{ type.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError
                            :errors="[errors.first_field_content_type]"
                        />
                    </Field>
                </FieldGroup>
                <div class="mt-4 flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        @click="emit('cancel')"
                    >
                        Cancelar
                    </Button>
                    <Button type="submit" :disabled="processing">
                        <Spinner v-if="processing" />Agregar bloque
                    </Button>
                </div>
            </CardContent>
        </Card>
    </Form>
</template>
