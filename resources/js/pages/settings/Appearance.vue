<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import AppearanceTabs from '@/components/AppearanceTabs.vue';
import Heading from '@/components/Heading.vue';
import { edit } from '@/routes/appearance';

defineOptions({
    layout: {
        breadcrumbs: [
            {
                title: 'Apariencia',
                href: edit(),
            },
        ],
    },
});
</script>

<template>
    <Head title="Apariencia" />

    <div class="space-y-6">
        <Heading
            variant="small"
            title="Apariencia"
            description="Configure el tema visual de su cuenta"
        />
        <AppearanceTabs />
    </div>
</template>
