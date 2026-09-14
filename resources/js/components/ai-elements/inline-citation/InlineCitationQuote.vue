<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
    class?: HTMLAttributes['class'];
}>();
</script>

<template>
    <blockquote
        :class="
            cn(
                'border-l-2 border-muted pl-3 text-sm text-muted-foreground italic',
                props.class,
            )
        "
    >
        <slot />
    </blockquote>
</template>
