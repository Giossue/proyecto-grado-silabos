<script setup lang="ts">
import PurgeConfirmationDialog from '@/components/domain/PurgeConfirmationDialog.vue';
import AppLayout from '@/layouts/app/AppSidebarLayout.vue';
import type { BreadcrumbItem } from '@/types';

const { breadcrumbs = [] } = defineProps<{
    breadcrumbs?: BreadcrumbItem[];
}>();
</script>

<template>
    <AppLayout :breadcrumbs="breadcrumbs">
        <slot />
    </AppLayout>
    <!-- Diálogo único: el servidor avisa cuando un cambio borra sílabos en curso. -->
    <PurgeConfirmationDialog />
</template>
