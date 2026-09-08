<script setup lang="ts">
import { ref } from 'vue';
import type { HTMLAttributes } from 'vue';
import { Button } from '@/components/ui/button';
import type { ButtonVariants } from '@/components/ui/button';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

withDefaults(
    defineProps<{
        open: boolean;
        label: string;
        variant?: ButtonVariants['variant'];
        size?: ButtonVariants['size'];
        buttonClass?: HTMLAttributes['class'];
    }>(),
    {
        variant: 'outline',
        size: 'icon-sm',
        buttonClass: undefined,
    },
);

const emit = defineEmits<{
    'update:open': [value: boolean];
}>();

const helpOpen = ref(false);
</script>

<template>
    <Tooltip v-model:open="helpOpen">
        <TooltipTrigger as-child>
            <span class="inline-flex">
                <Popover
                    :open="open"
                    @update:open="emit('update:open', $event)"
                >
                    <PopoverTrigger as-child>
                        <Button
                            type="button"
                            :variant="variant"
                            :size="size"
                            :class="buttonClass"
                            :aria-label="label"
                            @focus="helpOpen = true"
                            @blur="helpOpen = false"
                        >
                            <slot name="icon" />
                        </Button>
                    </PopoverTrigger>
                    <slot />
                </Popover>
            </span>
        </TooltipTrigger>
        <TooltipContent>{{ label }}</TooltipContent>
    </Tooltip>
</template>
