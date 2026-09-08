<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import PageFrame from '@/components/domain/PageFrame.vue';
import PaginatedDocument from '@/components/domain/PaginatedDocument.vue';
import { index as templatesIndex } from '@/routes/admin/templates';
import type { TemplateAppearance } from '@/types/configuration';

defineProps<{
    template: {
        appearance: TemplateAppearance;
    };
}>();

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
            class="min-w-0 overflow-x-auto p-1 pb-4"
            aria-label="Hoja vacía de la plantilla del sílabo"
        >
            <PaginatedDocument
                :orientation="template.appearance.orientation"
                :margin-cm="template.appearance.margin_cm"
                :font-family="template.appearance.font_family"
                :font-size="template.appearance.body_font_size"
                :text-color="template.appearance.text_color"
            />
        </div>
    </PageFrame>
</template>
