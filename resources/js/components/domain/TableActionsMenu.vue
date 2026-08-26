<script setup lang="ts">
import { MoreHorizontal } from '@lucide/vue';
import type { VNode } from 'vue';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

withDefaults(
    defineProps<{
        label: string;
        disabled?: boolean;
    }>(),
    {
        disabled: false,
    },
);

defineSlots<{
    default(): VNode[];
}>();
</script>

<template>
    <DropdownMenu>
        <DropdownMenuTrigger as-child>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="label"
                :disabled="disabled"
            >
                <MoreHorizontal data-icon="inline-start" aria-hidden="true" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
            <DropdownMenuGroup>
                <slot />
            </DropdownMenuGroup>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
