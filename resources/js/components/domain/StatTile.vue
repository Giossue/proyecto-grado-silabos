<script setup lang="ts">
import type { Component } from 'vue';
import { computed } from 'vue';
import { Card, CardContent } from '@/components/ui/card';

const props = defineProps<{
    label: string;
    value: number;
    /** Unidad corta detrás del número: «%», «días». */
    suffix?: string;
    hint?: string;
    icon?: Component;
}>();

// Figuras proporcionales y compactado solo cuando el número deja de leerse de un
// vistazo; `tabular-nums` queda para columnas que deben alinearse.
const formatted = computed(() =>
    new Intl.NumberFormat('es-EC', {
        notation: props.value >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: 1,
    }).format(props.value),
);
</script>

<template>
    <Card>
        <CardContent class="flex flex-col gap-1 py-5">
            <div class="flex items-center gap-2 text-muted-foreground">
                <component
                    :is="icon"
                    v-if="icon"
                    class="size-4"
                    aria-hidden="true"
                />
                <span class="text-sm">{{ label }}</span>
            </div>
            <span class="text-3xl leading-none font-semibold text-foreground">
                {{ formatted
                }}<span
                    v-if="suffix"
                    class="ml-1 text-base font-medium text-muted-foreground"
                    >{{ suffix }}</span
                >
            </span>
            <span v-if="hint" class="text-xs text-muted-foreground">
                {{ hint }}
            </span>
        </CardContent>
    </Card>
</template>
