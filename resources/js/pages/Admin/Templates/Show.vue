<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import PageFrame from '@/components/domain/PageFrame.vue';
import PaginatedDocument from '@/components/domain/PaginatedDocument.vue';
import { index as templatesIndex } from '@/routes/admin/templates';

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantilla', href: templatesIndex() }] },
});
</script>

<template>
    <Head title="Plantilla" />
    <PageFrame
        title="Plantilla de sílabo"
        description="Hoja base de la plantilla institucional."
        size="wide"
    >
        <div
            class="overflow-x-auto p-1 pb-4"
            aria-label="Hoja en blanco de la plantilla"
        >
            <PaginatedDocument />
        </div>
    </PageFrame>
</template>
