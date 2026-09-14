<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
    title?: string;
    url?: string;
    description?: string;
    class?: HTMLAttributes['class'];
}>();
</script>

<template>
    <div :class="cn('space-y-1', props.class)">
        <h4 v-if="title" class="truncate text-sm leading-tight font-medium">
            {{ title }}
        </h4>
        <p v-if="url" class="truncate text-xs break-all text-muted-foreground">
            {{ url }}
        </p>
        <p
            v-if="description"
            class="line-clamp-3 text-sm leading-relaxed text-muted-foreground"
        >
            {{ description }}
        </p>
        <slot />
    </div>
</template>
