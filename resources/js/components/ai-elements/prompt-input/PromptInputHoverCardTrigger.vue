<script setup lang="ts">
import { HoverCardTrigger } from '@/components/ui/hover-card';
</script>

<template>
    <HoverCardTrigger v-bind="$attrs">
        <slot />
    </HoverCardTrigger>
</template>
