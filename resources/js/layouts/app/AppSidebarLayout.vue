<script setup lang="ts">
import { provide, ref, toRef } from 'vue';
import AppContent from '@/components/AppContent.vue';
import AppShell from '@/components/AppShell.vue';
import AppSidebar from '@/components/AppSidebar.vue';
import AppSidebarHeader from '@/components/AppSidebarHeader.vue';
import TemporaryPasswordDialog from '@/components/TemporaryPasswordDialog.vue';
import { Toaster } from '@/components/ui/sonner';
import { breadcrumbsKey, pageTitleKey } from '@/composables/usePageBreadcrumbs';
import type { BreadcrumbItem } from '@/types';

type Props = {
    breadcrumbs?: BreadcrumbItem[];
};

const props = withDefaults(defineProps<Props>(), {
    breadcrumbs: () => [],
});

provide(breadcrumbsKey, toRef(props, 'breadcrumbs'));

/*
 * El nombre de la pantalla lo escribe el contenido y lo dibuja el encabezado. Viaja por
 * aquí para que ninguna de las veintisiete pantallas tenga que declararlo dos veces.
 */
const pageTitle = ref('');

provide(pageTitleKey, pageTitle);
</script>

<template>
    <AppShell variant="sidebar">
        <AppSidebar />
        <AppContent variant="sidebar" class="overflow-x-hidden">
            <AppSidebarHeader
                :breadcrumbs="breadcrumbs"
                :page-title="pageTitle"
            />
            <slot />
        </AppContent>
        <Toaster />
        <TemporaryPasswordDialog />
    </AppShell>
</template>
