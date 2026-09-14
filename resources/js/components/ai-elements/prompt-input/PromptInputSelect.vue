<script setup lang="ts">
import { Select } from '@/components/ui/select';
</script>

<template>
    <Select v-bind="$attrs">
        <slot />
    </Select>
</template>
