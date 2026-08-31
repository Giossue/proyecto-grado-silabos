<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    value: number;
    description: string;
}>();

const completion = computed(() => Math.min(100, Math.max(0, props.value)));
</script>

<template>
    <section
        class="space-y-3 border-y py-4"
        aria-label="Completitud del sílabo"
    >
        <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
                <h2 class="text-sm font-medium">Completitud</h2>
                <p class="text-sm text-muted-foreground">
                    {{ description }}
                </p>
            </div>
            <span class="shrink-0 text-sm font-semibold tabular-nums">
                {{ completion.toFixed(0) }} %
            </span>
        </div>
        <div
            class="h-2 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label="Campos obligatorios completos"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="completion"
        >
            <div
                class="h-full rounded-full bg-primary transition-[width]"
                :style="{ width: `${completion}%` }"
            />
        </div>
    </section>
</template>
