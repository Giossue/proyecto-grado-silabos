<script setup lang="ts">
import { ref } from 'vue';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

defineProps<{
    modelValue: string;
    label: string;
    tooltip: string;
    disabled: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: string];
}>();

const tooltipOpen = ref(false);

const updateValue = (value: unknown): void => {
    if (typeof value === 'string') {
        emit('update:modelValue', value);
    }
};
</script>

<template>
    <Tooltip v-model:open="tooltipOpen">
        <Select
            :model-value="modelValue"
            :disabled="disabled"
            @update:model-value="updateValue"
        >
            <SelectTrigger
                size="sm"
                class="relative w-12 gap-1 px-2"
                :aria-label="label"
                @focus="tooltipOpen = true"
                @blur="tooltipOpen = false"
            >
                <TooltipTrigger as-child>
                    <span
                        class="absolute inset-0 z-10 flex items-center justify-start ps-2 pe-5"
                    >
                        <slot name="icon" />
                    </span>
                </TooltipTrigger>
                <SelectValue class="sr-only" />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <slot />
                </SelectGroup>
            </SelectContent>
        </Select>
        <TooltipContent>{{ tooltip }}</TooltipContent>
    </Tooltip>
</template>
