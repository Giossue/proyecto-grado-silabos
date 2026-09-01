<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { CurriculumFieldDefinition } from '@/types/academic';

const props = defineProps<{
    field: CurriculumFieldDefinition;
    inputId: string;
    value: number | string;
    error?: string;
    class?: HTMLAttributes['class'];
}>();

const emit = defineEmits<{
    'update:value': [value: unknown];
}>();

const inputName = computed(() =>
    props.field.system_key
        ? props.field.system_key
        : `custom_values[${props.field.id}]`,
);
const inputType = computed(() =>
    props.field.type === 'number' || props.field.type === 'integer'
        ? 'number'
        : 'text',
);
const isCalculatedTotal = computed(
    () => props.field.system_key === 'total_hours',
);
</script>

<template>
    <Field :class="props.class" :data-invalid="Boolean(error)">
        <FieldLabel :for="inputId" required>
            {{ field.label }}
        </FieldLabel>
        <Select
            v-if="field.type === 'boolean'"
            :name="inputName"
            :model-value="String(value)"
            required
            @update:model-value="emit('update:value', $event)"
        >
            <SelectTrigger
                :id="inputId"
                class="w-full"
                :aria-invalid="Boolean(error)"
            >
                <SelectValue placeholder="Seleccione una opción" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="true">Sí</SelectItem>
                <SelectItem value="false">No</SelectItem>
            </SelectContent>
        </Select>
        <Input
            v-else
            :id="inputId"
            :name="inputName"
            :type="inputType"
            :step="field.type === 'number' ? '0.01' : undefined"
            :min="inputType === 'number' ? 0 : undefined"
            :model-value="value"
            :placeholder="
                field.type === 'text' ? `Ej. ${field.label}` : undefined
            "
            :readonly="isCalculatedTotal"
            :aria-readonly="isCalculatedTotal || undefined"
            required
            :aria-invalid="Boolean(error)"
            @update:model-value="emit('update:value', $event)"
        />
        <FieldDescription v-if="field.system_label">
            {{ field.system_label }}
        </FieldDescription>
        <FieldError :errors="[error]" />
    </Field>
</template>
