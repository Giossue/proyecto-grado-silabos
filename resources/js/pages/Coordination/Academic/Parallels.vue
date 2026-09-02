<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import OfferingRecordSheet from '@/components/domain/academic/OfferingRecordSheet.vue';
import OfferingsTab from '@/components/domain/academic/OfferingsTab.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as parallelsIndex } from '@/routes/coordination/academic/parallels';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Paralelos', href: parallelsIndex() }],
    },
});

defineProps<
    Pick<
        AcademicStructureProps,
        'career' | 'offerings' | 'parallels' | 'options'
    >
>();
</script>

<template>
    <Head title="Paralelos" />

    <PageFrame
        title="Paralelos"
        :description="`Paralelos de las ofertas académicas de ${career.name}.`"
    >
        <template #actions>
            <OfferingRecordSheet entity="paralelo" :options="options" />
        </template>

        <OfferingsTab
            section="parallels"
            :offerings="offerings"
            :parallels="parallels"
            :options="options"
        />
    </PageFrame>
</template>
