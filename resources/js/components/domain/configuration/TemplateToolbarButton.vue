<script setup lang="ts">
import { ref } from 'vue';
import { Button } from '@/components/ui/button';
import type { ButtonVariants } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

withDefaults(
    defineProps<{
        label: string;
        tooltip?: string;
        disabled?: boolean;
        pressed?: boolean;
        variant?: ButtonVariants['variant'];
    }>(),
    {
        tooltip: undefined,
        disabled: false,
        pressed: undefined,
        variant: 'ghost',
    },
);

const emit = defineEmits<{
    click: [event: MouseEvent];
}>();

const open = ref(false);
</script>

<template>
    <Tooltip v-model:open="open">
        <TooltipTrigger as-child>
            <span class="inline-flex">
                <Button
                    type="button"
                    size="icon-sm"
                    :variant="variant"
                    :disabled="disabled"
                    :aria-label="label"
                    :aria-pressed="pressed"
                    @focus="open = true"
                    @blur="open = false"
                    @click="emit('click', $event)"
                >
                    <slot />
                </Button>
            </span>
        </TooltipTrigger>
        <TooltipContent>{{ tooltip ?? label }}</TooltipContent>
    </Tooltip>
</template>
