<script setup lang="ts">
import { router } from '@inertiajs/vue3';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { index as auditIndex } from '@/routes/admin/audit';
import { index as jobsIndex } from '@/routes/admin/jobs';

const props = defineProps<{ active: 'jobs' | 'activity' }>();

function navigate(value: string | number) {
    if (value !== props.active) {
        router.get(value === 'jobs' ? jobsIndex.url() : auditIndex.url());
    }
}
</script>

<template>
    <Tabs
        :model-value="active"
        activation-mode="manual"
        @update:model-value="navigate"
    >
        <TabsList aria-label="Secciones de auditoría">
            <TabsTrigger value="jobs">Procesos</TabsTrigger>
            <TabsTrigger value="activity">Registro de actividad</TabsTrigger>
        </TabsList>
        <TabsContent :value="active"><slot /></TabsContent>
    </Tabs>
</template>
