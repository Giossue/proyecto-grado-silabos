<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { Button } from '@/components/ui/button';

defineProps<{
    data: {
        cycle: number;
        disabled: boolean;
    };
}>();

const emit = defineEmits<{
    add: [cycle: number];
}>();
</script>

<template>
    <Button
        type="button"
        variant="outline"
        class="nodrag nopan w-64 border-dashed"
        :disabled="data.disabled"
        @click="emit('add', data.cycle)"
    >
        <Plus data-icon="inline-start" aria-hidden="true" />
        Agregar materia
    </Button>
</template>
