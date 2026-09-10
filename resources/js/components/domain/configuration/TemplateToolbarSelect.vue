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
        <TooltipTrigger as-child>
            <span class="inline-flex">
                <Select
                    :model-value="modelValue"
                    :disabled="disabled"
                    @update:model-value="updateValue"
                >
                    <SelectTrigger
                        size="sm"
                        class="relative !size-8 justify-center !gap-0 !border-0 !bg-transparent !p-0 !shadow-none hover:!bg-accent hover:text-accent-foreground dark:!bg-transparent dark:hover:!bg-accent/50 [&>svg]:hidden"
                        :aria-label="label"
                        @focus="tooltipOpen = true"
                        @blur="tooltipOpen = false"
                    >
                        <span
                            class="absolute inset-0 z-10 flex items-center justify-center"
                        >
                            <slot name="icon" />
                        </span>
                        <SelectValue class="sr-only" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <slot />
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </span>
        </TooltipTrigger>
        <TooltipContent>{{ tooltip }}</TooltipContent>
    </Tooltip>
</template>
