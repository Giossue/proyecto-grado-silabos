<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from '@lucide/vue';
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSidebar } from './utils';

const props = defineProps<{
    class?: HTMLAttributes['class'];
}>();

const { isMobile, state, toggleSidebar } = useSidebar();

const collapsed = computed(() => isMobile.value || state.value === 'collapsed');

// Dice lo que va a pasar al pulsar, no lo que hay ahora.
const label = computed(() => (collapsed.value ? 'Mostrar menú' : 'Ocultar menú'));
</script>

<template>
    <Tooltip>
        <TooltipTrigger as-child>
            <Button
                data-sidebar="trigger"
                data-slot="sidebar-trigger"
                variant="ghost"
                size="icon"
                :aria-label="label"
                :class="cn('h-7 w-7', props.class)"
                @click="toggleSidebar"
            >
                <PanelLeftOpen v-if="collapsed" aria-hidden="true" />
                <PanelLeftClose v-else aria-hidden="true" />
            </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{{ label }}</TooltipContent>
    </Tooltip>
</template>
