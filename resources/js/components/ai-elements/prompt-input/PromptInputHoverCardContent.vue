<script setup lang="ts">
import { HoverCardContent } from '@/components/ui/hover-card';
</script>

<template>
    <HoverCardContent align="start" v-bind="$attrs">
        <slot />
    </HoverCardContent>
</template>
