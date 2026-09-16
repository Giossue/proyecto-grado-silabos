<script setup lang="ts">
import { Button } from '@/components/ui/button';
import type { CurriculumBuilderProps } from '@/types/academic';

defineProps<Pick<CurriculumBuilderProps, 'curriculum'>>();
const emit = defineEmits<{ configure: [] }>();
</script>

<template>
    <Button type="button" variant="outline" @click="emit('configure')">
        Configurar malla
    </Button>
</template>
