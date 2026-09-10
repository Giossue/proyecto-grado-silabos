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
        showLabel?: boolean;
        tooltip?: boolean;
        tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
    }>(),
    {
        variant: 'outline',
        size: 'icon-sm',
        buttonClass: undefined,
        showLabel: false,
        tooltip: true,
        tooltipSide: 'left',
    },
);

const emit = defineEmits<{
    'update:open': [value: boolean];
}>();

const helpOpen = ref(false);
</script>

<template>
    <Popover
        v-if="$slots.trigger"
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <slot name="trigger" />
        <slot />
    </Popover>
    <Tooltip
        v-else
        v-model:open="helpOpen"
        :disabled="!tooltip"
        :disable-hoverable-content="true"
    >
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
                            :class="['text-foreground', buttonClass]"
                            :aria-label="label"
                            @focus="helpOpen = tooltip"
                            @blur="helpOpen = false"
                        >
                            <slot name="icon" />
                            <span v-if="showLabel">{{ label }}</span>
                        </Button>
                    </PopoverTrigger>
                    <slot />
                </Popover>
            </span>
        </TooltipTrigger>
        <TooltipContent
            v-if="tooltip"
            paper
            :side="tooltipSide"
            :side-offset="8"
        >
            {{ label }}
        </TooltipContent>
    </Tooltip>
</template>
